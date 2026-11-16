/** Arma el estado de cobro (ADR-0049) a partir de filas de la base. Sin I/O. */
import { partnerPlan } from "@/lib/partner/tiers";

import { type OverflowMode, overflowMonthKey, type OverflowSettings, type PlanUsage, type StoredWindow } from "./limits";
import { isPlanId, type Plan, PLANS } from "./plans";

export interface SubscriptionRow {
  planId: string;
  status: "active" | "past_due" | "canceled";
  currentPeriodEnd: Date;
}

/**
 * El plan vale mientras la suscripción esté activa y dentro de su periodo (aunque se vaya a cancelar al final).
 * Además de los planes públicos están los que abre un socio por la puerta de socios (docs/17).
 */
export function activePlan(subscription: SubscriptionRow | null, now: number): Plan | null {
  if (!subscription || subscription.status !== "active") return null;
  if (subscription.currentPeriodEnd.getTime() <= now) return null;
  return isPlanId(subscription.planId) ? PLANS[subscription.planId] : partnerPlan(subscription.planId);
}

export function storedWindow(row: { usedMicroUsd: bigint | null; resetsAt: Date | null } | null): StoredWindow | null {
  if (!row || row.usedMicroUsd === null || row.resetsAt === null) return null;
  return { usedMicroUsd: row.usedMicroUsd, resetsAt: row.resetsAt.getTime() };
}

export function planUsage(
  subscription: SubscriptionRow | null,
  fiveHour: StoredWindow | null,
  week: StoredWindow | null,
  now: number,
): PlanUsage | null {
  const plan = activePlan(subscription, now);
  return plan ? { plan, fiveHour, week } : null;
}

export interface WorkspaceOverflowRow {
  overflowMode: OverflowMode;
  overflowPacks: boolean;
  overflowCredits: boolean;
  overflowCapMicroUsd: bigint;
  overflowMonth: string | null;
  overflowSpentMicroUsd: bigint;
}

/** El gasto de excedente de otro mes no cuenta: el tope se reinicia cada mes (UTC). */
export function overflowSettings(row: WorkspaceOverflowRow, now: number): OverflowSettings {
  return {
    mode: row.overflowMode,
    packs: row.overflowPacks,
    credits: row.overflowCredits,
    capMicroUsd: row.overflowCapMicroUsd,
    spentThisMonthMicroUsd: row.overflowMonth === overflowMonthKey(now) ? row.overflowSpentMicroUsd : BigInt(0),
  };
}
