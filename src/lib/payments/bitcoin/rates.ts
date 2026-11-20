/**
 * El precio de BTC en USD para cotizar y acreditar (ADR-0065): la mediana de Coinbase, Kraken y Bitstamp.
 * Hacen falta al menos dos fuentes que no difieran más de 1 %; si no, no se cotiza. Sin margen encima.
 */

export class RateUnavailableError extends Error {}

export interface RateSource {
  name: string;
  /** µUSD por BTC. */
  read(fetchImpl: typeof fetch): Promise<bigint>;
}

export interface Rate {
  /** µUSD por BTC: 1 BTC = $94,580 es `94_580_000_000`. */
  rateMicroUsd: bigint;
  sources: string[];
  at: number;
}

const MAX_SPREAD_BPS = BigInt(100);
const CACHE_MS = 30_000;
/** Precio fijo del modo de desarrollo, sin red. */
export const EXAMPLE_RATE_MICRO_USD = BigInt(90_000_000_000);

/** `"94580.12"` → `94_580_120_000`. Exacto, sin pasar por un float. */
export function parseUsdMicros(text: string): bigint {
  const match = /^(\d{1,9})(?:\.(\d+))?$/.exec(text.trim());
  if (!match) throw new Error(`Not a price: ${text}`);
  return BigInt(match[1]) * BigInt(1_000_000) + BigInt((match[2] ?? "").slice(0, 6).padEnd(6, "0"));
}

async function json(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(5_000), headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

export const DEFAULT_RATE_SOURCES: readonly RateSource[] = [
  {
    name: "coinbase",
    async read(fetchImpl) {
      const body = await json(fetchImpl, "https://api.coinbase.com/v2/prices/BTC-USD/spot") as { data?: { amount?: string } };
      return parseUsdMicros(String(body.data?.amount));
    },
  },
  {
    name: "kraken",
    async read(fetchImpl) {
      const body = await json(fetchImpl, "https://api.kraken.com/0/public/Ticker?pair=XBTUSD") as {
        error?: string[]; result?: Record<string, { c?: string[] }>;
      };
      if (body.error?.length) throw new Error(`kraken: ${body.error.join(", ")}`);
      const [ticker] = Object.values(body.result ?? {});
      return parseUsdMicros(String(ticker?.c?.[0]));
    },
  },
  {
    name: "bitstamp",
    async read(fetchImpl) {
      const body = await json(fetchImpl, "https://www.bitstamp.net/api/v2/ticker/btcusd/") as { last?: string };
      return parseUsdMicros(String(body.last));
    },
  },
];

/** La mediana: con dos fuentes, el promedio hacia abajo. */
export function medianRate(rates: bigint[]): bigint {
  const sorted = rates.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / BigInt(2);
}

/** De dónde sale el precio. Las pruebas usan uno que cambia cuando quieren. */
export interface RateProvider {
  current(now?: number): Promise<Rate>;
}

export class BitcoinRates implements RateProvider {
  private cached: Rate | null = null;
  private inFlight: Promise<Rate> | null = null;

  constructor(private readonly options: { sources?: readonly RateSource[]; fetchImpl?: typeof fetch; fixed?: bigint } = {}) {}

  /** El precio de ahora. Se reusa 30 segundos: el diálogo abierto y el cron no piden uno en cada revisión. */
  async current(now: number = Date.now()): Promise<Rate> {
    if (this.options.fixed !== undefined) return { rateMicroUsd: this.options.fixed, sources: ["example"], at: now };
    if (this.cached && now - this.cached.at < CACHE_MS) return this.cached;
    this.inFlight ??= this.read(now).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async read(now: number): Promise<Rate> {
    const sources = this.options.sources ?? DEFAULT_RATE_SOURCES;
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const results = await Promise.allSettled(sources.map((source) => source.read(fetchImpl)));
    const read = results.flatMap((result, index) => result.status === "fulfilled" && result.value > BigInt(0)
      ? [{ name: sources[index].name, rate: result.value }]
      : []);
    if (read.length < 2) throw new RateUnavailableError(`Only ${read.length} BTC price source answered`);
    const values = read.map((entry) => entry.rate);
    const min = values.reduce((a, b) => (b < a ? b : a));
    const max = values.reduce((a, b) => (b > a ? b : a));
    if ((max - min) * BigInt(10_000) > min * MAX_SPREAD_BPS) {
      throw new RateUnavailableError(`BTC price sources disagree by more than 1%: ${read.map((entry) => `${entry.name}=${entry.rate}`).join(", ")}`);
    }
    this.cached = { rateMicroUsd: medianRate(values), sources: read.map((entry) => entry.name), at: now };
    return this.cached;
  }
}
