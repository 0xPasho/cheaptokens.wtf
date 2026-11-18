/** Lo que el barrido necesita de cada red (ADR-0058). Solana y Base lo implementan; las pruebas usan una cadena falsa. */
import type { CryptoNetworkId } from "./config";

/** Un barrido ya firmado. Su id se conoce antes de enviarlo, así que se guarda primero y se envía después. */
export interface PreparedSweep {
  /** La firma en Solana, el hash en Base. */
  txId: string;
  /** Hasta cuándo puede entrar: en Solana, la última altura de bloque válida; en Base, el `validBefore` (segundos). */
  lastValid: bigint;
  /** Base: el nonce de la autorización EIP-3009. */
  authNonce: string | null;
  /**
   * Envía la transacción. Lanza `RpcError` con `code` si el nodo la rechazó (no salió a la red); cualquier
   * otro error deja el resultado sin saber, y lo resuelve `sweepStates`.
   */
  send(): Promise<void>;
}

export interface SweepRef {
  txId: string;
  address: string;
  lastValid: bigint;
  authNonce: string | null;
}

export type SweepState =
  | { state: "pending" | "confirmed" }
  /** `expired`: ya no puede entrar. `reverted`: entró y falló. */
  | { state: "failed"; reason: "expired" | "reverted" };

export interface FeeWallet {
  address: string;
  /** En la unidad mínima de la red: lamports o wei. */
  balance: bigint;
  /** Queda para pocos barridos: hay que fondearla. */
  low: boolean;
}

export interface DepositChain {
  readonly network: CryptoNetworkId;
  /** False: red de ejemplo del modo de desarrollo. Solo deriva direcciones; no lee ni envía nada. */
  readonly live: boolean;
  readonly testnet: boolean;
  /** La dirección de depósito de un workspace. Siempre la misma: sale de la semilla. */
  depositAddress(workspaceId: string): Promise<string>;
  /** USDC que hay ahora en cada dirección. Las que no aparecen tienen cero. */
  balances(addresses: string[]): Promise<Map<string, bigint>>;
  /** Firma el barrido de `amount` de la dirección del workspace a la wallet principal. */
  prepareSweep(workspaceId: string, amountMicroUsd: bigint, now: number): Promise<PreparedSweep>;
  sweepStates(sweeps: SweepRef[], now: number): Promise<Map<string, SweepState>>;
  feeWallet(): Promise<FeeWallet>;
  explorerTxUrl(txId: string): string;
  /** Link que abre la wallet con el USDC y la dirección puestos. */
  walletUrl(address: string): string;
}

export class RpcError extends Error {
  /** El código JSON-RPC si el nodo respondió con un error; null si no hubo respuesta (red, timeout, HTTP). */
  constructor(message: string, readonly code: number | null) {
    super(message);
  }
}

/** Una llamada JSON-RPC. Los dos adaptadores la comparten. */
export async function jsonRpc<T>(url: string, method: string, params: unknown[], fetchImpl: typeof fetch = fetch): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new RpcError(`${method}: ${error instanceof Error ? error.message : "request failed"}`, null);
  }
  if (!response.ok) throw new RpcError(`${method}: HTTP ${response.status}`, null);
  const body = await response.json() as { result?: T; error?: { code?: number; message?: string } };
  if (body.error) throw new RpcError(`${method}: ${body.error.message ?? "error"}`, body.error.code ?? 0);
  return body.result as T;
}

export function chunks<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}
