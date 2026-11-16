/**
 * Los planes que un socio abre por la puerta de socios (docs/17). Funcionan como los planes públicos de
 * ADR-0049 (ventana de 5 horas y semana en valor de uso, en µUSD), pero no se venden en el sitio: solo los
 * abre un socio, que paga cada asiento. Son valores iniciales y hay que calibrarlos igual que los públicos
 * (ADR-0049 › Margen). Cambiarlos aplica desde el siguiente request.
 */
import type { Plan } from "@/lib/billing/plans";

export const PARTNER_TIERS = ["plan-3", "plan-9", "plan-49", "plan-99"] as const;
export type PartnerTier = (typeof PARTNER_TIERS)[number];

export interface PartnerPlan extends Omit<Plan, "id"> {
  id: PartnerTier;
}

const cents = (value: number) => BigInt(value) * BigInt(10_000);

/**
 * La semana es el 60 % del precio, como en Plus, Pro y Max; la ventana, el 14 % (la proporción de Pro).
 * Así un asiento usado al máximo tiene el mismo margen que un plan público.
 */
export const PARTNER_PLANS: Readonly<Record<PartnerTier, PartnerPlan>> = {
  "plan-3": { id: "plan-3", priceMicroUsd: cents(300), fiveHourLimitMicroUsd: cents(42), weekLimitMicroUsd: cents(180), rateLimitRpm: 120 },
  "plan-9": { id: "plan-9", priceMicroUsd: cents(900), fiveHourLimitMicroUsd: cents(126), weekLimitMicroUsd: cents(540), rateLimitRpm: 60 },
  "plan-49": { id: "plan-49", priceMicroUsd: cents(4_900), fiveHourLimitMicroUsd: cents(686), weekLimitMicroUsd: cents(2_940), rateLimitRpm: 120 },
  "plan-99": { id: "plan-99", priceMicroUsd: cents(9_900), fiveHourLimitMicroUsd: cents(1_386), weekLimitMicroUsd: cents(5_940), rateLimitRpm: 200 },
};

export function isPartnerTier(value: unknown): value is PartnerTier {
  return typeof value === "string" && (PARTNER_TIERS as readonly string[]).includes(value);
}

/**
 * El plan de una suscripción de socio, como lo usan la admisión y el cobro. Ellos solo leen los límites y el
 * rate limit, nunca el `id`; el dashboard sí lo lee, y un asiento de socio no tiene sesión en el dashboard.
 */
export function partnerPlan(id: string): Plan | null {
  return isPartnerTier(id) ? (PARTNER_PLANS[id] as Omit<Plan, "id"> as Plan) : null;
}
