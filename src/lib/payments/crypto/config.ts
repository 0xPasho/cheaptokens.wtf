/**
 * Pagos en USDC (ADR-0058). Cada workspace tiene su dirección de depósito en cada red. Lo que llega se barre
 * a la wallet principal de esa red (`CRYPTO_*_ADDRESS`) y se acredita como saldo.
 *
 * Las llaves de las direcciones de depósito salen de `CRYPTO_DEPOSIT_SEED`: es el único secreto, y nunca
 * viaja al cliente ni a los logs. La llave de la wallet principal nunca pasa por el servidor.
 */
import { isAddress as isSolanaAddress } from "@solana/kit";
import { getAddress, isAddress as isEvmAddress } from "viem";

import { isLocalDevelopment } from "@/lib/auth/mode";
import { type EnvSource, readSecret } from "@/lib/env";

export type CryptoNetworkId = "solana" | "base";
export const CRYPTO_NETWORK_IDS: readonly CryptoNetworkId[] = ["solana", "base"];

export interface SolanaConfig {
  id: "solana";
  /** La wallet principal. Todo lo barrido llega a su cuenta de USDC, que tiene que existir. */
  treasury: string;
  /** Vacío: red de ejemplo del modo de desarrollo, sin cadena. */
  rpcUrl: string;
  mint: string;
  cluster: "mainnet" | "devnet";
}

export interface BaseConfig {
  id: "base";
  treasury: string;
  rpcUrl: string;
  /** El contrato de USDC en Base. */
  token: string;
  chainId: number;
  /** Bloques de espera antes de dar por firme un barrido. */
  confirmations: number;
}

export type NetworkConfig = SolanaConfig | BaseConfig;

export interface CryptoConfig {
  networks: NetworkConfig[];
  /** De aquí salen todas las llaves. Null: no hay pagos. */
  seed: string | null;
  /** Desarrollo local sin redes reales: las direcciones son de ejemplo y el depósito se simula. */
  simulate: boolean;
}

export const SOLANA_MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOLANA_DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const BASE_MAINNET_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const BASE_MAINNET_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

/** Menos que esto no es una semilla: se genera con `pnpm payments:status --new-seed` (32 bytes al azar). */
const MIN_SEED_LENGTH = 32;

/** Semilla pública del modo de desarrollo. Sus direcciones solo llenan la pantalla: nadie debe enviarles nada. */
const DEV_SEED = "cheapllm.wtf local development seed (public, never fund)";
const DEV_SOLANA_TREASURY = "11111111111111111111111111111111";
const DEV_BASE_TREASURY = "0x000000000000000000000000000000000000dEaD";

export function readCryptoConfig(source: EnvSource = process.env): CryptoConfig {
  const seed = readSecret("CRYPTO_DEPOSIT_SEED", source);
  if (seed !== null && seed.length < MIN_SEED_LENGTH) throw new Error(`CRYPTO_DEPOSIT_SEED must have at least ${MIN_SEED_LENGTH} characters`);
  const networks: NetworkConfig[] = [];

  const solana = readSecret("CRYPTO_SOLANA_ADDRESS", source);
  if (solana) {
    if (!isSolanaAddress(solana)) throw new Error("CRYPTO_SOLANA_ADDRESS is not a Solana address");
    const cluster = readSecret("CRYPTO_SOLANA_CLUSTER", source) === "devnet" ? "devnet" : "mainnet";
    networks.push({
      id: "solana",
      treasury: solana,
      cluster,
      rpcUrl: readSecret("CRYPTO_SOLANA_RPC_URL", source)
        ?? (cluster === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com"),
      mint: cluster === "devnet" ? SOLANA_DEVNET_USDC : SOLANA_MAINNET_USDC,
    });
  }

  const base = readSecret("CRYPTO_BASE_ADDRESS", source);
  if (base) {
    // Con mayúsculas y minúsculas, como la muestra la wallet: así un error al copiarla no pasa la suma de control.
    if (!isEvmAddress(base) || getAddress(base) !== base) {
      throw new Error("CRYPTO_BASE_ADDRESS must be a checksummed address (mixed case), exactly as your wallet shows it");
    }
    const sepolia = readSecret("CRYPTO_BASE_CHAIN", source) === "sepolia";
    const confirmations = Number(readSecret("CRYPTO_BASE_CONFIRMATIONS", source) ?? 10);
    if (!Number.isInteger(confirmations) || confirmations < 0) throw new Error("CRYPTO_BASE_CONFIRMATIONS must be a whole number");
    networks.push({
      id: "base",
      treasury: base,
      chainId: sepolia ? BASE_SEPOLIA_CHAIN_ID : BASE_MAINNET_CHAIN_ID,
      rpcUrl: readSecret("CRYPTO_BASE_RPC_URL", source) ?? (sepolia ? "https://sepolia.base.org" : "https://mainnet.base.org"),
      token: sepolia ? BASE_SEPOLIA_USDC : BASE_MAINNET_USDC,
      confirmations,
    });
  }

  // Una red sin semilla no puede barrer lo que recibe: no se ofrece.
  if (seed !== null && networks.length > 0) return { networks, seed, simulate: false };
  if (!isLocalDevelopment(source)) return { networks: [], seed: null, simulate: false };
  return {
    seed: DEV_SEED,
    simulate: true,
    networks: [
      { id: "solana", treasury: DEV_SOLANA_TREASURY, cluster: "devnet", rpcUrl: "", mint: SOLANA_DEVNET_USDC },
      { id: "base", treasury: DEV_BASE_TREASURY, chainId: BASE_SEPOLIA_CHAIN_ID, rpcUrl: "", token: BASE_SEPOLIA_USDC, confirmations: 0 },
    ],
  };
}

export function paymentsAvailable(config: CryptoConfig = readCryptoConfig()): boolean {
  return config.seed !== null && config.networks.length > 0;
}

/** Red de prueba (devnet, Sepolia) o de ejemplo: lo que llegue ahí no es dinero. */
export function isTestNetwork(network: NetworkConfig): boolean {
  return network.id === "solana" ? network.cluster !== "mainnet" : network.chainId !== BASE_MAINNET_CHAIN_ID;
}

/** Link a la transacción en el explorador de cada red: también es el recibo del depósito. */
export function explorerTxUrl(network: NetworkConfig, txId: string): string {
  if (network.id === "solana") {
    return `https://solscan.io/tx/${txId}${network.cluster === "devnet" ? "?cluster=devnet" : ""}`;
  }
  return `https://${network.chainId === BASE_SEPOLIA_CHAIN_ID ? "sepolia." : ""}basescan.org/tx/${txId}`;
}
