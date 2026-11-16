/**
 * Lecturas del dashboard. Reciben el `workspaceId` ya resuelto desde la sesión (src/lib/dashboard/session.ts):
 * nunca uno que venga del cliente.
 */
import { and, type AnyColumn, count, desc, eq, gt, gte, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { PlanUsage } from "@/lib/billing/limits";
import { overflowSettings, planUsage, storedWindow } from "@/lib/billing/state";
import { apiKeys, modelPacks, payments, requests, subscriptions, usageWindows, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

const ZERO = BigInt(0);
const fiveHourWindow = alias(usageWindows, "five_hour_window");
const weekWindow = alias(usageWindows, "week_window");

export async function getAccount(db: Db, workspaceId: string, now: number) {
  const [row] = await db.select({
    balanceMicroUsd: workspaces.balanceMicroUsd,
    overflowMode: workspaces.overflowMode,
    overflowPacks: workspaces.overflowPacks,
    overflowCredits: workspaces.overflowCredits,
    overflowCapMicroUsd: workspaces.overflowCapMicroUsd,
    overflowMonth: workspaces.overflowMonth,
    overflowSpentMicroUsd: workspaces.overflowSpentMicroUsd,
    planId: subscriptions.planId,
    status: subscriptions.status,
    currentPeriodEnd: subscriptions.currentPeriodEnd,
    cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
    nextPlanId: subscriptions.nextPlanId,
    fiveHourUsed: fiveHourWindow.usedMicroUsd,
    fiveHourResetsAt: fiveHourWindow.resetsAt,
    weekUsed: weekWindow.usedMicroUsd,
    weekResetsAt: weekWindow.resetsAt,
  }).from(workspaces)
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .leftJoin(fiveHourWindow, and(eq(fiveHourWindow.workspaceId, workspaces.id), eq(fiveHourWindow.kind, "five_hour")))
    .leftJoin(weekWindow, and(eq(weekWindow.workspaceId, workspaces.id), eq(weekWindow.kind, "week")))
    .where(eq(workspaces.id, workspaceId));
  if (!row) throw new Error("Workspace not found");

  const subscription = row.planId !== null && row.status !== null && row.currentPeriodEnd !== null
    ? { planId: row.planId, status: row.status, currentPeriodEnd: row.currentPeriodEnd }
    : null;
  const plan: PlanUsage | null = planUsage(
    subscription,
    storedWindow({ usedMicroUsd: row.fiveHourUsed, resetsAt: row.fiveHourResetsAt }),
    storedWindow({ usedMicroUsd: row.weekUsed, resetsAt: row.weekResetsAt }),
    now,
  );
  return {
    balanceMicroUsd: row.balanceMicroUsd,
    overflow: overflowSettings(row, now),
    plan,
    subscription: plan && row.currentPeriodEnd
      ? { periodEnd: row.currentPeriodEnd, cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false, nextPlanId: row.nextPlanId }
      : null,
  };
}

export type Account = Awaited<ReturnType<typeof getAccount>>;

export type UsageSource = "plan" | "pack" | "credits" | "errors";

export interface UsageFilters {
  since: Date;
  keyId?: string | null;
  modelId?: string | null;
  source?: UsageSource | null;
}

function usageWhere(workspaceId: string, filters: UsageFilters): SQL {
  const conditions: SQL[] = [eq(requests.workspaceId, workspaceId), gte(requests.createdAt, filters.since)];
  if (filters.keyId) conditions.push(eq(requests.apiKeyId, filters.keyId));
  if (filters.modelId) conditions.push(eq(requests.modelId, filters.modelId));
  if (filters.source === "plan") conditions.push(gt(requests.planMicroUsd, ZERO));
  if (filters.source === "pack") conditions.push(gt(requests.packMicroUsd, ZERO));
  if (filters.source === "credits") conditions.push(gt(requests.creditsMicroUsd, ZERO));
  if (filters.source === "errors") conditions.push(ne(requests.status, "success"));
  return and(...conditions)!;
}

const sumBig = (column: SQL | AnyColumn) => sql`coalesce(sum(${column}), 0)`.mapWith(BigInt);

export async function getUsageSummary(db: Db, workspaceId: string, filters: UsageFilters) {
  const [row] = await db.select({
    requests: count(),
    errors: sql`count(*) filter (where ${requests.status} <> 'success')`.mapWith(Number),
    tokens: sql`coalesce(sum(${requests.promptTokens} + ${requests.completionTokens}), 0)`.mapWith(Number),
    value: sumBig(requests.costMicroUsd),
    official: sumBig(requests.officialCostMicroUsd),
    plan: sumBig(requests.planMicroUsd),
    pack: sumBig(requests.packMicroUsd),
    credits: sumBig(requests.creditsMicroUsd),
    absorbed: sumBig(requests.absorbedMicroUsd),
  }).from(requests).where(usageWhere(workspaceId, filters));
  const official = row?.official ?? ZERO;
  const value = row?.value ?? ZERO;
  return {
    requests: row?.requests ?? 0,
    errors: row?.errors ?? 0,
    tokens: row?.tokens ?? 0,
    value,
    saved: official > value ? official - value : ZERO,
    plan: row?.plan ?? ZERO,
    pack: row?.pack ?? ZERO,
    credits: row?.credits ?? ZERO,
    absorbed: row?.absorbed ?? ZERO,
  };
}

export async function getPlanUsageByModel(db: Db, workspaceId: string, since: Date) {
  return db.select({
    modelId: requests.modelId,
    plan: sumBig(requests.planMicroUsd),
    requests: count(),
  }).from(requests)
    .where(and(eq(requests.workspaceId, workspaceId), gte(requests.createdAt, since), gt(requests.planMicroUsd, ZERO)))
    .groupBy(requests.modelId)
    .orderBy(desc(sql`sum(${requests.planMicroUsd})`))
    .limit(6);
}

export async function listRequests(db: Db, workspaceId: string, filters: UsageFilters, page: number, pageSize: number) {
  const where = usageWhere(workspaceId, filters);
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: requests.id,
      createdAt: requests.createdAt,
      modelId: requests.modelId,
      keyName: apiKeys.name,
      status: requests.status,
      httpStatus: requests.httpStatus,
      errorCode: requests.errorCode,
      promptTokens: requests.promptTokens,
      completionTokens: requests.completionTokens,
      costMicroUsd: requests.costMicroUsd,
      officialCostMicroUsd: requests.officialCostMicroUsd,
      planMicroUsd: requests.planMicroUsd,
      packMicroUsd: requests.packMicroUsd,
      creditsMicroUsd: requests.creditsMicroUsd,
      absorbedMicroUsd: requests.absorbedMicroUsd,
      latencyMs: requests.latencyMs,
    }).from(requests)
      .innerJoin(apiKeys, eq(apiKeys.id, requests.apiKeyId))
      .where(where)
      .orderBy(desc(requests.createdAt), desc(requests.id))
      .limit(pageSize)
      .offset(page * pageSize),
    db.select({ total: count() }).from(requests).where(where),
  ]);
  return { rows, total };
}

export async function hasAnyRequest(db: Db, workspaceId: string): Promise<boolean> {
  const [row] = await db.select({ id: requests.id }).from(requests).where(eq(requests.workspaceId, workspaceId)).limit(1);
  return row !== undefined;
}

export async function listKeys(db: Db, workspaceId: string) {
  return db.select({
    id: apiKeys.id,
    name: apiKeys.name,
    hint: apiKeys.hint,
    billingSource: apiKeys.billingSource,
    allowedModels: apiKeys.allowedModels,
    spendLimitMicroUsd: apiKeys.spendLimitMicroUsd,
    spentMicroUsd: apiKeys.spentMicroUsd,
    lastUsedAt: apiKeys.lastUsedAt,
    createdAt: apiKeys.createdAt,
    revokedAt: apiKeys.revokedAt,
    expiresAt: apiKeys.expiresAt,
  }).from(apiKeys).where(eq(apiKeys.workspaceId, workspaceId)).orderBy(desc(apiKeys.createdAt));
}

export async function listPacks(db: Db, workspaceId: string) {
  return db.select().from(modelPacks).where(eq(modelPacks.workspaceId, workspaceId)).orderBy(desc(modelPacks.createdAt));
}

export async function listPayments(db: Db, workspaceId: string) {
  return db.select().from(payments).where(eq(payments.workspaceId, workspaceId)).orderBy(desc(payments.createdAt)).limit(100);
}

/** Exportación de datos (docs/02 › Ajustes): sin hashes ni secretos. */
export async function exportWorkspace(db: Db, workspaceId: string, now: number) {
  const [account, keys, packs, paid, usage] = await Promise.all([
    getAccount(db, workspaceId, now),
    listKeys(db, workspaceId),
    listPacks(db, workspaceId),
    listPayments(db, workspaceId),
    getUsageSummary(db, workspaceId, { since: new Date(0) }),
  ]);
  const json = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)));
  return json({
    exportedAt: new Date(now).toISOString(),
    moneyUnit: "micro USD",
    balance: account.balanceMicroUsd,
    plan: account.plan ? { id: account.plan.plan.id, ...account.subscription } : null,
    overflow: account.overflow,
    keys,
    packs,
    payments: paid,
    usage,
  });
}
