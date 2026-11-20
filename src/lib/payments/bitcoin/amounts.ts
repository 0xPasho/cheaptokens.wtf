/**
 * Montos y links de Bitcoin, sin nada del servidor: los usan las cotizaciones y el diálogo de pago (ADR-0063).
 * Un BTC son 100 millones de sats. Los precios viajan en µUSD por BTC: 1 BTC = $94,580 es `94_580_000_000`.
 */

export const SATS_PER_BTC = BigInt(100_000_000);
const ZERO = BigInt(0);

/** `41234` → `"0.00041234"`. El monto literal que se escribe en una wallet: con punto y siempre con 8 decimales. */
export function btcDecimal(sats: bigint): string {
  const sign = sats < ZERO ? "-" : "";
  const value = sats < ZERO ? -sats : sats;
  return `${sign}${value / SATS_PER_BTC}.${(value % SATS_PER_BTC).toString().padStart(8, "0")}`;
}

/** Cuántos sats pagan `micros` a ese precio. Hacia arriba: quien envía lo cotizado nunca recibe un µUSD menos. */
export function satsForMicroUsd(micros: bigint, rateMicroUsd: bigint): bigint {
  if (rateMicroUsd <= ZERO) throw new Error("The rate must be positive");
  return (micros * SATS_PER_BTC + rateMicroUsd - BigInt(1)) / rateMicroUsd;
}

/** Cuánto valen `sats` a ese precio. Hacia abajo: nunca se acredita de más. */
export function microUsdForSats(sats: bigint, rateMicroUsd: bigint): bigint {
  return (sats * rateMicroUsd) / SATS_PER_BTC;
}

/** BIP21: la wallet abre el envío con la dirección y, si se da, el monto puestos. */
export function bip21Url(address: string, sats?: bigint): string {
  const params = sats !== undefined && sats > ZERO ? `amount=${btcDecimal(sats)}&label=cheapllm.wtf` : "label=cheapllm.wtf";
  return `bitcoin:${address}?${params}`;
}
