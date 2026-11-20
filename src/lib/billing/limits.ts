/**
 * Reglas de cobro del plan, los paquetes y los créditos (ADR-0049). Funciones puras: las usan
 * la admisión del gateway (antes del request), el cobro en `after()` y el dashboard.
 */
import { FIVE_HOUR_MS, type Plan, WEEK_MS } from "./plans";

const ZERO = BigInt(0);

export type BillingSource = "plan_then_prepaid" | "plan_only" | "prepaid_only";
export type OverflowMode = "continue" | "stop";
export type WindowKind = "five_hour" | "week";

export const WINDOW_LENGTH_MS: Record<WindowKind, number> = { five_hour: FIVE_HOUR_MS, week: WEEK_MS };

/** Una ventana guardada. Si `resetsAt` ya pasó, cuenta como vacía. */
export interface StoredWindow {
  usedMicroUsd: bigint;
  /** Milisegundos Unix. */
  resetsAt: number;
}

export interface PlanUsage {
  plan: Plan;
  fiveHour: StoredWindow | null;
  week: StoredWindow | null;
}

export interface OverflowSettings {
  mode: OverflowMode;
  packs: boolean;
  credits: boolean;
  capMicroUsd: bigint;
  /** Créditos usados como excedente en el mes en curso (ya normalizado al mes de `now`). */
  spentThisMonthMicroUsd: bigint;
}

export function activeWindow(window: StoredWindow | null, now: number): StoredWindow | null {
  return window && window.resetsAt > now ? window : null;
}

export function windowUsed(window: StoredWindow | null, now: number): bigint {
  return activeWindow(window, now)?.usedMicroUsd ?? ZERO;
}

/** Lo que queda del plan: el menor de los dos límites. Nunca negativo. */
export function planRemaining(usage: PlanUsage, now: number): bigint {
  const fiveHour = usage.plan.fiveHourLimitMicroUsd - windowUsed(usage.fiveHour, now);
  const week = usage.plan.weekLimitMicroUsd - windowUsed(usage.week, now);
  const left = fiveHour < week ? fiveHour : week;
  return left > ZERO ? left : ZERO;
}

/** Cuándo vuelve a haber límite, si hoy está agotado. Manda la semana si está llena. */
export function planResumesAt(usage: PlanUsage, now: number): number | null {
  if (planRemaining(usage, now) > ZERO) return null;
  const week = activeWindow(usage.week, now);
  if (week && week.usedMicroUsd >= usage.plan.weekLimitMicroUsd) return week.resetsAt;
  return activeWindow(usage.fiveHour, now)?.resetsAt ?? null;
}

/** Fracción usada de una ventana, de 0 a 1. */
export function windowFraction(window: StoredWindow | null, limit: bigint, now: number): number {
  if (limit <= ZERO) return 1;
  const used = windowUsed(window, now);
  return Math.min(1, Number((used * BigInt(10_000)) / limit) / 10_000);
}

export interface PrepaidRules {
  packs: boolean;
  credits: boolean;
  /** True si el prepago se usa porque el plan se agotó: aplica el tope mensual. */
  overflow: boolean;
}

/** Qué prepago puede usar un request, según la key, si hay plan y los ajustes de excedente. */
export function prepaidRules(source: BillingSource, hasPlan: boolean, overflow: OverflowSettings): PrepaidRules {
  if (source === "plan_only") return { packs: false, credits: false, overflow: false };
  if (source === "prepaid_only" || !hasPlan) return { packs: true, credits: true, overflow: false };
  if (overflow.mode === "stop") return { packs: false, credits: false, overflow: true };
  return { packs: overflow.packs, credits: overflow.credits, overflow: true };
}

export function overflowCapLeft(overflow: OverflowSettings): bigint {
  const left = overflow.capMicroUsd - overflow.spentThisMonthMicroUsd;
  return left > ZERO ? left : ZERO;
}

export type AdmissionError = "usage_limit_reached" | "no_active_plan" | "insufficient_credits";

export type AdmissionFailure = { ok: false; code: AdmissionError; retryAt: number | null };

export type Admission = { ok: true; usesPlan: boolean } | AdmissionFailure;

export interface AdmissionInput {
  source: BillingSource;
  /** Null si el workspace no tiene un plan activo. */
  plan: PlanUsage | null;
  overflow: OverflowSettings;
  balanceMicroUsd: bigint;
  /** Saldo de paquetes del modelo pedido. Solo hace falta cuando el plan no alcanza. */
  packBalanceMicroUsd: bigint;
  now: number;
}

/**
 * Antes del request: pasa si hay plan con límite, o paquete del modelo, o créditos permitidos.
 * El costo todavía no se conoce; el cobro lo reparte después (ver `splitCharge`).
 */
export function admit(input: AdmissionInput): Admission {
  const { source, plan, overflow, now } = input;
  if (source !== "prepaid_only" && plan && planRemaining(plan, now) > ZERO) return { ok: true, usesPlan: true };
  if (source === "plan_only" && !plan) return { ok: false, code: "no_active_plan", retryAt: null };

  const rules = prepaidRules(source, plan !== null, overflow);
  const hasPack = rules.packs && input.packBalanceMicroUsd > ZERO;
  const hasCredits = rules.credits && input.balanceMicroUsd > ZERO && (!rules.overflow || overflowCapLeft(overflow) > ZERO);
  if (hasPack || hasCredits) return { ok: true, usesPlan: false };

  if (plan && source !== "prepaid_only") return { ok: false, code: "usage_limit_reached", retryAt: planResumesAt(plan, now) };
  return { ok: false, code: "insufficient_credits", retryAt: null };
}

/**
 * Lo máximo que se le puede cobrar a un request sin absorber nada ni dejar el saldo negativo (ADR-0066): lo que
 * queda del plan, más el paquete y los créditos que la key puede usar. En el excedente, los créditos se acotan
 * también con lo que queda del tope del mes.
 */
export function admissionBudget(input: AdmissionInput): bigint {
  const { source, plan, overflow, now } = input;
  let budget = source !== "prepaid_only" && plan ? planRemaining(plan, now) : ZERO;
  const rules = prepaidRules(source, plan !== null, overflow);
  if (rules.packs && input.packBalanceMicroUsd > ZERO) budget += input.packBalanceMicroUsd;
  if (rules.credits && input.balanceMicroUsd > ZERO) {
    const cap = rules.overflow ? overflowCapLeft(overflow) : input.balanceMicroUsd;
    budget += input.balanceMicroUsd < cap ? input.balanceMicroUsd : cap;
  }
  return budget;
}

/**
 * El request no cabe en lo que queda, aunque quede algo (ADR-0066). Mismo código que si no quedara nada. Con plan,
 * vuelve a caber cuando se reinicia la primera ventana activa.
 */
export function budgetShortfall(source: BillingSource, plan: PlanUsage | null, now: number): AdmissionFailure & { code: "usage_limit_reached" | "insufficient_credits" } {
  if (!plan || source === "prepaid_only") return { ok: false, code: "insufficient_credits", retryAt: null };
  const resets = [activeWindow(plan.fiveHour, now), activeWindow(plan.week, now)]
    .filter((window): window is StoredWindow => window !== null).map((window) => window.resetsAt);
  return { ok: false, code: "usage_limit_reached", retryAt: planResumesAt(plan, now) ?? (resets.length > 0 ? Math.min(...resets) : null) };
}

export interface ChargeSplit {
  plan: bigint;
  pack: bigint;
  credits: bigint;
  /** Lo que nadie paga: lo absorbemos (excedente apagado o tope alcanzado). */
  absorbed: bigint;
}

export interface SplitInput {
  costMicroUsd: bigint;
  source: BillingSource;
  plan: PlanUsage | null;
  overflow: OverflowSettings;
  packBalanceMicroUsd: bigint;
  now: number;
}

/**
 * Después del request: reparte el costo plan → paquete → créditos. El request no se corta: desde ADR-0066 se
 * admite solo si su costo máximo cabe en `admissionBudget` (descontadas las reservas en curso), así que lo que
 * queda para `absorbed` o para un saldo negativo es lo que el upstream cobre por encima de esa estimación.
 */
export function splitCharge(input: SplitInput): ChargeSplit {
  const split: ChargeSplit = { plan: ZERO, pack: ZERO, credits: ZERO, absorbed: ZERO };
  let rest = input.costMicroUsd;
  if (rest <= ZERO) return split;

  if (input.source !== "prepaid_only" && input.plan) {
    const left = planRemaining(input.plan, input.now);
    split.plan = left < rest ? left : rest;
    rest -= split.plan;
  }
  if (rest > ZERO) {
    const rules = prepaidRules(input.source, input.plan !== null, input.overflow);
    if (rules.packs && input.packBalanceMicroUsd > ZERO) {
      split.pack = input.packBalanceMicroUsd < rest ? input.packBalanceMicroUsd : rest;
      rest -= split.pack;
    }
    if (rest > ZERO && rules.credits) {
      const cap = rules.overflow ? overflowCapLeft(input.overflow) : rest;
      split.credits = cap < rest ? cap : rest;
      rest -= split.credits;
    }
  }
  split.absorbed = rest;
  return split;
}

/** Ventana después de sumarle un consumo: la abre si no estaba activa. */
export function addToWindow(window: StoredWindow | null, kind: WindowKind, amount: bigint, now: number): StoredWindow & { startedAt: number } {
  const active = activeWindow(window, now);
  if (active) return { ...active, usedMicroUsd: active.usedMicroUsd + amount, startedAt: active.resetsAt - WINDOW_LENGTH_MS[kind] };
  return { usedMicroUsd: amount, resetsAt: now + WINDOW_LENGTH_MS[kind], startedAt: now };
}

/** Primer día del mes (UTC) de `now`, como `YYYY-MM-01`: la llave del tope de excedente. */
export function overflowMonthKey(now: number): string {
  const date = new Date(now);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
