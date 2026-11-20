"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";

import type { BillingSource } from "@/lib/billing/limits";
import { isPlanId } from "@/lib/billing/plans";
import { buyPlanWithBalance, InsufficientBalanceError, type PlanQuote, PlanNotAvailableError } from "@/lib/billing/purchases";
import { createApiKey } from "@/lib/billing/workspaces";
import { getLiveCatalog } from "@/lib/catalog/live";
import { actionSession } from "@/lib/dashboard/session";
import { exportWorkspace } from "@/lib/dashboard/queries";
import { getDb } from "@/lib/db/client";
import { apiKeys, workspaces } from "@/lib/db/schema";
import { readBitcoinConfig } from "@/lib/payments/bitcoin/config";
import {
  BitcoinAddressMismatchError, bitcoinDeps, type BitcoinDeps, createBitcoinQuote, ensureBitcoinAddress, getBitcoinState, QuoteError,
  type QuoteRequest, scanBitcoin, simulateBitcoinConfirmation, simulateBitcoinPayment,
} from "@/lib/payments/bitcoin/orders";
import { RateUnavailableError } from "@/lib/payments/bitcoin/rates";
import { type BitcoinView, bitcoinView } from "@/lib/payments/bitcoin/view";
import { paymentsAvailable, readCryptoConfig } from "@/lib/payments/crypto/config";
import {
  depositChains, ensureDepositAddresses, getDepositState, MIN_DEPOSIT_MICRO_USD, scanDeposits, simulateDeposit,
} from "@/lib/payments/crypto/deposits";
import { type DepositView, depositView } from "@/lib/payments/crypto/view";

/** Los errores son claves de `dashboard.*` o `dashboard.keys.*`: el cliente los traduce. */
export type ActionError =
  | "error" | "paymentsUnavailable" | "nameRequired" | "limitInvalid" | "pickOne" | "tooMany" | "planActive" | "insufficientBalance"
  | "bitcoinRate" | "bitcoinAmount" | "bitcoinCovered" | "bitcoinTooMany";

export type ActionResult = { ok: true } | { ok: false; error: ActionError };
export type KeyResult = { ok: true; key: string; name: string } | { ok: false; error: ActionError } | null;

const BILLING_SOURCES: readonly BillingSource[] = ["plan_then_prepaid", "plan_only", "prepaid_only"];
const MAX_LIMIT_MICRO_USD = BigInt(1_000_000) * BigInt(1_000_000);

/** `12.5` → 12_500_000 µUSD. Solo hasta centavos: un límite no necesita más precisión. */
function parseUsd(value: FormDataEntryValue | null): bigint | null {
  const text = String(value ?? "").trim().replace(",", ".");
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return BigInt(match[1]) * BigInt(1_000_000) + BigInt((match[2] ?? "").padEnd(2, "0")) * BigInt(10_000);
}

async function ownKey(workspaceId: string, keyId: string) {
  const [key] = await getDb().select().from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt)));
  return key ?? null;
}

export async function createKeyAction(_previous: KeyResult, form: FormData): Promise<KeyResult> {
  const { workspaceId } = await actionSession();
  const name = String(form.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "nameRequired" };
  const rawLimit = String(form.get("limit") ?? "").trim();
  const limit = rawLimit ? parseUsd(rawLimit) : null;
  if (rawLimit && (limit === null || limit > MAX_LIMIT_MICRO_USD)) return { ok: false, error: "limitInvalid" };
  const source = String(form.get("source"));
  const billingSource = BILLING_SOURCES.includes(source as BillingSource) ? source as BillingSource : "plan_then_prepaid";
  let allowedModels: string[] | null = null;
  if (form.get("models") === "pick") {
    const known = new Set((await getLiveCatalog()).map((model) => model.id));
    allowedModels = [...new Set(form.getAll("model").map(String))].filter((id) => known.has(id));
    if (allowedModels.length === 0) return { ok: false, error: "pickOne" };
  }
  try {
    const created = await createApiKey(getDb(), { workspaceId, name, spendLimitMicroUsd: limit, billingSource, allowedModels });
    refresh();
    return { ok: true, key: created.key, name };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message.includes("25 active") ? "tooMany" : "error" };
  }
}

export async function revokeKeyAction(keyId: string): Promise<ActionResult> {
  const { workspaceId } = await actionSession();
  if (!await ownKey(workspaceId, keyId)) return { ok: false, error: "error" };
  await getDb().update(apiKeys).set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspaceId, workspaceId)));
  refresh();
  return { ok: true };
}

/** Key nueva con los mismos ajustes; la anterior sigue 24 horas (docs/05 › Rotar). */
export async function rotateKeyAction(keyId: string): Promise<KeyResult> {
  const { workspaceId } = await actionSession();
  const key = await ownKey(workspaceId, keyId);
  if (!key || key.expiresAt !== null) return { ok: false, error: "error" };
  try {
    const created = await createApiKey(getDb(), {
      workspaceId, name: key.name, spendLimitMicroUsd: key.spendLimitMicroUsd,
      billingSource: key.billingSource, allowedModels: key.allowedModels,
    });
    await getDb().update(apiKeys).set({ expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }).where(eq(apiKeys.id, key.id));
    refresh();
    return { ok: true, key: created.key, name: key.name };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message.includes("25 active") ? "tooMany" : "error" };
  }
}

export async function updateOverflowAction(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { workspaceId } = await actionSession();
  const cap = parseUsd(form.get("cap"));
  if (cap === null || cap > MAX_LIMIT_MICRO_USD) return { ok: false, error: "limitInvalid" };
  await getDb().update(workspaces).set({
    overflowMode: form.get("mode") === "stop" ? "stop" : "continue",
    overflowCredits: form.get("credits") === "on",
    overflowCapMicroUsd: cap,
  }).where(eq(workspaces.id, workspaceId));
  refresh();
  return { ok: true };
}

export type DepositResult = { ok: true; deposit: DepositView } | { ok: false; error: ActionError };

/**
 * El depósito en USDC del workspace (ADR-0058): sus direcciones, lo que viene en camino y el saldo. Antes
 * revisa sus direcciones en la cadena y acredita lo que ya se confirmó; el diálogo la llama cada pocos segundos.
 */
export async function depositStatusAction(): Promise<DepositResult> {
  const { workspaceId } = await actionSession();
  const config = readCryptoConfig();
  if (!paymentsAvailable(config)) return { ok: false, error: "paymentsUnavailable" };
  const chains = depositChains(config);
  const db = getDb();
  // Las direcciones existen antes de revisar: la primera consulta de un workspace ya las mira en la cadena.
  await ensureDepositAddresses(db, chains, workspaceId);
  await scanDeposits(db, chains, Date.now(), { workspaceId });
  return { ok: true, deposit: depositView(config, chains, await getDepositState(db, chains, workspaceId, Date.now())) };
}

/** Solo en desarrollo local: acredita un depósito sin cadena. */
export async function simulateDepositAction(amount: string): Promise<DepositResult> {
  const { workspaceId } = await actionSession();
  const config = readCryptoConfig();
  if (!config.simulate) return { ok: false, error: "error" };
  const micros = /^\d{1,13}$/.test(amount) ? BigInt(amount) : null;
  if (micros === null || micros < MIN_DEPOSIT_MICRO_USD) return { ok: false, error: "error" };
  const chains = depositChains(config);
  await simulateDeposit(getDb(), workspaceId, micros, Date.now());
  return { ok: true, deposit: depositView(config, chains, await getDepositState(getDb(), chains, workspaceId, Date.now())) };
}

export type BitcoinResult = { ok: true; bitcoin: BitcoinView } | { ok: false; error: ActionError };

const QUOTE_ERRORS: Record<QuoteError["code"], ActionError> = {
  amount: "bitcoinAmount", covered: "bitcoinCovered", plan: "planActive", tooMany: "bitcoinTooMany",
};

/** Corre `work` con lo de Bitcoin y devuelve el estado del workspace. Una dirección que ya no sale de la xpub apaga Bitcoin. */
async function withBitcoin(workspaceId: string, work: (deps: BitcoinDeps, now: number) => Promise<void>): Promise<BitcoinResult> {
  const deps = bitcoinDeps(readBitcoinConfig());
  if (!deps) return { ok: false, error: "paymentsUnavailable" };
  const db = getDb();
  try {
    await work(deps, Date.now());
    const now = Date.now();
    return { ok: true, bitcoin: bitcoinView(deps, await getBitcoinState(db, deps, workspaceId, now), now) };
  } catch (error) {
    if (error instanceof BitcoinAddressMismatchError) return { ok: false, error: "paymentsUnavailable" };
    if (error instanceof RateUnavailableError) return { ok: false, error: "bitcoinRate" };
    if (error instanceof QuoteError) return { ok: false, error: QUOTE_ERRORS[error.code] };
    throw error;
  }
}

/**
 * El pago en Bitcoin del workspace (ADR-0063): su dirección, la cotización vigente y lo que va en camino.
 * Antes lee sus direcciones en la cadena y acredita lo confirmado; el diálogo la llama cada pocos segundos.
 */
export async function bitcoinStatusAction(): Promise<BitcoinResult> {
  const { workspaceId } = await actionSession();
  return withBitcoin(workspaceId, async (deps, now) => {
    await ensureBitcoinAddress(getDb(), deps, workspaceId);
    await scanBitcoin(getDb(), deps, now, { workspaceId });
  });
}

/** Abre una cotización: de créditos por un monto, o de lo que falta para un plan. El precio lo pone el servidor. */
export async function bitcoinQuoteAction(input: { intent: "topup"; amount: string } | { intent: "plan"; planId: string }): Promise<BitcoinResult> {
  const { workspaceId } = await actionSession();
  let request: QuoteRequest;
  if (input.intent === "topup") {
    if (!/^\d{1,13}$/.test(input.amount)) return { ok: false, error: "bitcoinAmount" };
    request = { intent: "topup", amountMicroUsd: BigInt(input.amount) };
  } else {
    if (!isPlanId(input.planId)) return { ok: false, error: "error" };
    request = { intent: "plan", planId: input.planId };
  }
  return withBitcoin(workspaceId, async (deps, now) => {
    await createBitcoinQuote(getDb(), deps, workspaceId, request, now);
  });
}

/** Solo en desarrollo local: un pago visto en la red, o su confirmación, sin cadena. */
export async function simulateBitcoinAction(stage: "seen" | "confirmed"): Promise<BitcoinResult> {
  const { workspaceId } = await actionSession();
  const config = readBitcoinConfig();
  if (!config?.simulate) return { ok: false, error: "error" };
  return withBitcoin(workspaceId, async (deps, now) => {
    if (stage === "seen") await simulateBitcoinPayment(getDb(), deps, workspaceId, now);
    else await simulateBitcoinConfirmation(getDb(), deps, workspaceId, now);
  });
}

export type PurchaseResult =
  | { ok: true; mode: PlanQuote["mode"]; amountMicroUsd: string }
  /** Con `insufficientBalance`: cuánto falta depositar y el saldo de ese momento. */
  | { ok: false; error: ActionError; missingMicroUsd?: string; balanceMicroUsd?: string };

/** Compra un plan con el saldo. El precio lo pone el servidor: el cliente solo dice qué plan quiere. */
export async function buyPlanAction(planId: string): Promise<PurchaseResult> {
  const { workspaceId, now } = await actionSession();
  if (!isPlanId(planId)) return { ok: false, error: "error" };
  try {
    // Sin `refresh()`: la página la refresca el diálogo, que vive fuera de lo que cambia al comprar.
    const result = await buyPlanWithBalance(getDb(), { workspaceId, planId, now });
    return { ok: true, mode: result.mode, amountMicroUsd: result.amountMicroUsd.toString() };
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      return {
        ok: false, error: "insufficientBalance",
        missingMicroUsd: error.missingMicroUsd.toString(), balanceMicroUsd: error.balanceMicroUsd.toString(),
      };
    }
    if (error instanceof PlanNotAvailableError) return { ok: false, error: "planActive" };
    throw error;
  }
}

export async function exportDataAction(): Promise<string> {
  const { workspaceId, user } = await actionSession();
  const data = await exportWorkspace(getDb(), workspaceId, Date.now());
  return JSON.stringify({ account: { email: user.email }, ...data }, null, 2);
}
