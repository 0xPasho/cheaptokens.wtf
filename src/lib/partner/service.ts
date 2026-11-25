/**
 * Lo que hace la puerta de socios (docs/17), encima del cobro de ADR-0049. Un plan de socio es un workspace
 * propio (`clerk_user_id = partner:<socio>:<plan>`, como los `dev:` de ADR-0050) con una suscripción a un plan
 * de socio (`tiers.ts`) que paga el socio (`payment_provider = partner:<socio>`). Sus keys son keys normales
 * del workspace, con `billing_source`, `allowed_models` y `expires_at`. El gateway no cambia: autentica, admite
 * y cobra esas keys como cualquier otra.
 *
 * Las funciones reciben el ID interno (UUID); la capa HTTP traduce los IDs públicos.
 */
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { activeWindow, type StoredWindow, windowFraction } from "@/lib/billing/limits";
import { overflowSettings, storedWindow } from "@/lib/billing/state";
import { createApiKey } from "@/lib/billing/workspaces";
import { apiKeys, models, partnerPlanCaps, partnerPlans, partnerRuns, requests, subscriptions, usageWindows, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/db/uuid";

import { PartnerDoorError } from "./errors";
import { toPublicId } from "./ids";
import { monthDate, monthRange, usageMonth } from "./months";
import { type PartnerTier, partnerPlan, tierIncludesModel } from "./tiers";

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * La suscripción vale hasta `paidThrough` más 8 días: los 7 de gracia de un pago atrasado y uno más por los
 * relojes. Es el mismo margen con el que el socio pide sus keys; el socio cierra el plan si el pago no llega.
 */
export const PLAN_GRACE_MS = 8 * DAY_MS;
/** El `expiresAt` más lejano que acepta una key: un periodo anual con su margen. */
export const MAX_KEY_LIFETIME_MS = 400 * DAY_MS;
/** El tope de excedente más alto que acepta un plan: $100,000 al mes. */
export const MAX_EXTRA_CAP_MICRO_USD = BigInt(100_000) * BigInt(1_000_000);
/** El mismo límite de keys activas por workspace que `createApiKey` (docs/05 › Crear), con un 409 claro. */
const MAX_ACTIVE_KEYS = 25;

export const partnerProvider = (partnerId: string) => `partner:${partnerId}`;

export interface PartnerPlanView {
  planId: string;
  tier: PartnerTier;
  status: "open" | "closed";
  models: string[];
  inferenceBaseUrl: string;
}

export interface IssuedPartnerKey {
  keyId: string;
  key: string;
  hint: string;
  expiresAt: string;
}

export interface PartnerUsageView {
  planId: string;
  window: { remaining: number; resetsAt: string | null };
  week: { remaining: number; resetsAt: string | null };
  extra: { spentMicroUsd: number; capMicroUsd: number | null; month: string };
  monthMicroUsd: number;
  requestsThisMonth: number;
  /** Corridas distintas (`x-deska-run`) en el mes. */
  runsThisMonth: number;
}

/**
 * Los modelos de un plan de socio: los que muestra el catálogo público (`active` y `deprecated`), menos los que
 * su plan excluye (ADR-0080). Los `hidden` funcionan en la API pero todavía no se anuncian.
 */
export async function planModels(db: Db, tier: PartnerTier): Promise<string[]> {
  const rows = await db.select({ id: models.id }).from(models)
    .where(inArray(models.status, ["active", "deprecated"])).orderBy(asc(models.id));
  return rows.map((row) => row.id).filter((id) => tierIncludesModel(tier, id));
}

/** El plan de socio de un workspace, leído de su suscripción. */
async function workspaceTier(tx: Db, workspaceId: string): Promise<PartnerTier> {
  const [row] = await tx.select({ tier: subscriptions.planId }).from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId));
  if (!row || partnerPlan(row.tier) === null) throw new Error("Partner plan without a partner subscription");
  return row.tier as PartnerTier;
}

async function lockPlan(tx: Db, partnerId: string, planId: string) {
  const [plan] = await tx.select({ id: partnerPlans.id, workspaceId: partnerPlans.workspaceId, closedAt: partnerPlans.closedAt })
    .from(partnerPlans)
    .where(and(eq(partnerPlans.id, planId), eq(partnerPlans.partnerId, partnerId)))
    .for("update");
  if (!plan) throw new PartnerDoorError("not_found");
  return plan;
}

async function lockOpenPlan(tx: Db, partnerId: string, planId: string) {
  const plan = await lockPlan(tx, partnerId, planId);
  if (plan.closedAt !== null) throw new PartnerDoorError("conflict");
  return plan;
}

async function planView(tx: Db, planId: string, inferenceBaseUrl: string): Promise<PartnerPlanView> {
  const [row] = await tx.select({ closedAt: partnerPlans.closedAt, tier: subscriptions.planId })
    .from(partnerPlans)
    .innerJoin(subscriptions, eq(subscriptions.workspaceId, partnerPlans.workspaceId))
    .where(eq(partnerPlans.id, planId));
  if (!row || partnerPlan(row.tier) === null) throw new Error("Partner plan without a partner subscription");
  return {
    planId: toPublicId("plan", planId),
    tier: row.tier as PartnerTier,
    status: row.closedAt === null ? "open" : "closed",
    models: await planModels(tx, row.tier as PartnerTier),
    inferenceBaseUrl,
  };
}

const liveKeysOf = (workspaceId: string) => and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt));

/** Abre un plan, o contesta el que ya está abierto con esa referencia. El excedente empieza apagado. */
export async function openPlan(db: Db, input: {
  partnerId: string; externalRef: string; tier: PartnerTier; paidThrough: Date; now: number; inferenceBaseUrl: string;
}): Promise<PartnerPlanView> {
  return db.transaction(async (tx) => {
    // Serializa las aperturas de una misma referencia; el índice único parcial es la red de seguridad.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`partner_plan:${input.partnerId}:${input.externalRef}`}, 0))`);
    const [open] = await tx.select({ id: partnerPlans.id }).from(partnerPlans).where(and(
      eq(partnerPlans.partnerId, input.partnerId),
      eq(partnerPlans.externalRef, input.externalRef),
      isNull(partnerPlans.closedAt),
    ));
    if (open) return planView(tx, open.id, input.inferenceBaseUrl);

    const planId = uuidv7(input.now);
    const [workspace] = await tx.insert(workspaces).values({
      clerkUserId: `partner:${input.partnerId}:${planId}`,
      overflowMode: "stop",
      overflowPacks: false,
      overflowCredits: false,
      overflowCapMicroUsd: BigInt(0),
    }).returning({ id: workspaces.id });
    await tx.insert(subscriptions).values({
      workspaceId: workspace.id,
      planId: input.tier,
      status: "active",
      currentPeriodStart: new Date(input.now),
      currentPeriodEnd: new Date(input.paidThrough.getTime() + PLAN_GRACE_MS),
      cancelAtPeriodEnd: false,
      nextPlanId: null,
      paymentProvider: partnerProvider(input.partnerId),
      externalId: null,
    });
    await tx.insert(partnerPlans).values({
      id: planId,
      partnerId: input.partnerId,
      externalRef: input.externalRef,
      workspaceId: workspace.id,
      paidThrough: input.paidThrough,
      createdAt: new Date(input.now),
    });
    return planView(tx, planId, input.inferenceBaseUrl);
  });
}

/**
 * Cambia el plan o el periodo pagado. El plan nuevo aplica desde el siguiente request, al subir y al bajar
 * (cobra el socio, no nosotros al usuario); lo usado en la ventana y la semana cuenta sobre el límite nuevo.
 * Las keys vivas reciben los modelos del plan.
 */
export async function changePlan(db: Db, input: {
  partnerId: string; planId: string; tier?: PartnerTier; paidThrough?: Date; inferenceBaseUrl: string;
}): Promise<PartnerPlanView> {
  return db.transaction(async (tx) => {
    const plan = await lockOpenPlan(tx, input.partnerId, input.planId);
    if (input.tier || input.paidThrough) {
      await tx.update(subscriptions).set({
        ...(input.tier ? { planId: input.tier } : {}),
        ...(input.paidThrough ? { currentPeriodEnd: new Date(input.paidThrough.getTime() + PLAN_GRACE_MS) } : {}),
      }).where(eq(subscriptions.workspaceId, plan.workspaceId));
    }
    if (input.paidThrough) {
      await tx.update(partnerPlans).set({ paidThrough: input.paidThrough }).where(eq(partnerPlans.id, plan.id));
    }
    // Las keys vivas reciben la misma lista que el socio, la del plan nuevo.
    const view = await planView(tx, plan.id, input.inferenceBaseUrl);
    await tx.update(apiKeys).set({ allowedModels: view.models }).where(liveKeysOf(plan.workspaceId));
    return view;
  });
}

/** Cierra el plan y revoca todas sus keys en la misma transacción. Cerrar un plan cerrado no hace nada. */
export async function closePlan(db: Db, input: { partnerId: string; planId: string; now: number }): Promise<void> {
  await db.transaction(async (tx) => {
    const plan = await lockPlan(tx, input.partnerId, input.planId);
    if (plan.closedAt !== null) return;
    const at = new Date(input.now);
    await tx.update(partnerPlans).set({ closedAt: at }).where(eq(partnerPlans.id, plan.id));
    await tx.update(subscriptions).set({ status: "canceled" }).where(eq(subscriptions.workspaceId, plan.workspaceId));
    await tx.update(apiKeys).set({ revokedAt: at }).where(liveKeysOf(plan.workspaceId));
  });
}

/**
 * Emite una key del plan con `createApiKey` y le pone `expires_at`. Cobra del plan (`plan_only`) o, con el
 * excedente encendido, del plan y después del excedente (`plan_then_prepaid`). La única respuesta con la key.
 */
export async function issueKey(db: Db, input: {
  partnerId: string; planId: string; expiresAt: Date; now: number;
}): Promise<IssuedPartnerKey> {
  const lifetime = input.expiresAt.getTime() - input.now;
  if (lifetime <= 0 || lifetime > MAX_KEY_LIFETIME_MS) throw new PartnerDoorError("invalid_request");
  return db.transaction(async (tx) => {
    const plan = await lockOpenPlan(tx, input.partnerId, input.planId);
    const [{ active }] = await tx.select({ active: count() }).from(apiKeys).where(and(
      liveKeysOf(plan.workspaceId),
      or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date(input.now))),
    ));
    if (active >= MAX_ACTIVE_KEYS) throw new PartnerDoorError("conflict");
    const [workspace] = await tx.select({ overflowMode: workspaces.overflowMode }).from(workspaces)
      .where(eq(workspaces.id, plan.workspaceId));
    const created = await createApiKey(tx, {
      workspaceId: plan.workspaceId,
      name: `${input.partnerId} plan`,
      spendLimitMicroUsd: null,
      billingSource: workspace.overflowMode === "continue" ? "plan_then_prepaid" : "plan_only",
      allowedModels: await planModels(tx, await workspaceTier(tx, plan.workspaceId)),
    });
    await tx.update(apiKeys).set({ expiresAt: input.expiresAt }).where(eq(apiKeys.id, created.id));
    return { keyId: toPublicId("key", created.id), key: created.key, hint: created.hint, expiresAt: input.expiresAt.toISOString() };
  });
}

/** Revoca una key de un plan del socio al instante, sin las 24 horas de gracia de una rotación. */
export async function revokeKey(db: Db, input: { partnerId: string; keyId: string; now: number }): Promise<void> {
  const [key] = await db.select({ id: apiKeys.id, revokedAt: apiKeys.revokedAt }).from(apiKeys)
    .innerJoin(partnerPlans, eq(partnerPlans.workspaceId, apiKeys.workspaceId))
    .where(and(eq(apiKeys.id, input.keyId), eq(partnerPlans.partnerId, input.partnerId)));
  if (!key) throw new PartnerDoorError("not_found");
  if (key.revokedAt !== null) return;
  await db.update(apiKeys).set({ revokedAt: new Date(input.now) }).where(and(eq(apiKeys.id, key.id), isNull(apiKeys.revokedAt)));
}

/**
 * Prende el excedente hasta un tope mensual (UTC), cobrado al socio, o lo apaga con null. Usa el excedente de
 * ADR-0049 con créditos y sin paquetes; el socio paga después (`postpaid.ts`). Un tope menor que lo gastado
 * en el mes queda alcanzado. El tope queda anotado en su mes para leer los meses pasados.
 */
export async function setExtraCap(db: Db, input: { partnerId: string; planId: string; capMicroUsd: bigint | null; now: number }): Promise<void> {
  await db.transaction(async (tx) => {
    const plan = await lockOpenPlan(tx, input.partnerId, input.planId);
    const on = input.capMicroUsd !== null;
    await tx.update(workspaces).set({
      overflowMode: on ? "continue" : "stop",
      overflowPacks: false,
      overflowCredits: on,
      overflowCapMicroUsd: input.capMicroUsd ?? BigInt(0),
    }).where(eq(workspaces.id, plan.workspaceId));
    await tx.update(apiKeys).set({ billingSource: on ? "plan_then_prepaid" : "plan_only" }).where(liveKeysOf(plan.workspaceId));
    const month = monthDate(usageMonth(input.now));
    await tx.insert(partnerPlanCaps).values({ planId: plan.id, month, capMicroUsd: input.capMicroUsd })
      .onConflictDoUpdate({ target: [partnerPlanCaps.planId, partnerPlanCaps.month], set: { capMicroUsd: input.capMicroUsd } });
  });
}

const fiveHourWindow = alias(usageWindows, "five_hour_window");
const weekWindow = alias(usageWindows, "week_window");

function left(window: StoredWindow | null, limit: bigint | undefined, now: number) {
  const remaining = limit === undefined ? 0 : 1 - windowFraction(window, limit, now);
  const open = activeWindow(window, now);
  return { remaining: Math.round(remaining * 10_000) / 10_000, resetsAt: open ? new Date(open.resetsAt).toISOString() : null };
}

/** El tope de un mes pasado: el que se puso ese mes o, si no se cambió, el último anterior. Sin ninguno, apagado. */
async function pastCap(db: Db, planId: string, month: string): Promise<number | null> {
  const [row] = await db.select({ cap: partnerPlanCaps.capMicroUsd }).from(partnerPlanCaps)
    .where(and(eq(partnerPlanCaps.planId, planId), lte(partnerPlanCaps.month, monthDate(month))))
    .orderBy(desc(partnerPlanCaps.month)).limit(1);
  return row?.cap === null || row?.cap === undefined ? null : Number(row.cap);
}

/**
 * Lo que queda del plan ahora (la ventana y la semana siempre son las actuales) y lo usado en un mes UTC, el
 * actual si no se pide otro. Tres queries por índice: se lee en cada vista de los medidores. Los meses pasados
 * salen de `requests`, `partner_runs` y `partner_plan_caps`, que no se borran, así que un plan cerrado se
 * sigue leyendo.
 */
export async function planUsage(db: Db, input: { partnerId: string; planId: string; now: number; month?: string }): Promise<PartnerUsageView> {
  const [row] = await db.select({
    workspaceId: partnerPlans.workspaceId,
    tier: subscriptions.planId,
    overflowMode: workspaces.overflowMode,
    overflowPacks: workspaces.overflowPacks,
    overflowCredits: workspaces.overflowCredits,
    overflowCapMicroUsd: workspaces.overflowCapMicroUsd,
    overflowMonth: workspaces.overflowMonth,
    overflowSpentMicroUsd: workspaces.overflowSpentMicroUsd,
    fiveHourUsed: fiveHourWindow.usedMicroUsd,
    fiveHourResetsAt: fiveHourWindow.resetsAt,
    weekUsed: weekWindow.usedMicroUsd,
    weekResetsAt: weekWindow.resetsAt,
  }).from(partnerPlans)
    .innerJoin(workspaces, eq(workspaces.id, partnerPlans.workspaceId))
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, partnerPlans.workspaceId))
    .leftJoin(fiveHourWindow, and(eq(fiveHourWindow.workspaceId, partnerPlans.workspaceId), eq(fiveHourWindow.kind, "five_hour")))
    .leftJoin(weekWindow, and(eq(weekWindow.workspaceId, partnerPlans.workspaceId), eq(weekWindow.kind, "week")))
    .where(and(eq(partnerPlans.id, input.planId), eq(partnerPlans.partnerId, input.partnerId)));
  if (!row) throw new PartnerDoorError("not_found");

  const current = usageMonth(input.now);
  const month = input.month ?? current;
  const { start, end } = monthRange(month);
  const [totals] = await db.select({
    cost: sql<string | null>`sum(${requests.costMicroUsd})`,
    credits: sql<string | null>`sum(${requests.creditsMicroUsd})`,
    requests: count(),
  }).from(requests).where(and(eq(requests.workspaceId, row.workspaceId), gte(requests.createdAt, start), lt(requests.createdAt, end)));
  const [runs] = await db.select({ runs: count() }).from(partnerRuns)
    .where(and(eq(partnerRuns.planId, input.planId), eq(partnerRuns.month, monthDate(month))));

  const plan = row.tier === null ? null : partnerPlan(row.tier);
  const overflow = overflowSettings(row, input.now);
  // El mes actual sale del contador con el que el gateway aplica el tope; uno pasado, de lo que pagaron los créditos.
  const extra = month === current
    ? { spentMicroUsd: Number(overflow.spentThisMonthMicroUsd), capMicroUsd: overflow.mode === "continue" ? Number(overflow.capMicroUsd) : null }
    : { spentMicroUsd: Number(totals?.credits ?? 0), capMicroUsd: await pastCap(db, input.planId, month) };
  return {
    planId: toPublicId("plan", input.planId),
    window: left(storedWindow({ usedMicroUsd: row.fiveHourUsed, resetsAt: row.fiveHourResetsAt }), plan?.fiveHourLimitMicroUsd, input.now),
    week: left(storedWindow({ usedMicroUsd: row.weekUsed, resetsAt: row.weekResetsAt }), plan?.weekLimitMicroUsd, input.now),
    extra: { ...extra, month },
    monthMicroUsd: Number(totals?.cost ?? 0),
    requestsThisMonth: totals?.requests ?? 0,
    runsThisMonth: runs?.runs ?? 0,
  };
}
