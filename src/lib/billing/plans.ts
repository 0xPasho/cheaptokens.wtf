/**
 * Planes y paquetes (ADR-0049). Todo el dinero en µUSD (ADR-0007).
 *
 * Los límites se miden en valor de uso a precio cheaptokens.wtf: cada request descuenta lo mismo
 * que costaría en créditos. Son valores iniciales: hay que calibrarlos con el costo upstream real
 * (ver ADR-0049 › Margen). Cambiarlos aplica desde el siguiente request.
 */

export const PLAN_IDS = ["plus", "pro", "max"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface Plan {
  id: PlanId;
  /** Precio mensual. */
  priceMicroUsd: bigint;
  /** Valor de uso por ventana de 5 horas. */
  fiveHourLimitMicroUsd: bigint;
  /** Valor de uso por semana. */
  weekLimitMicroUsd: bigint;
  /** Requests por minuto del workspace mientras el plan está activo. */
  rateLimitRpm: number;
}

const usd = (dollars: number) => BigInt(Math.round(dollars * 100)) * BigInt(10_000);

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  plus: { id: "plus", priceMicroUsd: usd(20), fiveHourLimitMicroUsd: usd(2.5), weekLimitMicroUsd: usd(12), rateLimitRpm: 60 },
  pro: { id: "pro", priceMicroUsd: usd(50), fiveHourLimitMicroUsd: usd(7), weekLimitMicroUsd: usd(30), rateLimitRpm: 120 },
  max: { id: "max", priceMicroUsd: usd(150), fiveHourLimitMicroUsd: usd(22), weekLimitMicroUsd: usd(90), rateLimitRpm: 300 },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export const HOUR_MS = 60 * 60 * 1000;
export const FIVE_HOUR_MS = 5 * HOUR_MS;
export const WEEK_MS = 7 * 24 * HOUR_MS;
/** Duración de un periodo de suscripción. El MoR manda la fecha real; esto solo lo usa el proveedor de desarrollo. */
export const PERIOD_MS = 30 * 24 * HOUR_MS;

/** Bono de los paquetes por modelo: pagas X y recibes X × 1.2 de uso. */
export const PACK_BONUS_BPS = 2000;
export const PACK_VALIDITY_MS = 90 * 24 * HOUR_MS;

/** Modelos con paquete y su precio. Cada `modelId` debe existir en el catálogo (lo comprueba una prueba). */
export const PACK_OFFERS: readonly { modelId: string; priceMicroUsd: bigint }[] = [
  { modelId: "anthropic/claude-opus-5.5", priceMicroUsd: usd(20) },
  { modelId: "anthropic/claude-fable-5.2", priceMicroUsd: usd(25) },
  { modelId: "openai/gpt-6.1-sol", priceMicroUsd: usd(10) },
  { modelId: "anthropic/claude-sonnet-5.5", priceMicroUsd: usd(10) },
];

export function packOffer(modelId: string) {
  return PACK_OFFERS.find((offer) => offer.modelId === modelId) ?? null;
}

export function packGrant(paidMicroUsd: bigint): bigint {
  return (paidMicroUsd * BigInt(10_000 + PACK_BONUS_BPS)) / BigInt(10_000);
}

/** Montos de recarga (docs/02 › Créditos). */
export const TOPUP_PRESETS_MICRO_USD = [usd(10), usd(25), usd(50), usd(100)] as const;
export const TOPUP_MIN_MICRO_USD = usd(10);
export const TOPUP_MAX_MICRO_USD = usd(1000);

/** Una request típica para comparar modelos: 20 mil tokens de entrada y 2 mil de salida. */
export const TYPICAL_REQUEST = { promptTokens: 20_000, completionTokens: 2_000 } as const;
/** Modelo de referencia del multiplicador (1×). */
export const REFERENCE_MODEL_ID = "anthropic/claude-sonnet-5.5";
