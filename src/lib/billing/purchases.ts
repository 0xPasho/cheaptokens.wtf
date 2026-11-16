/**
 * Lo que pasa después de un cobro confirmado (ADR-0049, docs/08). Cada función es idempotente por
 * `externalId`: el webhook del MoR puede llegar dos veces y solo se aplica una.
 */
import { and, eq, sql } from "drizzle-orm";

import { creditTransactions, modelPacks, payments, subscriptions, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

import { packGrant, packOffer, PACK_VALIDITY_MS, PERIOD_MS, type PlanId, PLANS } from "./plans";

export interface PaymentRef {
  provider: string;
  externalId: string;
  receiptUrl?: string | null;
}

type PaymentKind = "topup" | "subscription" | "pack";

/** Inserta el pago. False si ese `externalId` ya se procesó. */
async function recordPayment(tx: Db, input: { workspaceId: string; kind: PaymentKind; amountMicroUsd: bigint; item: string | null; payment: PaymentRef }) {
  const inserted = await tx.insert(payments).values({
    workspaceId: input.workspaceId,
    kind: input.kind,
    amountMicroUsd: input.amountMicroUsd,
    item: input.item,
    paymentProvider: input.payment.provider,
    externalId: input.payment.externalId,
    receiptUrl: input.payment.receiptUrl ?? null,
  }).onConflictDoNothing({ target: payments.externalId }).returning({ id: payments.id });
  return inserted.length > 0;
}

export async function recordTopUp(db: Db, input: { workspaceId: string; amountMicroUsd: bigint; payment: PaymentRef }): Promise<boolean> {
  if (input.amountMicroUsd <= BigInt(0)) throw new Error("Top-up amount must be positive");
  return db.transaction(async (tx) => {
    if (!await recordPayment(tx, { ...input, kind: "topup", item: null })) return false;
    await tx.insert(creditTransactions).values({
      workspaceId: input.workspaceId,
      type: "topup",
      amountMicroUsd: input.amountMicroUsd,
      paymentProvider: input.payment.provider,
      externalId: input.payment.externalId,
      note: null,
    });
    await tx.update(workspaces).set({ balanceMicroUsd: sql`${workspaces.balanceMicroUsd} + ${input.amountMicroUsd}` })
      .where(eq(workspaces.id, input.workspaceId));
    return true;
  });
}

/** Empieza o renueva un plan: periodo nuevo, sin cancelación pendiente. */
export async function activateSubscription(db: Db, input: { workspaceId: string; planId: PlanId; payment: PaymentRef; now: number; periodEnd?: number }) {
  const plan = PLANS[input.planId];
  return db.transaction(async (tx) => {
    if (!await recordPayment(tx, { workspaceId: input.workspaceId, kind: "subscription", amountMicroUsd: plan.priceMicroUsd, item: plan.id, payment: input.payment })) return false;
    const values = {
      planId: plan.id,
      status: "active" as const,
      currentPeriodStart: new Date(input.now),
      currentPeriodEnd: new Date(input.periodEnd ?? input.now + PERIOD_MS),
      cancelAtPeriodEnd: false,
      nextPlanId: null,
      paymentProvider: input.payment.provider,
      externalId: input.payment.externalId,
    };
    await tx.insert(subscriptions).values({ workspaceId: input.workspaceId, ...values })
      .onConflictDoUpdate({ target: subscriptions.workspaceId, set: values });
    return true;
  });
}

/** Lo que se cobra hoy al subir de plan: la diferencia por el tiempo que queda del periodo. */
export function upgradeCharge(fromId: PlanId, toId: PlanId, periodEnd: number, now: number): bigint {
  const difference = PLANS[toId].priceMicroUsd - PLANS[fromId].priceMicroUsd;
  if (difference <= BigInt(0)) return BigInt(0);
  const remaining = BigInt(Math.max(0, Math.min(PERIOD_MS, periodEnd - now)));
  return (difference * remaining) / BigInt(PERIOD_MS);
}

/** Subir aplica ya, con el cobro prorrateado; lo usado cuenta sobre el límite nuevo. */
export async function upgradeSubscription(db: Db, input: { workspaceId: string; planId: PlanId; amountMicroUsd: bigint; payment: PaymentRef }) {
  return db.transaction(async (tx) => {
    if (!await recordPayment(tx, { workspaceId: input.workspaceId, kind: "subscription", amountMicroUsd: input.amountMicroUsd, item: input.planId, payment: input.payment })) return false;
    await tx.update(subscriptions).set({ planId: input.planId, nextPlanId: null, cancelAtPeriodEnd: false })
      .where(eq(subscriptions.workspaceId, input.workspaceId));
    return true;
  });
}

/** Bajar de plan aplica al renovar. Pasar el plan actual deshace un cambio programado. */
export async function scheduleDowngrade(db: Db, workspaceId: string, planId: PlanId | null) {
  await db.update(subscriptions).set({ nextPlanId: planId }).where(eq(subscriptions.workspaceId, workspaceId));
}

export async function setCancelAtPeriodEnd(db: Db, workspaceId: string, cancel: boolean) {
  await db.update(subscriptions).set({ cancelAtPeriodEnd: cancel })
    .where(and(eq(subscriptions.workspaceId, workspaceId), eq(subscriptions.status, "active")));
}

export async function recordPackPurchase(db: Db, input: { workspaceId: string; modelId: string; payment: PaymentRef; now: number }) {
  const offer = packOffer(input.modelId);
  if (!offer) throw new Error("There is no pack for this model");
  return db.transaction(async (tx) => {
    if (!await recordPayment(tx, { workspaceId: input.workspaceId, kind: "pack", amountMicroUsd: offer.priceMicroUsd, item: offer.modelId, payment: input.payment })) return false;
    const granted = packGrant(offer.priceMicroUsd);
    await tx.insert(modelPacks).values({
      workspaceId: input.workspaceId,
      modelId: offer.modelId,
      paidMicroUsd: offer.priceMicroUsd,
      grantedMicroUsd: granted,
      balanceMicroUsd: granted,
      expiresAt: new Date(input.now + PACK_VALIDITY_MS),
    });
    return true;
  });
}
