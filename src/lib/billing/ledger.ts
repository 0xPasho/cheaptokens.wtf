import { and, eq, sql } from "drizzle-orm";

import { apiKeys, creditTransactions, modelPacks, requests, subscriptions, usageWindows, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

import {
  addToWindow, type BillingSource, type OverflowSettings, overflowMonthKey, planRemaining, prepaidRules, splitCharge, type WindowKind,
} from "./limits";
import { lockNextPack } from "./packs";
import { overflowSettings, planUsage, storedWindow } from "./state";
import type { ChargeRequest, GrantCredits, RequestRecord } from "./types";

export const chargeRequest: ChargeRequest = async (db, record, now = Date.now()) => {
  for (const field of ["costMicroUsd", "upstreamCostMicroUsd", "officialCostMicroUsd"] as const) {
    if (record[field] < BigInt(0)) throw new Error(`${field} must not be negative`);
  }
  await db.transaction(async (tx) => {
    // El bloqueo del workspace serializa sus cobros: ventanas y tope de excedente no pierden escrituras.
    const [workspace] = await tx.select({
      overflowMode: workspaces.overflowMode,
      overflowPacks: workspaces.overflowPacks,
      overflowCredits: workspaces.overflowCredits,
      overflowCapMicroUsd: workspaces.overflowCapMicroUsd,
      overflowMonth: workspaces.overflowMonth,
      overflowSpentMicroUsd: workspaces.overflowSpentMicroUsd,
    }).from(workspaces).where(eq(workspaces.id, record.workspaceId)).for("update");
    const [key] = await tx.select({ billingSource: apiKeys.billingSource }).from(apiKeys)
      .where(and(eq(apiKeys.id, record.apiKeyId), eq(apiKeys.workspaceId, record.workspaceId)));
    // La FK no comprueba que la key pertenezca al workspace del request.
    if (!workspace || !key) throw new Error("Request workspace and API key must match");

    const split = record.costMicroUsd > BigInt(0)
      ? await settle(tx, record, key.billingSource, overflowSettings(workspace, now), now)
      : { plan: BigInt(0), pack: BigInt(0), credits: BigInt(0), absorbed: BigInt(0), packId: null, hadPlan: false };
    if (split.credits > BigInt(0)) {
      const overflow = prepaidRules(key.billingSource, split.hadPlan, overflowSettings(workspace, now)).overflow;
      const month = overflowMonthKey(now);
      await tx.update(workspaces).set({
        balanceMicroUsd: sql`${workspaces.balanceMicroUsd} - ${split.credits}`,
        ...(overflow ? {
          overflowMonth: month,
          overflowSpentMicroUsd: workspace.overflowMonth === month
            ? sql`${workspaces.overflowSpentMicroUsd} + ${split.credits}`
            : split.credits,
        } : {}),
      }).where(eq(workspaces.id, record.workspaceId));
    }
    await tx.insert(requests).values({
      ...record,
      planMicroUsd: split.plan,
      packMicroUsd: split.pack,
      creditsMicroUsd: split.credits,
      absorbedMicroUsd: split.absorbed,
      packId: split.packId,
    });
    await tx.update(apiKeys).set({
      spentMicroUsd: sql`${apiKeys.spentMicroUsd} + ${record.costMicroUsd}`,
      lastUsedAt: sql`now()`,
    }).where(eq(apiKeys.id, record.apiKeyId));
  });
};

/** Reparte el costo con el estado bloqueado dentro de la transacción y actualiza ventanas y paquete. */
async function settle(tx: Db, record: RequestRecord, source: BillingSource, overflow: OverflowSettings, now: number) {
  const usesPlan = source !== "prepaid_only";
  const [subscription] = usesPlan
    ? await tx.select({
      planId: subscriptions.planId, status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd,
    }).from(subscriptions).where(eq(subscriptions.workspaceId, record.workspaceId))
    : [];
  const windows = usesPlan && subscription
    ? await tx.select().from(usageWindows).where(eq(usageWindows.workspaceId, record.workspaceId)).for("update")
    : [];
  const window = (kind: WindowKind) => storedWindow(windows.find((row) => row.kind === kind) ?? null);
  const plan = planUsage(subscription ?? null, window("five_hour"), window("week"), now);

  const planPart = usesPlan && plan ? planRemaining(plan, now) : BigInt(0);
  const needsPrepaid = record.costMicroUsd > planPart;
  const pack = needsPrepaid && prepaidRules(source, plan !== null, overflow).packs
    ? await lockNextPack(tx, record.workspaceId, record.modelId, now)
    : null;
  const split = splitCharge({
    costMicroUsd: record.costMicroUsd, source, plan, overflow, now,
    packBalanceMicroUsd: pack?.balance ?? BigInt(0),
  });

  if (split.plan > BigInt(0) && plan) {
    for (const kind of ["five_hour", "week"] as const) {
      const next = addToWindow(window(kind), kind, split.plan, now);
      const values = { startedAt: new Date(next.startedAt), resetsAt: new Date(next.resetsAt), usedMicroUsd: next.usedMicroUsd };
      await tx.insert(usageWindows).values({ workspaceId: record.workspaceId, kind, ...values })
        .onConflictDoUpdate({ target: [usageWindows.workspaceId, usageWindows.kind], set: values });
    }
  }
  if (split.pack > BigInt(0) && pack) {
    await tx.update(modelPacks).set({ balanceMicroUsd: sql`${modelPacks.balanceMicroUsd} - ${split.pack}` })
      .where(eq(modelPacks.id, pack.id));
  }
  return { ...split, packId: split.pack > BigInt(0) && pack ? pack.id : null, hadPlan: plan !== null };
}

export const grantCredits: GrantCredits = async (db, input) => {
  if (input.amountMicroUsd === BigInt(0)) throw new Error("Credit adjustment amount must not be zero");
  if (!input.note.trim()) throw new Error("Credit adjustment note is required");
  await db.transaction(async (tx) => {
    await tx.insert(creditTransactions).values({
      ...input,
      type: "adjustment",
      paymentProvider: null,
      externalId: null,
    });
    await tx.update(workspaces).set({
      balanceMicroUsd: sql`${workspaces.balanceMicroUsd} + ${input.amountMicroUsd}`,
    }).where(eq(workspaces.id, input.workspaceId));
  });
};

/** Los ajustes manuales deben ser exactos: una fracción de µUSD se rechaza, no se redondea. */
export function usdToMicroUsdExact(value: string): bigint {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  const fraction = match?.[3] ?? "";
  if (!match || /[1-9]/.test(fraction.slice(6))) {
    throw new Error("USD amount must be a decimal with at most six non-zero fractional places");
  }
  const amount = BigInt(match[2]) * BigInt(1_000_000)
    + BigInt(fraction.slice(0, 6).padEnd(6, "0"));
  return match[1] === "-" ? -amount : amount;
}
