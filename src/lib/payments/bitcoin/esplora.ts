/**
 * Lo que la detección de pagos necesita de la cadena (ADR-0063), leído de una API Esplora: mempool.space por
 * default, o una instancia propia. Las pruebas usan una cadena falsa con la misma forma.
 */

/** Una salida de una transacción que paga una dirección nuestra. */
export interface ChainPayment {
  txid: string;
  vout: number;
  sats: bigint;
  /** Null: todavía en el mempool. */
  blockHeight: number | null;
  /** Hora del bloque en ms, si ya entró. */
  blockTime: number | null;
}

export interface BitcoinChain {
  /** False: red de ejemplo del modo de desarrollo. No lee nada. */
  readonly live: boolean;
  /** Lo que paga a la dirección: lo del mempool y lo confirmado más reciente. */
  payments(address: string): Promise<ChainPayment[]>;
  tipHeight(): Promise<number>;
}

export class EsploraError extends Error {
  /** El status HTTP, o null si no hubo respuesta. 429: nos están limitando. */
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

interface EsploraTx {
  txid: string;
  vout: { scriptpubkey_address?: string; value: number }[];
  status: { confirmed: boolean; block_height?: number; block_time?: number };
}

export class EsploraChain implements BitcoinChain {
  readonly live = true;

  constructor(private readonly baseUrl: string, private readonly fetchImpl: typeof fetch = fetch) {}

  private async get(path: string): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, { signal: AbortSignal.timeout(15_000) });
    } catch (error) {
      throw new EsploraError(`${path}: ${error instanceof Error ? error.message : "request failed"}`, null);
    }
    if (!response.ok) throw new EsploraError(`${path}: HTTP ${response.status}`, response.status);
    return response;
  }

  async payments(address: string): Promise<ChainPayment[]> {
    // Hasta 50 del mempool y las 25 confirmadas más recientes. Una dirección cambia al recibir, así que casi nunca tiene más.
    const txs = await (await this.get(`/address/${encodeURIComponent(address)}/txs`)).json() as EsploraTx[];
    const result: ChainPayment[] = [];
    for (const tx of txs) {
      tx.vout.forEach((output, vout) => {
        if (output.scriptpubkey_address !== address || !Number.isSafeInteger(output.value) || output.value <= 0) return;
        result.push({
          txid: tx.txid,
          vout,
          sats: BigInt(output.value),
          blockHeight: tx.status.confirmed && tx.status.block_height !== undefined ? tx.status.block_height : null,
          blockTime: tx.status.confirmed && tx.status.block_time !== undefined ? tx.status.block_time * 1000 : null,
        });
      });
    }
    return result;
  }

  async tipHeight(): Promise<number> {
    const height = Number((await (await this.get("/blocks/tip/height")).text()).trim());
    if (!Number.isSafeInteger(height) || height <= 0) throw new EsploraError("/blocks/tip/height: not a height", null);
    return height;
  }
}

/** Red de ejemplo del modo de desarrollo: los pagos se simulan desde el diálogo. */
export const exampleChain: BitcoinChain = {
  live: false,
  payments: async () => [],
  tipHeight: async () => 0,
};
