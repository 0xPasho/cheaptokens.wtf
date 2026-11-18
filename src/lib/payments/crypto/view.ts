/** Lo que el diálogo de depósito necesita, listo para viajar al cliente: sin bigint y sin nada de la semilla. */
import type { DepositChain } from "./chain";
import type { CryptoConfig, CryptoNetworkId } from "./config";
import { type DepositState, MIN_DEPOSIT_MICRO_USD } from "./deposits";

export interface DepositNetworkView {
  id: CryptoNetworkId;
  address: string;
  /** Red de prueba (devnet, Sepolia) o de ejemplo del modo de desarrollo. */
  testnet: boolean;
  /** Solana Pay o EIP-681, sin monto. */
  walletUrl: string;
  /** µUSD como texto: USDC que ya se vio llegar y todavía no es saldo. */
  incomingMicroUsd: string;
  /** El barrido ya va en camino: falta que la red lo confirme. */
  sweeping: boolean;
}

export interface DepositView {
  balanceMicroUsd: string;
  minMicroUsd: string;
  networks: DepositNetworkView[];
  /** Los últimos depósitos acreditados, del más nuevo al más viejo. */
  credits: { id: string; network: string; amountMicroUsd: string; url: string | null; at: number }[];
  /** Desarrollo local: se puede simular un depósito. */
  simulate: boolean;
}

export function depositView(config: CryptoConfig, chains: DepositChain[], state: DepositState): DepositView {
  const byNetwork = new Map(chains.map((chain) => [chain.network, chain]));
  return {
    balanceMicroUsd: state.balanceMicroUsd.toString(),
    minMicroUsd: MIN_DEPOSIT_MICRO_USD.toString(),
    networks: state.networks.map((network) => ({
      id: network.network,
      address: network.address,
      testnet: network.testnet,
      walletUrl: byNetwork.get(network.network)?.walletUrl(network.address) ?? "",
      incomingMicroUsd: network.incomingMicroUsd.toString(),
      sweeping: network.sweeping,
    })),
    credits: state.credits.map((credit) => ({
      id: credit.id,
      network: credit.network,
      amountMicroUsd: credit.amountMicroUsd.toString(),
      url: credit.url,
      at: credit.at.getTime(),
    })),
    simulate: config.simulate,
  };
}
