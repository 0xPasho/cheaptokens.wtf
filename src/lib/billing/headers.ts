import { activeWindow, type PlanUsage, windowFraction } from "./limits";

/**
 * Headers con lo que queda del plan antes del request (ADR-0049, docs/04 › Límites del plan).
 * Fracciones de 0 a 1 con dos decimales y reinicios en ISO 8601. Nunca nombran al upstream.
 */
export function planUsageHeaders(plan: PlanUsage | null, now: number): Record<string, string> {
  if (!plan) return {};
  const remaining = (fraction: number) => String(Math.floor((1 - fraction) * 100) / 100);
  const headers: Record<string, string> = {
    "x-usage-window-remaining": remaining(windowFraction(plan.fiveHour, plan.plan.fiveHourLimitMicroUsd, now)),
    "x-usage-week-remaining": remaining(windowFraction(plan.week, plan.plan.weekLimitMicroUsd, now)),
  };
  const fiveHour = activeWindow(plan.fiveHour, now);
  const week = activeWindow(plan.week, now);
  if (fiveHour) headers["x-usage-window-reset"] = new Date(fiveHour.resetsAt).toISOString();
  if (week) headers["x-usage-week-reset"] = new Date(week.resetsAt).toISOString();
  return headers;
}
