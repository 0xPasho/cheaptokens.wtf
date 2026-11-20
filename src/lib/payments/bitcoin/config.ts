/**
 * Pagos en Bitcoin on-chain (ADR-0065). El servidor solo tiene la xpub de una cuenta: da una dirección por
 * workspace, que cambia cuando recibe un pago, y lo que llega ya está en la wallet del dueño.
 */
import { isLocalDevelopment } from "@/lib/auth/mode";
import { type EnvSource, readSecret } from "@/lib/env";

import { BITCOIN_NETWORK_IDS, type BitcoinNetworkId, BitcoinAccount } from "./xpub";

export interface BitcoinConfig {
  network: BitcoinNetworkId;
  /** La llave pública extendida de la cuenta. No es un secreto que mueva dinero, pero deja ver todos los pagos. */
  xpub: string;
  /** La API Esplora. Vacío: red de ejemplo del modo de desarrollo, sin cadena. */
  esploraUrl: string;
  /** Confirmaciones antes de acreditar. Nunca 0: con full-RBF un pago sin confirmar se puede redirigir. */
  confirmations: number;
  /** Desarrollo local sin xpub: la dirección es de ejemplo y el pago se simula. */
  simulate: boolean;
}

/** Cuánto queda fijo el precio de una cotización. */
export const QUOTE_WINDOW_MS = 15 * 60 * 1000;
/** Lo que se ve llegar hasta este tiempo después del vencimiento todavía usa el precio cotizado: cubre la demora en revisar. */
export const QUOTE_GRACE_MS = 2 * 60 * 1000;
/** Compra mínima y máxima de créditos en una cotización. */
export const MIN_BITCOIN_ORDER_MICRO_USD = BigInt(10_000_000);
export const MAX_BITCOIN_ORDER_MICRO_USD = BigInt(10_000_000_000);
/** Lo que se absorbe para que entre un plan: 2 % de su precio (ADR-0065). */
export const PLAN_TOLERANCE_BPS = BigInt(200);

const ESPLORA_DEFAULTS: Record<BitcoinNetworkId, string> = {
  mainnet: "https://mempool.space/api",
  testnet4: "https://mempool.space/testnet4/api",
  signet: "https://mempool.space/signet/api",
};

/**
 * xpub pública del modo de desarrollo: la cuenta de signet de la frase de ejemplo de BIP84 («abandon … about»).
 * Cualquiera tiene sus llaves: nadie debe enviarle nada.
 */
const DEV_XPUB = "vpub5Y6cjg78GGuNLsaPhmYsiw4gYX3HoQiRBiSwDaBXKUafCt9bNwWQiitDk5VZ5BVxYnQdwoTyXSs2JHRPAgjAvtbBrf8ZhDYe2jWAqvZVnsc";

export function readBitcoinConfig(source: EnvSource = process.env): BitcoinConfig | null {
  const xpub = readSecret("CRYPTO_BITCOIN_XPUB", source);
  const networkName = readSecret("CRYPTO_BITCOIN_NETWORK", source) ?? "mainnet";
  if (!(BITCOIN_NETWORK_IDS as readonly string[]).includes(networkName)) {
    throw new Error(`CRYPTO_BITCOIN_NETWORK must be one of ${BITCOIN_NETWORK_IDS.join(", ")}`);
  }
  const network = networkName as BitcoinNetworkId;
  if (xpub) {
    // Falla al arrancar con una llave privada, de otra red o que no es de una cuenta.
    new BitcoinAccount(xpub, network);
    const confirmations = Number(readSecret("CRYPTO_BITCOIN_CONFIRMATIONS", source) ?? 1);
    if (!Number.isInteger(confirmations) || confirmations < 1) throw new Error("CRYPTO_BITCOIN_CONFIRMATIONS must be a whole number from 1");
    const esploraUrl = (readSecret("CRYPTO_BITCOIN_ESPLORA_URL", source) ?? ESPLORA_DEFAULTS[network]).replace(/\/+$/, "");
    return { network, xpub, esploraUrl, confirmations, simulate: false };
  }
  if (!isLocalDevelopment(source)) return null;
  return { network: "signet", xpub: DEV_XPUB, esploraUrl: "", confirmations: 1, simulate: true };
}

/** Red de prueba o de ejemplo: lo que llegue ahí no es dinero. */
export function isBitcoinTestNetwork(config: BitcoinConfig): boolean {
  return config.network !== "mainnet";
}

/** Link a la transacción en mempool.space: también es el recibo del pago. */
export function bitcoinTxUrl(network: BitcoinNetworkId, txid: string): string {
  return `https://mempool.space/${network === "mainnet" ? "" : `${network}/`}tx/${txid}`;
}
