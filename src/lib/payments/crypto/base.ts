/**
 * USDC en Base (ADR-0058). La dirección de depósito de un workspace es una cuenta normal cuya llave sale de la
 * semilla. El barrido usa `transferWithAuthorization` de USDC (EIP-3009): la llave del depósito firma, sin
 * gastar gas, una autorización para mover su USDC a la wallet principal, y otra wallet (el relayer) la envía
 * y paga el gas. Así la dirección de depósito nunca necesita ETH.
 */
import { randomBytes } from "node:crypto";

import {
  decodeFunctionResult, domainSeparator, encodeFunctionData, type Hex, keccak256, multicall3Abi, parseAbi, parseSignature, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
  chunks, type DepositChain, type FeeWallet, jsonRpc, type PreparedSweep, RpcError, type SweepRef, type SweepState,
} from "./chain";
import { type BaseConfig, explorerTxUrl, isTestNetwork } from "./config";
import { depositKey, feeKey } from "./keys";
import { eip681Url } from "./usdc";

export const usdcAbi = parseAbi([
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function balanceOf(address account) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
]);

export const transferAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/** Multicall3: la misma dirección en Base y en Base Sepolia. Lee muchos saldos en una sola llamada. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const BALANCES_PER_CALL = 200;
/** Cuánto vale una autorización. Si no entró en ese tiempo ya no puede entrar, y se firma otra. */
const AUTHORIZATION_TTL_SECONDS = 10 * 60;
/** Margen sobre `validBefore` antes de dar un barrido por vencido: el nodo puede ir unos bloques atrás. */
const EXPIRY_MARGIN_SECONDS = BigInt(120);
/** Con menos de 0.0002 ETH quedan unas decenas de barridos: hay que fondear. */
const LOW_FEE_BALANCE = BigInt(200_000_000_000_000);
const MIN_PRIORITY_FEE = BigInt(1_000_000);
const ZERO = BigInt(0);

interface Receipt {
  status: Hex;
  blockNumber: Hex;
}

interface Block {
  number: Hex;
  timestamp: Hex;
  baseFeePerGas?: Hex;
}

export class BaseChain implements DepositChain {
  readonly network = "base" as const;
  private eip712Domain: Promise<{ name: string; version: string; chainId: number; verifyingContract: Hex }> | undefined;
  /** El siguiente nonce del relayer dentro de esta corrida, por si el nodo todavía no ve la transacción anterior. */
  private nextNonce = 0;

  constructor(
    private readonly config: BaseConfig,
    private readonly seed: string,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  get live(): boolean {
    return this.config.rpcUrl !== "";
  }

  get testnet(): boolean {
    return isTestNetwork(this.config);
  }

  private get token(): Hex {
    return this.config.token as Hex;
  }

  private rpc<T>(method: string, params: unknown[]): Promise<T> {
    return jsonRpc<T>(this.config.rpcUrl, method, params, this.fetchImpl);
  }

  private call(to: string, data: Hex): Promise<Hex> {
    return this.rpc<Hex>("eth_call", [{ to, data }, "latest"]);
  }

  private depositAccount(workspaceId: string) {
    return privateKeyToAccount(toHex(depositKey(this.seed, "base", workspaceId)));
  }

  private relayer() {
    return privateKeyToAccount(toHex(feeKey(this.seed, "base")));
  }

  async depositAddress(workspaceId: string): Promise<string> {
    return this.depositAccount(workspaceId).address;
  }

  async balances(addresses: string[]): Promise<Map<string, bigint>> {
    const result = new Map<string, bigint>();
    for (const batch of chunks(addresses, BALANCES_PER_CALL)) {
      const data = encodeFunctionData({
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [batch.map((owner) => ({
          target: this.token,
          allowFailure: true,
          callData: encodeFunctionData({ abi: usdcAbi, functionName: "balanceOf", args: [owner as Hex] }),
        }))],
      });
      const returned = decodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", data: await this.call(MULTICALL3, data) });
      batch.forEach((owner, index) => {
        const item = returned[index];
        if (!item?.success) return;
        const balance = decodeFunctionResult({ abi: usdcAbi, functionName: "balanceOf", data: item.returnData });
        if (balance > ZERO) result.set(owner, balance);
      });
    }
    return result;
  }

  /**
   * El dominio EIP-712 del contrato de USDC. El nombre cambia entre redes («USD Coin» en Base, «USDC» en
   * Sepolia), así que se lee del contrato y se comprueba contra su `DOMAIN_SEPARATOR` antes de firmar nada.
   */
  private domain() {
    this.eip712Domain ??= (async () => {
      const [name, version, separator] = await Promise.all([
        this.call(this.token, encodeFunctionData({ abi: usdcAbi, functionName: "name" })),
        this.call(this.token, encodeFunctionData({ abi: usdcAbi, functionName: "version" })),
        this.call(this.token, encodeFunctionData({ abi: usdcAbi, functionName: "DOMAIN_SEPARATOR" })),
      ]);
      const domain = {
        name: decodeFunctionResult({ abi: usdcAbi, functionName: "name", data: name }),
        version: decodeFunctionResult({ abi: usdcAbi, functionName: "version", data: version }),
        chainId: this.config.chainId,
        verifyingContract: this.token,
      };
      if (domainSeparator({ domain }) !== decodeFunctionResult({ abi: usdcAbi, functionName: "DOMAIN_SEPARATOR", data: separator })) {
        throw new Error("The USDC contract on Base does not use the expected EIP-712 domain");
      }
      return domain;
    })();
    return this.eip712Domain;
  }

  async prepareSweep(workspaceId: string, amountMicroUsd: bigint, now: number): Promise<PreparedSweep> {
    const deposit = this.depositAccount(workspaceId);
    const relayer = this.relayer();
    const treasury = this.config.treasury as Hex;
    const validBefore = BigInt(Math.floor(now / 1000) + AUTHORIZATION_TTL_SECONDS);
    const authNonce = toHex(randomBytes(32));
    const signature = parseSignature(await deposit.signTypedData({
      domain: await this.domain(),
      types: transferAuthorizationTypes,
      primaryType: "TransferWithAuthorization",
      message: { from: deposit.address, to: treasury, value: amountMicroUsd, validAfter: ZERO, validBefore, nonce: authNonce },
    }));
    const data = encodeFunctionData({
      abi: usdcAbi,
      functionName: "transferWithAuthorization",
      args: [deposit.address, treasury, amountMicroUsd, ZERO, validBefore, authNonce, signature.yParity + 27, signature.r, signature.s],
    });

    // `eth_estimateGas` ejecuta la llamada: si la autorización no sirviera, falla aquí y no se envía nada.
    const [pendingNonce, gas, block, tip] = await Promise.all([
      this.rpc<Hex>("eth_getTransactionCount", [relayer.address, "pending"]),
      this.rpc<Hex>("eth_estimateGas", [{ from: relayer.address, to: this.token, data }]),
      this.rpc<Block>("eth_getBlockByNumber", ["latest", false]),
      this.rpc<Hex>("eth_maxPriorityFeePerGas", []).catch(() => "0x0" as Hex),
    ]);
    const nonce = Math.max(Number(BigInt(pendingNonce)), this.nextNonce);
    const maxPriorityFeePerGas = BigInt(tip) > MIN_PRIORITY_FEE ? BigInt(tip) : MIN_PRIORITY_FEE;
    const serialized = await relayer.signTransaction({
      type: "eip1559",
      chainId: this.config.chainId,
      to: this.token,
      data,
      nonce,
      gas: (BigInt(gas) * BigInt(13)) / BigInt(10),
      // Aguanta que la comisión base se triplique antes de que entre: en Base cuesta fracciones de centavo.
      maxFeePerGas: BigInt(block.baseFeePerGas ?? "0x0") * BigInt(3) + maxPriorityFeePerGas,
      maxPriorityFeePerGas,
    });
    return {
      txId: keccak256(serialized),
      lastValid: validBefore,
      authNonce,
      send: async () => {
        try {
          await this.rpc<Hex>("eth_sendRawTransaction", [serialized]);
        } catch (error) {
          // «Ya la conozco» no es un rechazo: la transacción está en camino.
          if (!(error instanceof RpcError) || error.code === null || !/already known|already_exists/i.test(error.message)) throw error;
        }
        this.nextNonce = nonce + 1;
      },
    };
  }

  async sweepStates(sweeps: SweepRef[]): Promise<Map<string, SweepState>> {
    const result = new Map<string, SweepState>();
    if (sweeps.length === 0) return result;
    const latest = await this.rpc<Block>("eth_getBlockByNumber", ["latest", false]);
    for (const sweep of sweeps) {
      const receipt = await this.rpc<Receipt | null>("eth_getTransactionReceipt", [sweep.txId]);
      if (!receipt) {
        // Sin recibo solo se da por vencida cuando la cadena ya pasó el `validBefore`: después no puede ejecutarse.
        const expired = BigInt(latest.timestamp) > sweep.lastValid + EXPIRY_MARGIN_SECONDS;
        result.set(sweep.txId, expired ? { state: "failed", reason: "expired" } : { state: "pending" });
      } else if (receipt.status === "0x1") {
        const confirmed = BigInt(receipt.blockNumber) + BigInt(this.config.confirmations) <= BigInt(latest.number);
        result.set(sweep.txId, { state: confirmed ? "confirmed" : "pending" });
      } else {
        // Revirtió. Si la autorización quedó usada, alguien más la envió antes y el USDC llegó igual a la wallet principal.
        const used = sweep.authNonce !== null && await this.authorizationUsed(sweep.address, sweep.authNonce);
        result.set(sweep.txId, used ? { state: "confirmed" } : { state: "failed", reason: "reverted" });
      }
    }
    return result;
  }

  private async authorizationUsed(authorizer: string, nonce: string): Promise<boolean> {
    const data = await this.call(this.token, encodeFunctionData({
      abi: usdcAbi, functionName: "authorizationState", args: [authorizer as Hex, nonce as Hex],
    }));
    return decodeFunctionResult({ abi: usdcAbi, functionName: "authorizationState", data });
  }

  async feeWallet(): Promise<FeeWallet> {
    const { address } = this.relayer();
    if (!this.live) return { address, balance: ZERO, low: false };
    const balance = BigInt(await this.rpc<Hex>("eth_getBalance", [address, "latest"]));
    return { address, balance, low: balance < LOW_FEE_BALANCE };
  }

  explorerTxUrl(txId: string): string {
    return explorerTxUrl(this.config, txId);
  }

  walletUrl(depositAddress: string): string {
    return eip681Url(depositAddress, this.config.token, this.config.chainId);
  }
}
