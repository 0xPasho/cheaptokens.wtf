/**
 * Precio cheaptokens.wtf derivado del oficial (ADR-0010):
 * `precio_cheaptokens = redondear(precio_oficial × (10000 − discount_bps) / 10000)`.
 * Ambos precios en µUSD por 1M de tokens (ADR-0007).
 */
export function applyDiscount(officialMicros: number, discountBps: number) {
  return Math.round((officialMicros * (10_000 - discountBps)) / 10_000);
}
