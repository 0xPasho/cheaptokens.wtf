"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";

import type { BillingSource } from "@/lib/billing/limits";
import { isPlanId, packOffer, PLANS, TOPUP_MAX_MICRO_USD, TOPUP_MIN_MICRO_USD } from "@/lib/billing/plans";
import {
  activateSubscription, recordPackPurchase, recordTopUp, scheduleDowngrade, setCancelAtPeriodEnd, upgradeCharge, upgradeSubscription,
} from "@/lib/billing/purchases";
import { createApiKey } from "@/lib/billing/workspaces";
import { getCatalog } from "@/lib/catalog/queries";
import { actionSession } from "@/lib/dashboard/session";
import { exportWorkspace, getAccount } from "@/lib/dashboard/queries";
import { getDb } from "@/lib/db/client";
import { apiKeys, workspaces } from "@/lib/db/schema";
import { getPaymentProvider } from "@/lib/payments";

/** Los errores son claves de `dashboard.*` o `dashboard.keys.*`: el cliente los traduce. */
export type ActionError =
  | "error" | "paymentsUnavailable" | "nameRequired" | "limitInvalid" | "pickOne" | "tooMany" | "amountInvalid";

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
    const known = new Set(getCatalog().map((model) => model.id));
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
    overflowPacks: form.get("packs") === "on",
    overflowCredits: form.get("credits") === "on",
    overflowCapMicroUsd: cap,
  }).where(eq(workspaces.id, workspaceId));
  refresh();
  return { ok: true };
}

/** Elegir, subir o bajar de plan. Subir cobra la diferencia prorrateada; bajar se programa. */
export async function changePlanAction(planId: string): Promise<ActionResult> {
  const { workspaceId } = await actionSession();
  if (!isPlanId(planId)) return { ok: false, error: "error" };
  const db = getDb();
  const now = Date.now();
  const account = await getAccount(db, workspaceId, now);
  const current = account.plan?.plan ?? null;
  if (current?.id === planId) {
    await scheduleDowngrade(db, workspaceId, null);
    refresh();
    return { ok: true };
  }
  if (current && PLANS[planId].priceMicroUsd < current.priceMicroUsd) {
    await scheduleDowngrade(db, workspaceId, planId);
    refresh();
    return { ok: true };
  }
  const provider = getPaymentProvider();
  if (!provider) return { ok: false, error: "paymentsUnavailable" };
  if (current && account.subscription) {
    const amount = upgradeCharge(current.id, planId, account.subscription.periodEnd.getTime(), now);
    const payment = await provider.charge(workspaceId, { kind: "subscription", planId, amountMicroUsd: amount });
    await upgradeSubscription(db, { workspaceId, planId, amountMicroUsd: amount, payment });
  } else {
    const payment = await provider.charge(workspaceId, { kind: "subscription", planId, amountMicroUsd: PLANS[planId].priceMicroUsd });
    await activateSubscription(db, { workspaceId, planId, payment, now });
  }
  refresh();
  return { ok: true };
}

export async function setCancelAction(cancel: boolean): Promise<ActionResult> {
  const { workspaceId } = await actionSession();
  await setCancelAtPeriodEnd(getDb(), workspaceId, cancel);
  refresh();
  return { ok: true };
}

export async function topUpAction(amount: string): Promise<ActionResult> {
  const { workspaceId } = await actionSession();
  const micros = /^\d{1,13}$/.test(amount) ? BigInt(amount) : null;
  if (micros === null || micros < TOPUP_MIN_MICRO_USD || micros > TOPUP_MAX_MICRO_USD || micros % BigInt(10_000) !== BigInt(0)) {
    return { ok: false, error: "amountInvalid" };
  }
  const provider = getPaymentProvider();
  if (!provider) return { ok: false, error: "paymentsUnavailable" };
  const payment = await provider.charge(workspaceId, { kind: "topup", amountMicroUsd: micros });
  await recordTopUp(getDb(), { workspaceId, amountMicroUsd: micros, payment });
  refresh();
  return { ok: true };
}

export async function buyPackAction(modelId: string): Promise<ActionResult> {
  const { workspaceId } = await actionSession();
  const offer = packOffer(modelId);
  if (!offer) return { ok: false, error: "error" };
  const provider = getPaymentProvider();
  if (!provider) return { ok: false, error: "paymentsUnavailable" };
  const payment = await provider.charge(workspaceId, { kind: "pack", modelId, amountMicroUsd: offer.priceMicroUsd });
  await recordPackPurchase(getDb(), { workspaceId, modelId, payment, now: Date.now() });
  refresh();
  return { ok: true };
}

export async function exportDataAction(): Promise<string> {
  const { workspaceId, user } = await actionSession();
  const data = await exportWorkspace(getDb(), workspaceId, Date.now());
  return JSON.stringify({ account: { email: user.email }, ...data }, null, 2);
}
