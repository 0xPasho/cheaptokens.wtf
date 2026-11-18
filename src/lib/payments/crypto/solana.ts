/**
 * USDC en Solana (ADR-0058). La dirección de depósito de un workspace es una wallet cuya llave sale de la
 * semilla; el USDC llega a su cuenta de token asociada. El barrido es una transferencia a la cuenta de USDC
 * de la wallet principal: la firma la llave del depósito y la comisión la paga otra wallet (el fee payer),
 * así que la dirección de depósito nunca necesita SOL.
 */
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import { findAssociatedTokenPda, getTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  type Address, address, appendTransactionMessageInstructions, blockhash, createKeyPairSignerFromPrivateKeyBytes, createTransactionMessage,
  getBase64EncodedWireTransaction, getSignatureFromTransaction, type KeyPairSigner, pipe, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, signTransactionMessageWithSigners, type TransactionSigner,
} from "@solana/kit";

import { chunks, type DepositChain, type FeeWallet, jsonRpc, type PreparedSweep, type SweepRef, type SweepState } from "./chain";
import { explorerTxUrl, isTestNetwork, type SolanaConfig } from "./config";
import { depositKey, feeKey } from "./keys";
import { solanaPayUrl } from "./usdc";

const USDC_DECIMALS = 6;
/** Dónde está el saldo (u64) dentro de una cuenta de token. */
const TOKEN_AMOUNT_OFFSET = 64;
/** Una transferencia de token gasta unos cientos de unidades de cómputo (405 medidas en mainnet): el tope deja margen de sobra. */
export const COMPUTE_UNIT_LIMIT = 20_000;
/** Prioridad en microlamports por unidad: unos 2,000 lamports por barrido, para que entre aunque la red esté cargada. */
const COMPUTE_UNIT_PRICE = 100_000;
/** Con menos de 0.005 SOL quedan unos cientos de barridos: hay que fondear. */
const LOW_FEE_BALANCE = BigInt(5_000_000);
const ACCOUNTS_PER_CALL = 100;
const SIGNATURES_PER_CALL = 256;

interface AccountInfo {
  owner: string;
  data: [string, string];
}

interface SignatureStatus {
  err: unknown;
  confirmationStatus: "processed" | "confirmed" | "finalized" | null;
}

/**
 * Las instrucciones de un barrido: el tope y la prioridad de cómputo, y la transferencia de USDC que firma el
 * dueño de la cuenta de origen. Aparte para poder simularlas contra la red (`tests/live/usdc.test.ts`).
 */
export function sweepInstructions(input: {
  source: Address;
  mint: Address;
  destination: Address;
  authority: TransactionSigner;
  amountMicroUsd: bigint;
}) {
  return [
    getSetComputeUnitLimitInstruction({ units: COMPUTE_UNIT_LIMIT }),
    getSetComputeUnitPriceInstruction({ microLamports: COMPUTE_UNIT_PRICE }),
    getTransferCheckedInstruction({
      source: input.source, mint: input.mint, destination: input.destination, authority: input.authority,
      amount: input.amountMicroUsd, decimals: USDC_DECIMALS,
    }),
  ];
}

export class SolanaChain implements DepositChain {
  readonly network = "solana" as const;
  private treasuryAccount: Promise<Address> | undefined;

  constructor(
    private readonly config: SolanaConfig,
    private readonly seed: string,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  get live(): boolean {
    return this.config.rpcUrl !== "";
  }

  get testnet(): boolean {
    return isTestNetwork(this.config);
  }

  private rpc<T>(method: string, params: unknown[]): Promise<T> {
    return jsonRpc<T>(this.config.rpcUrl, method, params, this.fetchImpl);
  }

  private depositSigner(workspaceId: string): Promise<KeyPairSigner> {
    return createKeyPairSignerFromPrivateKeyBytes(depositKey(this.seed, "solana", workspaceId));
  }

  private feeSigner(): Promise<KeyPairSigner> {
    return createKeyPairSignerFromPrivateKeyBytes(feeKey(this.seed, "solana"));
  }

  /** La cuenta de USDC asociada a una wallet: ahí llega lo que le envían. */
  private async usdcAccount(owner: string): Promise<Address> {
    const [account] = await findAssociatedTokenPda({
      owner: address(owner), tokenProgram: TOKEN_PROGRAM_ADDRESS, mint: address(this.config.mint),
    });
    return account;
  }

  async depositAddress(workspaceId: string): Promise<string> {
    return (await this.depositSigner(workspaceId)).address;
  }

  async balances(addresses: string[]): Promise<Map<string, bigint>> {
    const result = new Map<string, bigint>();
    for (const batch of chunks(addresses, ACCOUNTS_PER_CALL)) {
      const accounts = await Promise.all(batch.map((owner) => this.usdcAccount(owner)));
      const { value } = await this.rpc<{ value: (AccountInfo | null)[] }>("getMultipleAccounts", [
        accounts, { commitment: "confirmed", encoding: "base64", dataSlice: { offset: TOKEN_AMOUNT_OFFSET, length: 8 } },
      ]);
      batch.forEach((owner, index) => {
        const account = value[index];
        // Sin cuenta de token todavía, o con SOL suelto en esa dirección pero sin inicializar: no hay USDC.
        if (!account || account.owner !== TOKEN_PROGRAM_ADDRESS) return;
        const amount = Buffer.from(account.data[0], "base64");
        if (amount.length === 8) result.set(owner, amount.readBigUInt64LE(0));
      });
    }
    return result;
  }

  /**
   * La cuenta de USDC de la wallet principal. Tiene que existir ya: una dirección mal copiada casi nunca
   * tiene una, así que el barrido se niega a enviar ahí en vez de crearla.
   */
  private treasury(): Promise<Address> {
    this.treasuryAccount ??= (async () => {
      const account = await this.usdcAccount(this.config.treasury);
      const { value } = await this.rpc<{ value: AccountInfo | null }>("getAccountInfo", [
        account, { commitment: "confirmed", encoding: "base64", dataSlice: { offset: 0, length: 0 } },
      ]);
      if (!value || value.owner !== TOKEN_PROGRAM_ADDRESS) {
        throw new Error("The Solana treasury wallet has no USDC account yet: send it some USDC first");
      }
      return account;
    })();
    return this.treasuryAccount;
  }

  async prepareSweep(workspaceId: string, amountMicroUsd: bigint): Promise<PreparedSweep> {
    const [feePayer, deposit, destination] = await Promise.all([this.feeSigner(), this.depositSigner(workspaceId), this.treasury()]);
    const source = await this.usdcAccount(deposit.address);
    const { value: latest } = await this.rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>(
      "getLatestBlockhash", [{ commitment: "confirmed" }],
    );
    const message = pipe(
      createTransactionMessage({ version: "legacy" }),
      (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: blockhash(latest.blockhash), lastValidBlockHeight: BigInt(latest.lastValidBlockHeight) }, tx,
      ),
      (tx) => appendTransactionMessageInstructions(
        sweepInstructions({ source, mint: address(this.config.mint), destination, authority: deposit, amountMicroUsd }), tx,
      ),
    );
    const signed = await signTransactionMessageWithSigners(message);
    const wire = getBase64EncodedWireTransaction(signed);
    return {
      txId: getSignatureFromTransaction(signed),
      lastValid: BigInt(latest.lastValidBlockHeight),
      authNonce: null,
      send: async () => {
        // El nodo la simula antes de aceptarla: una transferencia que fallaría no llega a la red ni paga comisión.
        await this.rpc<string>("sendTransaction", [wire, { encoding: "base64", preflightCommitment: "confirmed", maxRetries: 5 }]);
      },
    };
  }

  async sweepStates(sweeps: SweepRef[]): Promise<Map<string, SweepState>> {
    const result = new Map<string, SweepState>();
    let finalizedHeight: bigint | undefined;
    for (const batch of chunks(sweeps, SIGNATURES_PER_CALL)) {
      const { value } = await this.rpc<{ value: (SignatureStatus | null)[] }>("getSignatureStatuses", [
        batch.map((sweep) => sweep.txId), { searchTransactionHistory: true },
      ]);
      for (const [index, sweep] of batch.entries()) {
        const status = value[index];
        if (status?.err) {
          result.set(sweep.txId, { state: "failed", reason: "reverted" });
        } else if (status) {
          result.set(sweep.txId, { state: status.confirmationStatus === "finalized" ? "confirmed" : "pending" });
        } else {
          // Nadie la vio. Solo deja de poder entrar cuando la cadena finalizada ya pasó su última altura válida.
          finalizedHeight ??= BigInt(await this.rpc<number>("getBlockHeight", [{ commitment: "finalized" }]));
          result.set(sweep.txId, finalizedHeight > sweep.lastValid ? { state: "failed", reason: "expired" } : { state: "pending" });
        }
      }
    }
    return result;
  }

  async feeWallet(): Promise<FeeWallet> {
    const { address: feeAddress } = await this.feeSigner();
    if (!this.live) return { address: feeAddress, balance: BigInt(0), low: false };
    const { value } = await this.rpc<{ value: number }>("getBalance", [feeAddress, { commitment: "confirmed" }]);
    const balance = BigInt(value);
    return { address: feeAddress, balance, low: balance < LOW_FEE_BALANCE };
  }

  /** Si la wallet principal ya puede recibir: su cuenta de USDC existe. Para `pnpm payments:status`. */
  async treasuryReady(): Promise<boolean> {
    return this.treasury().then(() => true, () => false);
  }

  explorerTxUrl(txId: string): string {
    return explorerTxUrl(this.config, txId);
  }

  walletUrl(depositAddress: string): string {
    return solanaPayUrl(depositAddress, this.config.mint);
  }
}
