/**
 * Llaves derivadas de la semilla (ADR-0058). Cada llave es HMAC-SHA256(semilla, ruta): la misma semilla y la
 * misma ruta dan siempre la misma llave, así que no hay que guardar ninguna.
 *
 * `DOMAIN` y la forma de la ruta no se tocan: cambiarlas cambia todas las direcciones de depósito y deja
 * sin llave lo que llegue a las anteriores. Lo verifica `tests/unit/deposits.test.ts` con direcciones fijas.
 */
import { createHmac } from "node:crypto";

import type { CryptoNetworkId } from "./config";

const DOMAIN = "cheapllm.wtf/usdc/v1";

function derive(seed: string, path: string): Uint8Array {
  return new Uint8Array(createHmac("sha256", seed).update(`${DOMAIN}/${path}`).digest());
}

/** La llave de la dirección de depósito de un workspace en una red. */
export function depositKey(seed: string, network: CryptoNetworkId, workspaceId: string): Uint8Array {
  return derive(seed, `deposit/${network}/${workspaceId}`);
}

/**
 * La llave de la wallet que paga las comisiones de red de los barridos: el fee payer en Solana, el relayer
 * en Base. Solo guarda SOL o ETH para comisiones; el USDC nunca pasa por ella.
 */
export function feeKey(seed: string, network: CryptoNetworkId): Uint8Array {
  return derive(seed, `fees/${network}`);
}
