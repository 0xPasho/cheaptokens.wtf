/**
 * Lo que el pago en Bitcoin necesita en el cliente (ADR-0063): sin bigint y sin la xpub. El cliente solo
 * importa los tipos; los links salen de `amounts.ts`, que no trae nada del servidor.
 */
import { bitcoinTxUrl, isBitcoinTestNetwork, MAX_BITCOIN_ORDER_MICRO_USD, MIN_BITCOIN_ORDER_MICRO_USD, QUOTE_WINDOW_MS } from "./config";
import type { BitcoinDeps, BitcoinState } from "./orders";
import type { BitcoinNetworkId } from "./xpub";

export interface BitcoinOrderView {
  id: string;
  intent: "topup" | "plan";
  planId: string | null;
  address: string;
  /** µUSD y sats como texto. */
  amountMicroUsd: string;
  amountSats: string;
  rateMicroUsd: string;
  createdAt: number;
  expiresAt: number;
  /** `plan`, `balance` o `replaced`; null mientras no se resuelva. */
  outcome: string | null;
  /** Lo que ya llegó a esta cotización, a su precio, en µUSD. */
  receivedMicroUsd: string;
  /** Tiene un pago visto que todavía no se confirma. */
  pending: boolean;
}

export interface BitcoinReceiptView {
  id: string;
  orderId: string | null;
  sats: string;
  amountMicroUsd: string;
  /** `quote`: llegó a tiempo. `market`: al precio del momento en que se vio. */
  rateSource: string;
  status: "seen" | "credited";
  /** Ya entró en un bloque: le faltan confirmaciones o está por acreditarse. */
  inBlock: boolean;
  url: string | null;
  seenAt: number;
}

export interface BitcoinView {
  network: BitcoinNetworkId;
  testnet: boolean;
  simulate: boolean;
  /** La dirección vigente: la siguiente cotización la usa. */
  address: string;
  balanceMicroUsd: string;
  minMicroUsd: string;
  maxMicroUsd: string;
  confirmations: number;
  windowMs: number;
  /** La hora del servidor, para que la cuenta regresiva no dependa del reloj del navegador. */
  serverNow: number;
  order: BitcoinOrderView | null;
  receipts: BitcoinReceiptView[];
}

export function bitcoinView(deps: BitcoinDeps, state: BitcoinState, now: number): BitcoinView {
  const { config } = deps;
  return {
    network: config.network,
    testnet: isBitcoinTestNetwork(config),
    simulate: config.simulate,
    address: state.address,
    balanceMicroUsd: state.balanceMicroUsd.toString(),
    minMicroUsd: MIN_BITCOIN_ORDER_MICRO_USD.toString(),
    maxMicroUsd: MAX_BITCOIN_ORDER_MICRO_USD.toString(),
    confirmations: config.confirmations,
    windowMs: QUOTE_WINDOW_MS,
    serverNow: now,
    order: state.order
      ? {
        id: state.order.id,
        intent: state.order.intent,
        planId: state.order.planId,
        address: state.order.address,
        amountMicroUsd: state.order.amountMicroUsd.toString(),
        amountSats: state.order.amountSats.toString(),
        rateMicroUsd: state.order.rateMicroUsd.toString(),
        createdAt: state.order.createdAt.getTime(),
        expiresAt: state.order.expiresAt.getTime(),
        outcome: state.order.outcome,
        receivedMicroUsd: state.order.receivedMicroUsd.toString(),
        pending: state.order.pending,
      }
      : null,
    receipts: state.receipts.flatMap((receipt) => receipt.status === "dropped" ? [] : [{
      id: receipt.id,
      orderId: receipt.orderId,
      sats: receipt.amountSats.toString(),
      amountMicroUsd: receipt.amountMicroUsd.toString(),
      rateSource: receipt.rateSource,
      status: receipt.status,
      inBlock: receipt.blockHeight !== null,
      url: config.simulate ? null : bitcoinTxUrl(config.network, receipt.txid),
      seenAt: receipt.seenAt.getTime(),
    }]),
  };
}
