/**
 * Pagos en Bitcoin on-chain (ADR-0065). Cada workspace tiene una dirección vigente que sale de la xpub; una
 * cotización fija el precio 15 minutos. Lo que llega a una dirección nuestra:
 *
 * 1. se ve en la red y su precio queda fijo: el cotizado si llegó a tiempo, el del momento si no;
 * 2. con las confirmaciones, se acredita como saldo una sola vez, por `txid:vout`;
 * 3. si la cotización era de un plan, en la misma transacción se compra con el saldo.
 */
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";

import { isPlanId } from "@/lib/billing/plans";
import { buyPlanWithBalance, planQuote, type PlanQuote, recordTopUp } from "@/lib/billing/purchases";
import { bitcoinAddresses, bitcoinOrders, bitcoinReceipts, creditTransactions, subscriptions, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/db/uuid";

import { microUsdForSats, satsForMicroUsd } from "./amounts";
import {
  type BitcoinConfig, bitcoinTxUrl, MAX_BITCOIN_ORDER_MICRO_USD, MIN_BITCOIN_ORDER_MICRO_USD, PLAN_TOLERANCE_BPS,
  QUOTE_GRACE_MS, QUOTE_WINDOW_MS,
} from "./config";
import { type BitcoinChain, type ChainPayment, EsploraChain, EsploraError, exampleChain } from "./esplora";
import { BitcoinRates, EXAMPLE_RATE_MICRO_USD, type RateProvider } from "./rates";
import { BitcoinAccount } from "./xpub";

/** Cuánto se sigue de cerca una dirección después de una cotización o de un pago. */
export const WATCH_MS = 24 * 60 * 60 * 1000;
/** Lo más seguido que se lee una misma dirección en la cadena. */
export const CHECK_INTERVAL_MS = 4_000;
/** Un pago sin confirmar que ya no aparece en la red se da por perdido después de este tiempo. */
export const MISSING_DROP_MS = 30 * 60 * 1000;
/** Un pago que se ve más tarde que esto después de cotizar ya no compra el plan: queda como saldo. */
export const PLAN_INTENT_MS = 24 * 60 * 60 * 1000;
/** El precio cotizado vale hasta lo cotizado más 10 %: lo demás, al precio del momento. */
const QUOTE_CAP_BPS = BigInt(11_000);
const MAX_QUOTES_PER_HOUR = 30;
/** Cada dirección es una llamada a la API: el cron lee las vigiladas y un turno pequeño de las demás. */
const WATCHED_LIMIT = 200;
const ROTATION_BATCH = 20;
const SCAN_CONCURRENCY = 3;
const SETTLE_LIMIT = 200;
const ZERO = BigInt(0);
const BPS = BigInt(10_000);

export interface BitcoinDeps {
  config: BitcoinConfig;
  account: BitcoinAccount;
  chain: BitcoinChain;
  rates: RateProvider;
}

let shared: { key: string; deps: BitcoinDeps } | null = null;

/** Lo que necesita la detección, uno por proceso: el precio se reusa entre requests. Null si Bitcoin no está configurado. */
export function bitcoinDeps(config: BitcoinConfig | null): BitcoinDeps | null {
  if (!config) return null;
  const key = [config.network, config.xpub, config.esploraUrl, config.confirmations, config.simulate].join("|");
  if (shared?.key === key) return shared.deps;
  const deps: BitcoinDeps = {
    config,
    account: new BitcoinAccount(config.xpub, config.network),
    chain: config.simulate ? exampleChain : new EsploraChain(config.esploraUrl),
    rates: new BitcoinRates(config.simulate ? { fixed: EXAMPLE_RATE_MICRO_USD } : {}),
  };
  shared = { key, deps };
  return deps;
}

/** La dirección vigente ya no sale de la xpub configurada: no se le muestra a nadie. */
export class BitcoinAddressMismatchError extends Error {}

/**
 * La dirección vigente del workspace: la que no ha recibido nada. Si no tiene, toma el siguiente índice libre.
 * Los índices van en orden y sin saltos, así la wallet los encuentra.
 */
export async function ensureBitcoinAddress(db: Db, deps: BitcoinDeps, workspaceId: string): Promise<string> {
  const { network } = deps.config;
  for (let attempt = 0; attempt < 8; attempt++) {
    const [current] = await db.select().from(bitcoinAddresses).where(and(
      eq(bitcoinAddresses.network, network), eq(bitcoinAddresses.workspaceId, workspaceId), isNull(bitcoinAddresses.usedAt),
    ));
    if (current) {
      if (deps.account.address(current.derivationIndex) !== current.address) {
        console.error(JSON.stringify({ event: "bitcoin_address_mismatch", severity: "critical", network, workspaceId, index: current.derivationIndex }));
        throw new BitcoinAddressMismatchError("The stored Bitcoin address does not come from CRYPTO_BITCOIN_XPUB");
      }
      return current.address;
    }
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${bitcoinAddresses.derivationIndex}) + 1, 0)` })
      .from(bitcoinAddresses).where(eq(bitcoinAddresses.network, network));
    const index = Number(next);
    const address = deps.account.address(index);
    // Otro proceso pudo tomar el mismo índice, o darle ya una dirección a este workspace: se vuelve a mirar.
    const inserted = await db.insert(bitcoinAddresses).values({ network, derivationIndex: index, address, workspaceId })
      .onConflictDoNothing().returning({ address: bitcoinAddresses.address });
    if (inserted.length > 0) return address;
  }
  throw new Error("Could not assign a Bitcoin address");
}

export type QuoteRequest = { intent: "topup"; amountMicroUsd: bigint } | { intent: "plan"; planId: string };

/** `amount`: fuera del mínimo o el máximo. `covered`: el saldo ya alcanza. `plan`: ese plan no se puede comprar ahora. `tooMany`: demasiadas en una hora. */
export class QuoteError extends Error {
  constructor(readonly code: "amount" | "covered" | "plan" | "tooMany") {
    super(`Bitcoin quote rejected: ${code}`);
  }
}

async function activePlan(db: Db, workspaceId: string, now: number, lock = false) {
  const query = db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
  const [current] = lock ? await query.for("update") : await query;
  return current && current.status === "active" && current.currentPeriodEnd.getTime() > now
    ? { planId: current.planId, periodEnd: current.currentPeriodEnd.getTime() }
    : null;
}

/**
 * Abre una cotización y reemplaza la anterior del workspace. Para un plan cotiza lo que falta después del
 * saldo. Lanza `RateUnavailableError` si no hay un precio confiable.
 */
export async function createBitcoinQuote(db: Db, deps: BitcoinDeps, workspaceId: string, request: QuoteRequest, now: number) {
  const { network } = deps.config;
  let amountMicroUsd: bigint;
  let plan: { planId: string; quote: PlanQuote } | null = null;
  if (request.intent === "topup") {
    amountMicroUsd = request.amountMicroUsd;
    if (amountMicroUsd < MIN_BITCOIN_ORDER_MICRO_USD || amountMicroUsd > MAX_BITCOIN_ORDER_MICRO_USD) throw new QuoteError("amount");
  } else {
    if (!isPlanId(request.planId)) throw new QuoteError("plan");
    const [[workspace], active] = await Promise.all([
      db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces).where(eq(workspaces.id, workspaceId)),
      activePlan(db, workspaceId, now),
    ]);
    if (!workspace) throw new Error("Workspace not found");
    const quote = planQuote(active, request.planId, now);
    if (!quote) throw new QuoteError("plan");
    amountMicroUsd = quote.amountMicroUsd - workspace.balance;
    if (amountMicroUsd <= ZERO) throw new QuoteError("covered");
    plan = { planId: request.planId, quote };
  }

  const [{ recent }] = await db.select({ recent: sql<number>`count(*)` }).from(bitcoinOrders).where(and(
    eq(bitcoinOrders.workspaceId, workspaceId), gt(bitcoinOrders.createdAt, new Date(now - 60 * 60 * 1000)),
  ));
  if (Number(recent) >= MAX_QUOTES_PER_HOUR) throw new QuoteError("tooMany");

  const { rateMicroUsd } = await deps.rates.current(now);
  const address = await ensureBitcoinAddress(db, deps, workspaceId);
  return db.transaction(async (tx) => {
    // La anterior deja de valer. Si no recibió nada, se cierra; si tiene un pago en camino, ese pago la resuelve.
    await tx.update(bitcoinOrders).set({ settledAt: new Date(now), outcome: "replaced" }).where(and(
      eq(bitcoinOrders.workspaceId, workspaceId), eq(bitcoinOrders.network, network), isNull(bitcoinOrders.settledAt),
      sql`not exists (select 1 from bitcoin_receipts r where r.order_id = ${bitcoinOrders.id} and r.status = 'seen')`,
    ));
    await tx.update(bitcoinOrders).set({ replacedAt: new Date(now) }).where(and(
      eq(bitcoinOrders.workspaceId, workspaceId), eq(bitcoinOrders.network, network), isNull(bitcoinOrders.replacedAt),
    ));
    const [order] = await tx.insert(bitcoinOrders).values({
      id: uuidv7(), workspaceId, network, address,
      intent: request.intent,
      planId: plan?.planId ?? null,
      planMode: plan?.quote.mode ?? null,
      amountMicroUsd,
      amountSats: satsForMicroUsd(amountMicroUsd, rateMicroUsd),
      rateMicroUsd,
      expiresAt: new Date(now + QUOTE_WINDOW_MS),
      createdAt: new Date(now),
    }).returning();
    await tx.update(bitcoinAddresses).set({ watchUntil: new Date(now + WATCH_MS) })
      .where(and(eq(bitcoinAddresses.network, network), eq(bitcoinAddresses.address, address)));
    return order;
  });
}

export interface BitcoinScanReport {
  network: string;
  /** Direcciones leídas en la cadena. */
  checked: number;
  /** Pagos nuevos vistos en la red. */
  seen: number;
  /** Pagos confirmados y acreditados. */
  credited: number;
  /** Pagos que desaparecieron sin confirmarse. */
  dropped: number;
  error?: string;
}

interface Target {
  workspaceId: string;
  address: string;
}

/**
 * Una corrida: lee las direcciones, guarda lo nuevo que llegó y acredita lo confirmado. Con `workspaceId` solo
 * las de ese workspace (el diálogo abierto); sin él, las vigiladas y un turno de las demás (el cron).
 */
export async function scanBitcoin(db: Db, deps: BitcoinDeps, now: number, options: { workspaceId?: string } = {}): Promise<BitcoinScanReport> {
  const report: BitcoinScanReport = { network: deps.config.network, checked: 0, seen: 0, credited: 0, dropped: 0 };
  if (!deps.chain.live) return report;
  try {
    const targets = await claimAddresses(db, deps, now, options.workspaceId);
    for (let start = 0; start < targets.length; start += SCAN_CONCURRENCY) {
      const batch = targets.slice(start, start + SCAN_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (target) => {
        const payments = await deps.chain.payments(target.address);
        report.checked++;
        await recordPayments(db, deps, target, payments, now, report);
      }));
      const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));
      for (const failure of failures) {
        console.error(JSON.stringify({ event: "bitcoin_address_scan_failed", network: deps.config.network, message: errorMessage(failure) }));
      }
      // Con 429 la API nos está limitando: el resto espera a la siguiente corrida.
      if (failures.some((failure) => failure instanceof EsploraError && failure.status === 429)) {
        report.error = "rate limited by the Esplora API";
        break;
      }
    }
    report.credited = await settleReceipts(db, deps, now, options.workspaceId);
    report.dropped = await dropMissing(db, deps, now);
  } catch (error) {
    report.error = errorMessage(error);
    console.error(JSON.stringify({ event: "bitcoin_scan_failed", network: deps.config.network, message: report.error }));
  }
  return report;
}

/** Las direcciones que toca leer, marcadas como leídas ahora: dos procesos a la vez no leen la misma. */
async function claimAddresses(db: Db, deps: BitcoinDeps, now: number, workspaceId?: string): Promise<Target[]> {
  const { network } = deps.config;
  const stale = or(isNull(bitcoinAddresses.checkedAt), lte(bitcoinAddresses.checkedAt, new Date(now - CHECK_INTERVAL_MS)));
  const hasOpenReceipt = sql`exists (select 1 from bitcoin_receipts r where r.address = ${bitcoinAddresses.address} and r.status = 'seen')`;
  const columns = { address: bitcoinAddresses.address };
  const oldestFirst = sql`${bitcoinAddresses.checkedAt} asc nulls first`;
  let candidates: string[];
  if (workspaceId) {
    candidates = (await db.select(columns).from(bitcoinAddresses).where(and(
      eq(bitcoinAddresses.network, network), eq(bitcoinAddresses.workspaceId, workspaceId), stale,
      or(isNull(bitcoinAddresses.usedAt), gt(bitcoinAddresses.watchUntil, new Date(now)), hasOpenReceipt),
    ))).map((row) => row.address);
  } else {
    const [watched, rotation] = await Promise.all([
      db.select(columns).from(bitcoinAddresses).where(and(
        eq(bitcoinAddresses.network, network), stale, or(gt(bitcoinAddresses.watchUntil, new Date(now)), hasOpenReceipt),
      )).orderBy(oldestFirst).limit(WATCHED_LIMIT),
      db.select(columns).from(bitcoinAddresses).where(and(eq(bitcoinAddresses.network, network), stale))
        .orderBy(oldestFirst).limit(ROTATION_BATCH),
    ]);
    candidates = [...new Set([...watched, ...rotation].map((row) => row.address))];
  }
  if (candidates.length === 0) return [];
  return db.update(bitcoinAddresses).set({ checkedAt: new Date(now) })
    .where(and(eq(bitcoinAddresses.network, network), inArray(bitcoinAddresses.address, candidates), stale))
    .returning({ workspaceId: bitcoinAddresses.workspaceId, address: bitcoinAddresses.address });
}

/** Guarda lo nuevo que paga la dirección y marca lo que desapareció de la red. */
async function recordPayments(db: Db, deps: BitcoinDeps, target: Target, payments: ChainPayment[], now: number, report: BitcoinScanReport) {
  const { network } = deps.config;
  const existing = await db.select().from(bitcoinReceipts)
    .where(and(eq(bitcoinReceipts.network, network), eq(bitcoinReceipts.address, target.address)));
  const byOutput = new Map(existing.map((row) => [`${row.txid}:${row.vout}`, row]));
  const present = new Set<string>();
  for (const payment of payments) {
    const key = `${payment.txid}:${payment.vout}`;
    present.add(key);
    const row = byOutput.get(key);
    if (!row) {
      if (await recordNewPayment(db, deps, target, payment, now)) report.seen++;
      continue;
    }
    if (row.status === "credited") continue;
    // Volvió a aparecer, o ya entró en un bloque: sigue en camino.
    if (row.blockHeight !== payment.blockHeight || row.missingSince !== null || row.status === "dropped") {
      await db.update(bitcoinReceipts).set({ blockHeight: payment.blockHeight, missingSince: null, status: "seen" })
        .where(and(eq(bitcoinReceipts.id, row.id), ne(bitcoinReceipts.status, "credited")));
    }
  }
  const missing = existing.filter((row) => row.status === "seen" && row.blockHeight === null && row.missingSince === null
    && !present.has(`${row.txid}:${row.vout}`));
  if (missing.length > 0) {
    await db.update(bitcoinReceipts).set({ missingSince: new Date(now) }).where(and(
      inArray(bitcoinReceipts.id, missing.map((row) => row.id)), eq(bitcoinReceipts.status, "seen"), isNull(bitcoinReceipts.missingSince),
    ));
  }
}

/**
 * Un pago que se ve por primera vez. Su precio queda fijo ahora: el de la cotización si llegó a tiempo y no
 * pasa de lo cotizado más 10 %, el del momento si no. Sin precio del momento no se guarda: se ve en la
 * siguiente corrida.
 */
async function recordNewPayment(db: Db, deps: BitcoinDeps, target: Target, payment: ChainPayment, now: number): Promise<boolean> {
  const { network } = deps.config;
  // Si ya entró en un bloque antes de verlo, cuenta la hora del bloque (nunca una del futuro).
  const seenAt = payment.blockTime !== null ? Math.min(now, payment.blockTime) : now;
  const [order] = await db.select().from(bitcoinOrders)
    .where(and(eq(bitcoinOrders.network, network), eq(bitcoinOrders.address, target.address)))
    .orderBy(desc(bitcoinOrders.createdAt)).limit(1);
  let rate: { rateMicroUsd: bigint; source: "quote" | "market" } | null = null;
  if (order && order.workspaceId === target.workspaceId) {
    const onTime = seenAt <= order.expiresAt.getTime() + QUOTE_GRACE_MS
      && (order.replacedAt === null || order.replacedAt.getTime() > seenAt);
    if (onTime) {
      const [{ quoted }] = await db.select({ quoted: sql<string>`coalesce(sum(${bitcoinReceipts.amountSats}), 0)` }).from(bitcoinReceipts)
        .where(and(eq(bitcoinReceipts.orderId, order.id), eq(bitcoinReceipts.rateSource, "quote"), ne(bitcoinReceipts.status, "dropped")));
      if ((BigInt(quoted) + payment.sats) * BPS <= order.amountSats * QUOTE_CAP_BPS) rate = { rateMicroUsd: order.rateMicroUsd, source: "quote" };
    }
  }
  rate ??= { rateMicroUsd: (await deps.rates.current(now)).rateMicroUsd, source: "market" };
  const inserted = await db.insert(bitcoinReceipts).values({
    id: uuidv7(),
    workspaceId: target.workspaceId,
    network,
    address: target.address,
    orderId: order && order.workspaceId === target.workspaceId ? order.id : null,
    txid: payment.txid,
    vout: payment.vout,
    amountSats: payment.sats,
    rateMicroUsd: rate.rateMicroUsd,
    rateSource: rate.source,
    amountMicroUsd: microUsdForSats(payment.sats, rate.rateMicroUsd),
    seenAt: new Date(seenAt),
    blockHeight: payment.blockHeight,
    createdAt: new Date(now),
  }).onConflictDoNothing().returning({ id: bitcoinReceipts.id });
  if (inserted.length === 0) return false;
  // Ya recibió: la próxima cotización usa otra dirección. Esta se sigue vigilando hasta que se confirme.
  await db.update(bitcoinAddresses)
    .set({ usedAt: sql`coalesce(${bitcoinAddresses.usedAt}, ${new Date(now).toISOString()}::timestamptz)`, watchUntil: new Date(now + WATCH_MS) })
    .where(and(eq(bitcoinAddresses.network, network), eq(bitcoinAddresses.address, target.address)));
  console.log(JSON.stringify({
    event: "bitcoin_payment_seen", network, workspaceId: target.workspaceId, txid: payment.txid, vout: payment.vout,
    sats: payment.sats.toString(), rateSource: rate.source,
  }));
  return true;
}

/** Acredita los pagos que ya tienen las confirmaciones. Devuelve cuántos acreditó. */
async function settleReceipts(db: Db, deps: BitcoinDeps, now: number, workspaceId?: string): Promise<number> {
  const open = await db.select({ id: bitcoinReceipts.id, blockHeight: bitcoinReceipts.blockHeight }).from(bitcoinReceipts).where(and(
    eq(bitcoinReceipts.network, deps.config.network), eq(bitcoinReceipts.status, "seen"), isNotNull(bitcoinReceipts.blockHeight),
    workspaceId ? eq(bitcoinReceipts.workspaceId, workspaceId) : undefined,
  )).limit(SETTLE_LIMIT);
  if (open.length === 0) return 0;
  const tip = await deps.chain.tipHeight();
  let credited = 0;
  for (const row of open) {
    if (tip - row.blockHeight! + 1 < deps.config.confirmations) continue;
    if (await creditBitcoinReceipt(db, deps, row.id, now)) credited++;
  }
  return credited;
}

async function dropMissing(db: Db, deps: BitcoinDeps, now: number): Promise<number> {
  const dropped = await db.update(bitcoinReceipts).set({ status: "dropped" }).where(and(
    eq(bitcoinReceipts.network, deps.config.network), eq(bitcoinReceipts.status, "seen"), isNull(bitcoinReceipts.blockHeight),
    lte(bitcoinReceipts.missingSince, new Date(now - MISSING_DROP_MS)),
  )).returning({ id: bitcoinReceipts.id, txid: bitcoinReceipts.txid });
  for (const row of dropped) console.warn(JSON.stringify({ event: "bitcoin_payment_dropped", network: deps.config.network, txid: row.txid }));
  return dropped.length;
}

/**
 * Acredita un pago confirmado y, si su cotización era de un plan, lo compra. Todo en una transacción y una
 * sola vez: el pago pasa de `seen` a `credited` antes de tocar el saldo.
 */
export async function creditBitcoinReceipt(db: Db, deps: BitcoinDeps, receiptId: string, now: number): Promise<boolean> {
  const credited = await db.transaction(async (tx) => {
    const [row] = await tx.update(bitcoinReceipts).set({ status: "credited", creditedAt: new Date(now), missingSince: null })
      .where(and(eq(bitcoinReceipts.id, receiptId), eq(bitcoinReceipts.status, "seen"))).returning();
    if (!row) return null;
    const provider = deps.config.simulate ? "bitcoin-dev" : "bitcoin";
    if (row.amountMicroUsd > ZERO) {
      await recordTopUp(tx, {
        workspaceId: row.workspaceId,
        amountMicroUsd: row.amountMicroUsd,
        payment: {
          provider,
          externalId: `${provider}:${row.txid}:${row.vout}`,
          receiptUrl: deps.config.simulate ? null : bitcoinTxUrl(row.network as BitcoinConfig["network"], row.txid),
        },
      });
    }
    const outcome = row.orderId ? await fulfillOrder(tx, row.orderId, row.seenAt.getTime(), now) : null;
    return { row, outcome };
  });
  if (credited) {
    console.log(JSON.stringify({
      event: "bitcoin_payment_credited", network: credited.row.network, workspaceId: credited.row.workspaceId, txid: credited.row.txid,
      amountMicroUsd: credited.row.amountMicroUsd.toString(), outcome: credited.outcome,
    }));
  }
  return credited !== null;
}

type Outcome = "plan" | "balance" | "waiting" | null;

/**
 * Lo que la cotización compró. Créditos: ya están en el saldo. Plan: se compra si el saldo alcanza, o si le
 * falta hasta 2 % (la diferencia queda como ajuste). Si falta más, espera otro pago a la misma cotización.
 */
async function fulfillOrder(tx: Db, orderId: string, seenAt: number, now: number): Promise<Outcome> {
  const [order] = await tx.select().from(bitcoinOrders).where(eq(bitcoinOrders.id, orderId)).for("update");
  if (!order || order.settledAt) return null;
  const settle = async (outcome: "plan" | "balance") => {
    await tx.update(bitcoinOrders).set({ settledAt: new Date(now), outcome }).where(eq(bitcoinOrders.id, order.id));
    return outcome;
  };
  if (order.intent === "topup" || !isPlanId(order.planId) || seenAt - order.createdAt.getTime() > PLAN_INTENT_MS) return settle("balance");

  // El workspace primero, como `buyPlanWithBalance` y `chargeRequest`.
  const [workspace] = await tx.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)
    .where(eq(workspaces.id, order.workspaceId)).for("update");
  if (!workspace) throw new Error("Workspace not found");
  const quote = planQuote(await activePlan(tx, order.workspaceId, now, true), order.planId, now);
  // El plan vigente cambió desde la cotización (por ejemplo, ya se pagó con USDC): no se compra otra vez sin pedirlo.
  if (!quote || quote.mode !== order.planMode) return settle("balance");
  const missing = quote.amountMicroUsd - workspace.balance;
  if (missing > ZERO) {
    if (missing * BPS > quote.amountMicroUsd * PLAN_TOLERANCE_BPS) return "waiting";
    await tx.insert(creditTransactions).values({
      workspaceId: order.workspaceId,
      type: "adjustment",
      amountMicroUsd: missing,
      paymentProvider: "bitcoin",
      externalId: `bitcoin-tolerance:${order.id}`,
      note: "Bitcoin: difference absorbed so the plan goes through (ADR-0065)",
    });
    await tx.update(workspaces).set({ balanceMicroUsd: sql`${workspaces.balanceMicroUsd} + ${missing}` })
      .where(eq(workspaces.id, order.workspaceId));
  }
  await buyPlanWithBalance(tx, { workspaceId: order.workspaceId, planId: order.planId, now });
  return settle("plan");
}

export interface BitcoinState {
  address: string;
  balanceMicroUsd: bigint;
  /** La cotización vigente o la última de las últimas 24 horas. */
  order: (typeof bitcoinOrders.$inferSelect & { receivedMicroUsd: bigint; pending: boolean }) | null;
  /** Lo que va en camino y lo acreditado en las últimas 24 horas, del más nuevo al más viejo. */
  receipts: (typeof bitcoinReceipts.$inferSelect)[];
}

/** Lo que el diálogo muestra de Bitcoin. No lee la cadena: eso lo hace `scanBitcoin`. */
export async function getBitcoinState(db: Db, deps: BitcoinDeps, workspaceId: string, now: number): Promise<BitcoinState> {
  const { network } = deps.config;
  const address = await ensureBitcoinAddress(db, deps, workspaceId);
  const [[workspace], [order], receipts] = await Promise.all([
    db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces).where(eq(workspaces.id, workspaceId)),
    db.select().from(bitcoinOrders).where(and(
      eq(bitcoinOrders.workspaceId, workspaceId), eq(bitcoinOrders.network, network), isNull(bitcoinOrders.replacedAt),
      gt(bitcoinOrders.createdAt, new Date(now - PLAN_INTENT_MS)),
    )).orderBy(desc(bitcoinOrders.createdAt)).limit(1),
    db.select().from(bitcoinReceipts).where(and(
      eq(bitcoinReceipts.workspaceId, workspaceId), eq(bitcoinReceipts.network, network),
      or(eq(bitcoinReceipts.status, "seen"), and(eq(bitcoinReceipts.status, "credited"), gt(bitcoinReceipts.creditedAt, new Date(now - WATCH_MS)))),
    )).orderBy(desc(bitcoinReceipts.seenAt)).limit(20),
  ]);
  if (!workspace) throw new Error("Workspace not found");
  const ofOrder = order ? receipts.filter((receipt) => receipt.orderId === order.id) : [];
  return {
    address,
    balanceMicroUsd: workspace.balance,
    order: order
      ? {
        ...order,
        receivedMicroUsd: ofOrder.reduce((sum, receipt) => sum + receipt.amountMicroUsd, ZERO),
        pending: ofOrder.some((receipt) => receipt.status === "seen"),
      }
      : null,
    receipts,
  };
}

/** Pagos en Bitcoin que siguen en camino, para el aviso de Plan y Créditos. Sin leer la cadena. */
export async function pendingBitcoinPayments(db: Db, network: string, workspaceId: string) {
  return db.select({
    sats: bitcoinReceipts.amountSats, amountMicroUsd: bitcoinReceipts.amountMicroUsd, planId: bitcoinOrders.planId,
  }).from(bitcoinReceipts).leftJoin(bitcoinOrders, eq(bitcoinOrders.id, bitcoinReceipts.orderId)).where(and(
    eq(bitcoinReceipts.workspaceId, workspaceId), eq(bitcoinReceipts.network, network), eq(bitcoinReceipts.status, "seen"),
  ));
}

/** Desarrollo local: un pago inventado a la dirección de la cotización, por su monto (o $25 sin cotización). */
export async function simulateBitcoinPayment(db: Db, deps: BitcoinDeps, workspaceId: string, now: number) {
  const state = await getBitcoinState(db, deps, workspaceId, now);
  const order = state.order && !state.order.settledAt ? state.order : null;
  const address = order?.address ?? state.address;
  const sats = order?.amountSats ?? satsForMicroUsd(BigInt(25_000_000), (await deps.rates.current(now)).rateMicroUsd);
  // 64 caracteres hex, como un txid de verdad.
  const txid = `${uuidv7()}${uuidv7()}`.replaceAll("-", "");
  await recordNewPayment(db, deps, { workspaceId, address }, { txid, vout: 0, sats, blockHeight: null, blockTime: null }, now);
}

/** Desarrollo local: confirma y acredita los pagos simulados que siguen en camino. */
export async function simulateBitcoinConfirmation(db: Db, deps: BitcoinDeps, workspaceId: string, now: number) {
  const open = await db.select({ id: bitcoinReceipts.id }).from(bitcoinReceipts).where(and(
    eq(bitcoinReceipts.workspaceId, workspaceId), eq(bitcoinReceipts.network, deps.config.network), eq(bitcoinReceipts.status, "seen"),
  ));
  for (const row of open) await creditBitcoinReceipt(db, deps, row.id, now);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
