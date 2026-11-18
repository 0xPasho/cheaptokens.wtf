// @vitest-environment node
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  address, createKeyPairSignerFromPrivateKeyBytes, getCompiledTransactionMessageDecoder, getTransactionDecoder, verifySignature,
} from "@solana/kit";
import { and, eq } from "drizzle-orm";
import {
  decodeFunctionData, domainSeparator, encodeFunctionResult, type Hex, keccak256, multicall3Abi, parseTransaction,
  recoverTransactionAddress, recoverTypedDataAddress,
} from "viem";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PERIOD_MS, PLANS } from "@/lib/billing/plans";
import {
  buyPlanWithBalance, InsufficientBalanceError, planQuote, PlanNotAvailableError, recordTopUp, upgradeCharge,
} from "@/lib/billing/purchases";
import { reconcile } from "@/lib/billing/reconcile";
import { ensureDevWorkspace } from "@/lib/billing/workspaces";
import { creditTransactions, depositAddresses, depositScans, depositSweeps, payments, subscriptions, workspaces } from "@/lib/db/schema";
import { BaseChain, transferAuthorizationTypes, usdcAbi } from "@/lib/payments/crypto/base";
import { type DepositChain, RpcError, type SweepRef, type SweepState } from "@/lib/payments/crypto/chain";
import {
  type BaseConfig, BASE_MAINNET_USDC, type CryptoNetworkId, paymentsAvailable, readCryptoConfig, type SolanaConfig, SOLANA_MAINNET_USDC,
} from "@/lib/payments/crypto/config";
import {
  CHECK_INTERVAL_MS, checkFeeWallets, depositChains, ensureDepositAddresses, getDepositState, MIN_DEPOSIT_MICRO_USD,
  RETRY_AFTER_FAILURE_MS, scanDeposits, simulateDeposit, WATCH_MS,
} from "@/lib/payments/crypto/deposits";
import { depositKey, feeKey } from "@/lib/payments/crypto/keys";
import { SolanaChain } from "@/lib/payments/crypto/solana";
import { usdcDecimal, walletUrlWithAmount } from "@/lib/payments/crypto/usdc";
import { depositView } from "@/lib/payments/crypto/view";

import { createTestDb } from "../helpers/db";

const usd = (dollars: number) => BigInt(Math.round(dollars * 100)) * BigInt(10_000);
const ZERO = BigInt(0);
const now = Date.UTC(2026, 10, 17, 18);

const SEED = "unit-test-seed-0123456789abcdef0123456789abcdef";
const WORKSPACE_1 = "018f3c2a-0000-7000-8000-000000000001";
const WORKSPACE_2 = "018f3c2a-0000-7000-8000-000000000002";
const SOLANA: SolanaConfig = {
  id: "solana", treasury: "2DSb6rg8piiFnnq2jJZpU2geftvDY58GX3KLnmU8qsPY", rpcUrl: "https://solana.test", cluster: "mainnet",
  mint: SOLANA_MAINNET_USDC,
};
const BASE: BaseConfig = {
  id: "base", treasury: "0x1111111111111111111111111111111111111111", rpcUrl: "https://base.test", chainId: 8453,
  token: BASE_MAINNET_USDC, confirmations: 10,
};

/** Un nodo JSON-RPC de mentira: responde cada método con su función y recuerda lo que le pidieron. */
function rpcMock(handlers: Record<string, (params: never) => unknown>) {
  const calls: { method: string; params: unknown[] }[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const { method, params } = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
    calls.push({ method, params });
    const handler = handlers[method];
    if (!handler) return Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: `no mock for ${method}` } });
    try {
      return Response.json({ jsonrpc: "2.0", id: 1, result: await handler(params as never) });
    } catch (error) {
      if (!(error instanceof RpcError)) throw error;
      return Response.json({ jsonrpc: "2.0", id: 1, error: { code: error.code, message: error.message } });
    }
  }) as typeof fetch;
  return { fetchImpl, calls, sent: (method: string) => calls.filter((call) => call.method === method) };
}

describe("deposit keys", () => {
  // Estas direcciones no pueden cambiar nunca: si cambian, lo que llegue a las de producción queda sin llave.
  it("derives the same addresses forever from the seed and the workspace", async () => {
    const solana = new SolanaChain(SOLANA, SEED);
    const base = new BaseChain(BASE, SEED);
    expect(await solana.depositAddress(WORKSPACE_1)).toBe("F2S95qezKQCM18pBgm4c4EcreXCCrLQNm8SHm1nWtGsU");
    expect(await solana.depositAddress(WORKSPACE_2)).toBe("34K2hX7uMUeM5CzTmKjE2gacENgrF3gXusQeHjNtdmyg");
    expect(await base.depositAddress(WORKSPACE_1)).toBe("0x717Cd0341633A856f75dBaAD9B28f5831706855D");
    expect(await base.depositAddress(WORKSPACE_2)).toBe("0x7e49763C6cE6bb39b78430A6724078eFA63a9D1c");
    expect((await new SolanaChain({ ...SOLANA, rpcUrl: "" }, SEED).feeWallet()).address).toBe("6YtZDVDwNGiv9hPMxMke9zyGrJiVFkCTEakw3VVA8Sn");
    expect((await new BaseChain({ ...BASE, rpcUrl: "" }, SEED).feeWallet()).address).toBe("0x70D8049fc2dbCC25b328d76c3904404Ca5b7aAa4");
  });

  it("gives another seed, network or workspace a different key", () => {
    const keys = [
      depositKey(SEED, "solana", WORKSPACE_1), depositKey(SEED, "base", WORKSPACE_1), depositKey(SEED, "solana", WORKSPACE_2),
      depositKey(`${SEED}!`, "solana", WORKSPACE_1), feeKey(SEED, "solana"), feeKey(SEED, "base"),
    ].map((key) => Buffer.from(key).toString("hex"));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key.length === 64)).toBe(true);
  });
});

describe("USDC helpers", () => {
  it("writes amounts the way a wallet expects them", () => {
    expect(usdcDecimal(usd(25.37))).toBe("25.37");
    expect(usdcDecimal(usd(9))).toBe("9");
    expect(usdcDecimal(BigInt(1_234_567))).toBe("1.234567");
    expect(usdcDecimal(BigInt(500))).toBe("0.0005");
  });

  it("builds wallet links with and without an amount", () => {
    const solana = new SolanaChain(SOLANA, SEED).walletUrl("Dep0sit");
    const base = new BaseChain(BASE, SEED).walletUrl("0xDeposit");
    expect(solana).toBe(`solana:Dep0sit?spl-token=${SOLANA_MAINNET_USDC}&label=cheapllm.wtf`);
    expect(base).toBe(`ethereum:${BASE_MAINNET_USDC}@8453/transfer?address=0xDeposit`);
    expect(walletUrlWithAmount("solana", solana, usd(26.66))).toBe(`${solana}&amount=26.66`);
    expect(walletUrlWithAmount("base", base, usd(26.66))).toBe(`${base}&uint256=26660000`);
  });
});

describe("crypto config", () => {
  const live = { APP_ENV: "preview", CRYPTO_DEPOSIT_SEED: SEED };

  it("offers nothing without a seed outside local development", () => {
    expect(paymentsAvailable(readCryptoConfig({ APP_ENV: "preview" }))).toBe(false);
    expect(readCryptoConfig({ APP_ENV: "preview", CRYPTO_BASE_ADDRESS: BASE.treasury })).toEqual({ networks: [], seed: null, simulate: false });
    expect(readCryptoConfig({ ...live })).toEqual({ networks: [], seed: null, simulate: false });
  });

  it("shows example networks with a simulated deposit in local development", () => {
    const config = readCryptoConfig({ APP_ENV: "development" });
    expect(config.simulate).toBe(true);
    expect(config.networks.map((network) => [network.id, network.rpcUrl])).toEqual([["solana", ""], ["base", ""]]);
    expect(depositChains(config).map((chain) => [chain.network, chain.live, chain.testnet])).toEqual([["solana", false, true], ["base", false, true]]);
  });

  it("turns a network on with its treasury address and the seed", () => {
    const config = readCryptoConfig({ ...live, CRYPTO_SOLANA_ADDRESS: SOLANA.treasury, CRYPTO_BASE_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" });
    expect(config).toMatchObject({
      simulate: false,
      seed: SEED,
      networks: [
        { id: "solana", treasury: SOLANA.treasury, cluster: "mainnet", mint: SOLANA_MAINNET_USDC, rpcUrl: "https://api.mainnet-beta.solana.com" },
        { id: "base", chainId: 8453, token: BASE_MAINNET_USDC, confirmations: 10, rpcUrl: "https://mainnet.base.org" },
      ],
    });
    expect(readCryptoConfig({ ...live, CRYPTO_BASE_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", CRYPTO_BASE_CHAIN: "sepolia" }).networks[0])
      .toMatchObject({ chainId: 84532, rpcUrl: "https://sepolia.base.org" });
  });

  it("rejects a short seed and addresses that look mistyped", () => {
    expect(() => readCryptoConfig({ CRYPTO_DEPOSIT_SEED: "short" })).toThrow("CRYPTO_DEPOSIT_SEED");
    expect(() => readCryptoConfig({ ...live, CRYPTO_SOLANA_ADDRESS: "0xnope" })).toThrow("CRYPTO_SOLANA_ADDRESS");
    // En minúsculas no hay suma de control que revisar: se pide como la muestra la wallet.
    expect(() => readCryptoConfig({ ...live, CRYPTO_BASE_ADDRESS: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" })).toThrow("checksummed");
    expect(() => readCryptoConfig({ ...live, CRYPTO_BASE_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02914" })).toThrow("checksummed");
  });
});

describe("Solana chain", () => {
  const usdcAccount = async (owner: string) =>
    (await findAssociatedTokenPda({ owner: address(owner), tokenProgram: TOKEN_PROGRAM_ADDRESS, mint: address(SOLANA.mint) }))[0];
  const tokenAccount = (amount: bigint) => {
    const data = Buffer.alloc(8);
    data.writeBigUInt64LE(amount);
    return { owner: TOKEN_PROGRAM_ADDRESS, data: [data.toString("base64"), "base64"] };
  };

  it("reads the USDC in each deposit address from its token account", async () => {
    const chain = new SolanaChain(SOLANA, SEED);
    const [first, second, third] = await Promise.all([WORKSPACE_1, WORKSPACE_2, "018f3c2a-0000-7000-8000-000000000003"].map((id) => chain.depositAddress(id)));
    const node = rpcMock({
      getMultipleAccounts: () => ({
        // Con saldo; sin cuenta de token; y con SOL suelto pero sin inicializar.
        value: [tokenAccount(usd(25.37)), null, { owner: "11111111111111111111111111111111", data: ["", "base64"] }],
      }),
    });
    const balances = await new SolanaChain(SOLANA, SEED, node.fetchImpl).balances([first, second, third]);
    expect([...balances]).toEqual([[first, usd(25.37)]]);
    expect(node.calls[0].params).toEqual([
      await Promise.all([first, second, third].map(usdcAccount)),
      { commitment: "confirmed", encoding: "base64", dataSlice: { offset: 64, length: 8 } },
    ]);
  });

  it("signs a sweep to the treasury's USDC account, paid by the fee wallet", async () => {
    const node = rpcMock({
      getAccountInfo: () => ({ value: { owner: TOKEN_PROGRAM_ADDRESS, data: ["", "base64"] } }),
      getLatestBlockhash: () => ({ value: { blockhash: "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N", lastValidBlockHeight: 4_321 } }),
      sendTransaction: () => "ok",
    });
    const chain = new SolanaChain(SOLANA, SEED, node.fetchImpl);
    const sweep = await chain.prepareSweep(WORKSPACE_1, usd(25.37));
    expect(sweep).toMatchObject({ lastValid: BigInt(4_321), authNonce: null });
    expect(node.sent("sendTransaction")).toEqual([]);
    await sweep.send();

    const [wire, options] = node.sent("sendTransaction")[0].params as [string, unknown];
    expect(options).toEqual({ encoding: "base64", preflightCommitment: "confirmed", maxRetries: 5 });
    const transaction = getTransactionDecoder().decode(Buffer.from(wire, "base64"));
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    if (message.version !== "legacy") throw new Error("Expected a legacy transaction");
    const deposit = await createKeyPairSignerFromPrivateKeyBytes(depositKey(SEED, "solana", WORKSPACE_1));
    const feePayer = await createKeyPairSignerFromPrivateKeyBytes(feeKey(SEED, "solana"));
    // El fee payer va primero y paga; la llave del depósito firma pero no paga nada.
    expect(message.staticAccounts.slice(0, 2)).toEqual([feePayer.address, deposit.address]);
    expect(message.header).toMatchObject({ numSignerAccounts: 2, numReadonlySignerAccounts: 1 });
    for (const signer of [feePayer, deposit]) {
      expect(await verifySignature(signer.keyPair.publicKey, transaction.signatures[signer.address]!, transaction.messageBytes)).toBe(true);
    }
    const transfer = message.instructions.at(-1)!;
    const amount = Buffer.alloc(8);
    amount.writeBigUInt64LE(usd(25.37));
    // TransferChecked: origen, mint, destino y dueño, con el monto y los 6 decimales de USDC.
    expect(message.staticAccounts[transfer.programAddressIndex]).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(transfer.accountIndices!.map((index) => message.staticAccounts[index])).toEqual([
      await usdcAccount(deposit.address), SOLANA.mint, await usdcAccount(SOLANA.treasury), deposit.address,
    ]);
    expect(Buffer.from(transfer.data!).toString("hex")).toBe(`0c${amount.toString("hex")}06`);
    expect(message.instructions).toHaveLength(3);
  });

  it("refuses to sweep to a treasury wallet that has no USDC account", async () => {
    const node = rpcMock({ getAccountInfo: () => ({ value: null }) });
    await expect(new SolanaChain(SOLANA, SEED, node.fetchImpl).prepareSweep(WORKSPACE_1, usd(5))).rejects.toThrow("no USDC account");
    expect(node.sent("sendTransaction")).toEqual([]);
  });

  it("tells a finalized sweep from one in flight, one that failed and one that can no longer land", async () => {
    const refs: SweepRef[] = ["finalized", "confirmed", "failed", "unseen-old", "unseen-new"].map((txId, index) => ({
      txId, address: "a", authNonce: null, lastValid: BigInt(index === 3 ? 900 : 2_000),
    }));
    const node = rpcMock({
      getSignatureStatuses: () => ({
        value: [
          { err: null, confirmationStatus: "finalized" }, { err: null, confirmationStatus: "confirmed" },
          { err: { InstructionError: [2, "Custom"] }, confirmationStatus: "finalized" }, null, null,
        ],
      }),
      getBlockHeight: () => 1_000,
    });
    const states = await new SolanaChain(SOLANA, SEED, node.fetchImpl).sweepStates(refs);
    expect(Object.fromEntries(states)).toEqual({
      finalized: { state: "confirmed" },
      confirmed: { state: "pending" },
      failed: { state: "failed", reason: "reverted" },
      "unseen-old": { state: "failed", reason: "expired" },
      "unseen-new": { state: "pending" },
    });
    expect(node.sent("getBlockHeight")).toEqual([{ method: "getBlockHeight", params: [{ commitment: "finalized" }] }]);
  });
});

describe("Base chain", () => {
  const domain = { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: BASE_MAINNET_USDC as Hex };
  /** Responde las lecturas del contrato de USDC y del multicall como lo harían en la cadena. */
  function contractCalls(overrides: { separator?: Hex; balances?: Record<string, bigint>; authorizationUsed?: boolean } = {}) {
    return ([call]: [{ to: string; data: Hex }]) => {
      if (call.to !== BASE_MAINNET_USDC) {
        const { args } = decodeFunctionData({ abi: multicall3Abi, data: call.data });
        const calls = args[0] as readonly { callData: Hex }[];
        return encodeFunctionResult({
          abi: multicall3Abi,
          functionName: "aggregate3",
          result: calls.map(({ callData }) => {
            const owner = decodeFunctionData({ abi: usdcAbi, data: callData }).args![0] as string;
            return {
              success: true,
              returnData: encodeFunctionResult({ abi: usdcAbi, functionName: "balanceOf", result: overrides.balances?.[owner] ?? ZERO }),
            };
          }),
        });
      }
      const { functionName } = decodeFunctionData({ abi: usdcAbi, data: call.data });
      if (functionName === "name") return encodeFunctionResult({ abi: usdcAbi, functionName, result: domain.name });
      if (functionName === "version") return encodeFunctionResult({ abi: usdcAbi, functionName, result: domain.version });
      if (functionName === "DOMAIN_SEPARATOR") {
        return encodeFunctionResult({ abi: usdcAbi, functionName, result: overrides.separator ?? domainSeparator({ domain }) });
      }
      if (functionName === "authorizationState") return encodeFunctionResult({ abi: usdcAbi, functionName, result: overrides.authorizationUsed ?? false });
      throw new Error(`unexpected call ${functionName}`);
    };
  }

  it("reads many balances in one multicall", async () => {
    const chain = new BaseChain(BASE, SEED);
    const [first, second] = await Promise.all([chain.depositAddress(WORKSPACE_1), chain.depositAddress(WORKSPACE_2)]);
    const node = rpcMock({ eth_call: contractCalls({ balances: { [second]: usd(40) } }) });
    expect([...await new BaseChain(BASE, SEED, node.fetchImpl).balances([first, second])]).toEqual([[second, usd(40)]]);
    expect(node.calls).toHaveLength(1);
  });

  it("signs an EIP-3009 authorization to the treasury and a relayer transaction that carries it", async () => {
    const node = rpcMock({
      eth_call: contractCalls(),
      eth_getTransactionCount: () => "0x7",
      eth_estimateGas: () => "0x186a0",
      eth_getBlockByNumber: () => ({ number: "0x64", timestamp: "0x0", baseFeePerGas: "0x3b9aca00" }),
      eth_maxPriorityFeePerGas: () => "0x5f5e100",
      eth_sendRawTransaction: () => "0xhash",
    });
    const chain = new BaseChain(BASE, SEED, node.fetchImpl);
    const depositAddress = await chain.depositAddress(WORKSPACE_1) as Hex;
    const sweep = await chain.prepareSweep(WORKSPACE_1, usd(25.37), now);
    expect(node.sent("eth_sendRawTransaction")).toEqual([]);
    await sweep.send();

    const [raw] = node.sent("eth_sendRawTransaction")[0].params as [Hex];
    expect(sweep.txId).toBe(keccak256(raw));
    expect(sweep.lastValid).toBe(BigInt(now / 1000 + 600));
    const transaction = parseTransaction(raw);
    expect(await recoverTransactionAddress({ serializedTransaction: raw as `0x02${string}` })).toBe("0x70D8049fc2dbCC25b328d76c3904404Ca5b7aAa4");
    expect(transaction).toMatchObject({
      type: "eip1559", chainId: 8453, to: BASE_MAINNET_USDC.toLowerCase(), nonce: 7, gas: BigInt(130_000),
      maxPriorityFeePerGas: BigInt(100_000_000), maxFeePerGas: BigInt(3_100_000_000),
    });
    expect(transaction.value ?? ZERO).toBe(ZERO);

    const { functionName, args } = decodeFunctionData({ abi: usdcAbi, data: transaction.data! });
    const [from, to, value, validAfter, validBefore, nonce, v, r, s] = args as [Hex, Hex, bigint, bigint, bigint, Hex, number, Hex, Hex];
    expect(functionName).toBe("transferWithAuthorization");
    expect([from, to, value, validAfter, validBefore, nonce]).toEqual([depositAddress, BASE.treasury, usd(25.37), ZERO, sweep.lastValid, sweep.authNonce]);
    // La autorización la firmó la llave del depósito, para ese contrato y esa cadena.
    expect(await recoverTypedDataAddress({
      domain, types: transferAuthorizationTypes, primaryType: "TransferWithAuthorization",
      message: { from, to, value, validAfter, validBefore, nonce }, signature: { r, s, yParity: v - 27 },
    })).toBe(depositAddress);
  });

  it("uses the next nonce inside a run even if the node has not seen the previous transaction", async () => {
    const node = rpcMock({
      eth_call: contractCalls(),
      eth_getTransactionCount: () => "0x7",
      eth_estimateGas: () => "0x186a0",
      eth_getBlockByNumber: () => ({ number: "0x64", timestamp: "0x0", baseFeePerGas: "0x1" }),
      eth_maxPriorityFeePerGas: () => "0x0",
      eth_sendRawTransaction: () => {
        throw new RpcError("already known", -32000);
      },
    });
    const chain = new BaseChain(BASE, SEED, node.fetchImpl);
    await (await chain.prepareSweep(WORKSPACE_1, usd(5), now)).send();
    await (await chain.prepareSweep(WORKSPACE_2, usd(5), now)).send();
    const nonces = node.sent("eth_sendRawTransaction").map((call) => parseTransaction(call.params[0] as Hex).nonce);
    expect(nonces).toEqual([7, 8]);
  });

  it("does not sign for a contract with another EIP-712 domain, or when the node rejects the transfer", async () => {
    const wrongDomain = rpcMock({ eth_call: contractCalls({ separator: `0x${"00".repeat(32)}` }) });
    await expect(new BaseChain(BASE, SEED, wrongDomain.fetchImpl).prepareSweep(WORKSPACE_1, usd(5), now)).rejects.toThrow("EIP-712 domain");
    const reverts = rpcMock({
      eth_call: contractCalls(),
      eth_getTransactionCount: () => "0x0",
      eth_estimateGas: () => {
        throw new RpcError("execution reverted: FiatTokenV2: invalid signature", 3);
      },
      eth_getBlockByNumber: () => ({ number: "0x64", timestamp: "0x0", baseFeePerGas: "0x1" }),
      eth_maxPriorityFeePerGas: () => "0x0",
    });
    await expect(new BaseChain(BASE, SEED, reverts.fetchImpl).prepareSweep(WORKSPACE_1, usd(5), now)).rejects.toThrow("invalid signature");
    expect(reverts.sent("eth_sendRawTransaction")).toEqual([]);
  });

  it("confirms a sweep after its blocks, and gives up only once the authorization has expired", async () => {
    const validBefore = BigInt(1_000_000);
    const ref = (txId: string): SweepRef => ({ txId, address: "0x2222222222222222222222222222222222222222", authNonce: `0x${"ab".repeat(32)}`, lastValid: validBefore });
    const receipts: Record<string, unknown> = {
      deep: { status: "0x1", blockNumber: "0x5a" },
      fresh: { status: "0x1", blockNumber: "0x60" },
      reverted: { status: "0x0", blockNumber: "0x5a" },
    };
    const states = async (timestamp: bigint, authorizationUsed = false) => {
      const node = rpcMock({
        eth_call: contractCalls({ authorizationUsed }),
        eth_getBlockByNumber: () => ({ number: "0x64", timestamp: `0x${timestamp.toString(16)}` }),
        eth_getTransactionReceipt: ([txId]: [string]) => receipts[txId] ?? null,
      });
      return Object.fromEntries(await new BaseChain(BASE, SEED, node.fetchImpl).sweepStates(["deep", "fresh", "reverted", "unseen"].map(ref)));
    };
    expect(await states(validBefore + BigInt(60))).toEqual({
      deep: { state: "confirmed" },
      fresh: { state: "pending" },
      reverted: { state: "failed", reason: "reverted" },
      unseen: { state: "pending" },
    });
    expect((await states(validBefore + BigInt(121))).unseen).toEqual({ state: "failed", reason: "expired" });
    // Revirtió porque alguien más ya había enviado la misma autorización: el USDC llegó igual.
    expect((await states(validBefore, true)).reverted).toEqual({ state: "confirmed" });
  });
});

/** Una cadena de mentira: guarda cuánto USDC hay en cada dirección y deja decidir qué pasa con cada barrido. */
class FakeChain implements DepositChain {
  readonly live = true;
  readonly testnet = false;
  funds = new Map<string, bigint>();
  states = new Map<string, SweepState>();
  sent: { txId: string; address: string; amount: bigint }[] = [];
  reads: string[][] = [];
  sendError: Error | null = null;
  prepareError: Error | null = null;
  lowFees = false;
  private prepared = 0;

  constructor(readonly network: CryptoNetworkId = "solana", private readonly seed = "seed-a") {}

  async depositAddress(workspaceId: string) {
    return `${this.seed}:${this.network}:${workspaceId}`;
  }

  async balances(addresses: string[]) {
    this.reads.push(addresses);
    return new Map(addresses.flatMap((owner) => (this.funds.get(owner) ?? ZERO) > ZERO ? [[owner, this.funds.get(owner)!] as const] : []));
  }

  async prepareSweep(workspaceId: string, amount: bigint) {
    if (this.prepareError) throw this.prepareError;
    const txId = `${this.network}-tx-${++this.prepared}`;
    const owner = await this.depositAddress(workspaceId);
    return {
      txId,
      lastValid: BigInt(100),
      authNonce: null,
      send: async () => {
        if (this.sendError) throw this.sendError;
        this.sent.push({ txId, address: owner, amount });
      },
    };
  }

  async sweepStates(sweeps: SweepRef[]) {
    return new Map(sweeps.map((sweep) => [sweep.txId, this.states.get(sweep.txId) ?? { state: "pending" as const }]));
  }

  /** El barrido entró y quedó firme: el USDC salió de la dirección. */
  land(txId: string) {
    const sweep = this.sent.find((candidate) => candidate.txId === txId)!;
    this.funds.set(sweep.address, this.funds.get(sweep.address)! - sweep.amount);
    this.states.set(txId, { state: "confirmed" });
  }

  async feeWallet() {
    return { address: `${this.network}-fees`, balance: BigInt(1), low: this.lowFees };
  }

  explorerTxUrl(txId: string) {
    return `https://explorer.test/tx/${txId}`;
  }

  walletUrl(owner: string) {
    return `wallet:${owner}`;
  }
}

describe("USDC deposits", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => { testDb = await createTestDb(); });
  afterEach(async () => { await testDb?.close(); });

  const balance = async (workspaceId: string) =>
    (await testDb.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)))[0].balanceMicroUsd;
  const sweeps = (workspaceId: string) => testDb.db.select().from(depositSweeps).where(eq(depositSweeps.workspaceId, workspaceId)).orderBy(depositSweeps.createdAt);
  /** Un workspace con su dirección ya creada y fondeada. */
  async function depositor(chain: FakeChain, name: string, amount = ZERO) {
    const { id } = await ensureDevWorkspace(testDb.db, name);
    const [{ address: owner }] = await ensureDepositAddresses(testDb.db, [chain], id);
    if (amount > ZERO) chain.funds.set(owner, amount);
    return { id, address: owner };
  }

  it("gives each workspace one fixed address per network", async () => {
    const chains = [new FakeChain("solana"), new FakeChain("base")];
    const a = await ensureDevWorkspace(testDb.db, "a");
    const b = await ensureDevWorkspace(testDb.db, "b");
    const first = await ensureDepositAddresses(testDb.db, chains, a.id);
    expect(first).toEqual([
      { network: "solana", address: `seed-a:solana:${a.id}`, unsweptMicroUsd: ZERO },
      { network: "base", address: `seed-a:base:${a.id}`, unsweptMicroUsd: ZERO },
    ]);
    expect(await ensureDepositAddresses(testDb.db, chains, a.id)).toEqual(first);
    expect((await ensureDepositAddresses(testDb.db, chains, b.id))[0].address).not.toBe(first[0].address);
    expect(await testDb.db.select().from(depositAddresses)).toHaveLength(4);
  });

  it("never shows an address the seed can no longer sweep", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "seed-change");
    await ensureDepositAddresses(testDb.db, [new FakeChain("solana", "seed-a")], id);
    expect(await ensureDepositAddresses(testDb.db, [new FakeChain("solana", "seed-b")], id)).toEqual([]);
    const [row] = await testDb.db.select().from(depositAddresses);
    expect(row.address).toBe(`seed-a:solana:${id}`);
  });

  it("does not store the example addresses of local development", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "offline");
    const chains = depositChains(readCryptoConfig({ APP_ENV: "development" }));
    const shown = await ensureDepositAddresses(testDb.db, chains, id);
    expect(shown.map((item) => item.network)).toEqual(["solana", "base"]);
    expect(await testDb.db.select().from(depositAddresses)).toEqual([]);
    expect(await scanDeposits(testDb.db, chains, now)).toEqual([]);
  });

  it("sweeps a deposit and credits it only when the sweep is confirmed, and only once", async () => {
    const chain = new FakeChain();
    const { id, address: owner } = await depositor(chain, "happy", usd(25.37));

    expect(await scanDeposits(testDb.db, [chain], now)).toEqual([{ network: "solana", checked: 1, swept: 1, credited: 0 }]);
    expect(chain.sent).toEqual([{ txId: "solana-tx-1", address: owner, amount: usd(25.37) }]);
    expect(await balance(id)).toBe(ZERO);
    expect(await sweeps(id)).toMatchObject([{ status: "pending", amountMicroUsd: usd(25.37), txId: "solana-tx-1", lastValid: BigInt(100) }]);

    // Mientras la red no lo confirme no hay saldo, y no sale otro barrido por el mismo dinero.
    expect(await scanDeposits(testDb.db, [chain], now + 10_000)).toMatchObject([{ swept: 0, credited: 0 }]);
    expect(chain.sent).toHaveLength(1);

    chain.land("solana-tx-1");
    expect(await scanDeposits(testDb.db, [chain], now + 20_000)).toMatchObject([{ swept: 0, credited: 1 }]);
    expect(await scanDeposits(testDb.db, [chain], now + 30_000)).toMatchObject([{ swept: 0, credited: 0 }]);
    expect(await balance(id)).toBe(usd(25.37));
    expect(await sweeps(id)).toMatchObject([{ status: "confirmed", settledAt: new Date(now + 20_000) }]);
    expect(await testDb.db.select().from(payments).where(eq(payments.workspaceId, id))).toMatchObject([{
      kind: "topup", amountMicroUsd: usd(25.37), paymentProvider: "usdc-solana", externalId: "solana:solana-tx-1",
      receiptUrl: "https://explorer.test/tx/solana-tx-1",
    }]);
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [] });
  });

  it("sweeps a second deposit to the same address as its own credit", async () => {
    const chain = new FakeChain("base");
    const { id, address: owner } = await depositor(chain, "twice", usd(10));
    await scanDeposits(testDb.db, [chain], now);
    chain.land("base-tx-1");
    chain.funds.set(owner, usd(7.5));
    expect(await scanDeposits(testDb.db, [chain], now + 60_000)).toMatchObject([{ swept: 1, credited: 1 }]);
    chain.land("base-tx-2");
    await scanDeposits(testDb.db, [chain], now + 120_000);
    expect(await balance(id)).toBe(usd(17.5));
    expect((await testDb.db.select().from(payments).where(eq(payments.workspaceId, id))).map((payment) => payment.paymentProvider)).toEqual(["usdc-base", "usdc-base"]);
  });

  it("leaves less than the minimum in the address until it adds up", async () => {
    const chain = new FakeChain();
    const { id, address: owner } = await depositor(chain, "dust", MIN_DEPOSIT_MICRO_USD - BigInt(1));
    expect(await scanDeposits(testDb.db, [chain], now)).toMatchObject([{ checked: 1, swept: 0 }]);
    expect((await getDepositState(testDb.db, [chain], id, now)).networks[0]).toMatchObject({ incomingMicroUsd: MIN_DEPOSIT_MICRO_USD - BigInt(1), sweeping: false });
    chain.funds.set(owner, MIN_DEPOSIT_MICRO_USD);
    expect(await scanDeposits(testDb.db, [chain], now + 60_000)).toMatchObject([{ swept: 1 }]);
  });

  it("sends the sweep again when the first one can no longer land", async () => {
    const chain = new FakeChain();
    const { id } = await depositor(chain, "expired", usd(12));
    await scanDeposits(testDb.db, [chain], now);
    chain.states.set("solana-tx-1", { state: "failed", reason: "expired" });
    expect(await scanDeposits(testDb.db, [chain], now + 90_000)).toMatchObject([{ swept: 1, credited: 0 }]);
    expect(await sweeps(id)).toMatchObject([{ status: "failed", error: "expired" }, { status: "pending", txId: "solana-tx-2" }]);
    chain.land("solana-tx-2");
    await scanDeposits(testDb.db, [chain], now + 120_000);
    expect(await balance(id)).toBe(usd(12));
  });

  it("still credits a sweep it had given up on if it landed after all", async () => {
    const chain = new FakeChain();
    const { id } = await depositor(chain, "late", usd(12));
    await scanDeposits(testDb.db, [chain], now);
    chain.states.set("solana-tx-1", { state: "failed", reason: "expired" });
    // El segundo barrido no se puede preparar: solo queda el primero, dado por perdido.
    chain.prepareError = new Error("node is down");
    await scanDeposits(testDb.db, [chain], now + 90_000);
    expect(await sweeps(id)).toMatchObject([{ status: "failed" }]);

    chain.land("solana-tx-1");
    expect(await scanDeposits(testDb.db, [chain], now + 150_000)).toMatchObject([{ credited: 1 }]);
    expect(await sweeps(id)).toMatchObject([{ status: "confirmed", error: null }]);
    expect(await balance(id)).toBe(usd(12));
    // Y solo una vez.
    await scanDeposits(testDb.db, [chain], now + 200_000);
    expect(await balance(id)).toBe(usd(12));
  });

  it("marks a sweep the node rejected as failed, and keeps one with no answer in flight", async () => {
    const chain = new FakeChain();
    const rejected = await depositor(chain, "rejected", usd(5));
    chain.sendError = new RpcError("sendTransaction: Transaction simulation failed", -32002);
    expect(await scanDeposits(testDb.db, [chain], now)).toMatchObject([{ swept: 0 }]);
    expect(await sweeps(rejected.id)).toMatchObject([{ status: "failed", error: "sendTransaction: Transaction simulation failed", settledAt: new Date(now) }]);
    // Esa dirección espera un minuto antes de otro intento: un fallo que se repite no llena la tabla.
    chain.sendError = null;
    expect(await scanDeposits(testDb.db, [chain], now + RETRY_AFTER_FAILURE_MS - 1)).toMatchObject([{ checked: 1, swept: 0 }]);
    expect(await sweeps(rejected.id)).toHaveLength(1);
    expect(await scanDeposits(testDb.db, [chain], now + RETRY_AFTER_FAILURE_MS)).toMatchObject([{ swept: 1 }]);
    expect(await sweeps(rejected.id)).toMatchObject([{ status: "failed" }, { status: "pending" }]);

    chain.funds.delete(rejected.address);
    const unknown = await depositor(chain, "unknown", usd(5));
    chain.sendError = new RpcError("sendTransaction: fetch failed", null);
    expect(await scanDeposits(testDb.db, [chain], now + 120_000)).toMatchObject([{ swept: 0 }]);
    expect(await sweeps(unknown.id)).toMatchObject([{ status: "pending" }]);
    // Sin respuesta pudo haber salido: no se manda otro hasta saber qué pasó con ese.
    chain.sendError = null;
    expect(await scanDeposits(testDb.db, [chain], now + 240_000)).toMatchObject([{ swept: 0 }]);
    expect(await sweeps(unknown.id)).toHaveLength(1);
  });

  it("records nothing for a sweep that could not be prepared", async () => {
    const chain = new FakeChain();
    const { id } = await depositor(chain, "unprepared", usd(5));
    chain.prepareError = new Error("The Solana treasury wallet has no USDC account yet");
    expect(await scanDeposits(testDb.db, [chain], now)).toMatchObject([{ checked: 1, swept: 0 }]);
    expect(await sweeps(id)).toEqual([]);
    expect((await getDepositState(testDb.db, [chain], id, now)).networks[0]).toMatchObject({ incomingMicroUsd: usd(5), sweeping: false });
  });

  it("lets only one process sweep a network at a time", async () => {
    const chain = new FakeChain();
    await depositor(chain, "leased", usd(5));
    await testDb.db.insert(depositScans).values({ network: "solana", leasedUntil: new Date(now + 30_000) });
    expect(await scanDeposits(testDb.db, [chain], now)).toEqual([{ network: "solana", checked: 0, swept: 0, credited: 0, busy: true }]);
    expect(chain.reads).toEqual([]);
    // Si el proceso que la tenía murió, la toma el siguiente cuando vence.
    expect(await scanDeposits(testDb.db, [chain], now + 30_000)).toMatchObject([{ swept: 1 }]);
    expect((await testDb.db.select().from(depositScans))[0].leasedUntil).toEqual(new Date(0));
  });

  it("reads one workspace's addresses when its owner asks, at most every few seconds", async () => {
    const chain = new FakeChain();
    const mine = await depositor(chain, "mine", usd(5));
    await depositor(chain, "other", usd(9));
    expect(await scanDeposits(testDb.db, [chain], now, { workspaceId: mine.id })).toMatchObject([{ checked: 1, swept: 1 }]);
    expect(chain.reads).toEqual([[mine.address]]);
    expect(await scanDeposits(testDb.db, [chain], now + CHECK_INTERVAL_MS - 1, { workspaceId: mine.id })).toMatchObject([{ checked: 0 }]);
    expect(await scanDeposits(testDb.db, [chain], now + CHECK_INTERVAL_MS, { workspaceId: mine.id })).toMatchObject([{ checked: 1 }]);
    expect(chain.sent).toHaveLength(1);
  });

  it("keeps a workspace's own scan from crediting someone else's sweep", async () => {
    const chain = new FakeChain();
    const mine = await depositor(chain, "mine");
    const other = await depositor(chain, "other", usd(9));
    await scanDeposits(testDb.db, [chain], now);
    chain.land("solana-tx-1");
    expect(await scanDeposits(testDb.db, [chain], now + 10_000, { workspaceId: mine.id })).toMatchObject([{ credited: 0 }]);
    expect(await balance(other.id)).toBe(ZERO);
    expect(await scanDeposits(testDb.db, [chain], now + 20_000, { workspaceId: other.id })).toMatchObject([{ credited: 1 }]);
    expect(await balance(other.id)).toBe(usd(9));
  });

  it("has the cron read watched addresses every run and the rest in turns, oldest first", async () => {
    const chain = new FakeChain();
    const watched = await depositor(chain, "watched");
    const idle = await depositor(chain, "idle");
    await getDepositState(testDb.db, [chain], watched.id, now);
    const row = async (workspaceId: string) => (await testDb.db.select().from(depositAddresses).where(eq(depositAddresses.workspaceId, workspaceId)))[0];
    expect((await row(watched.id)).watchUntil).toEqual(new Date(now + WATCH_MS));
    expect((await row(idle.id)).watchUntil).toBeNull();

    await scanDeposits(testDb.db, [chain], now + 60_000);
    expect(chain.reads).toEqual([[watched.address, idle.address]]);
    expect((await row(idle.id)).checkedAt).toEqual(new Date(now + 60_000));
    // Cuando la vigilancia vence, la dirección sigue entrando por turno.
    await scanDeposits(testDb.db, [chain], now + WATCH_MS + 60_000);
    expect(chain.reads[1].toSorted()).toEqual([watched.address, idle.address].toSorted());
  });

  it("tells the dashboard what is on its way and what was credited", async () => {
    const chains = [new FakeChain("solana"), new FakeChain("base")];
    const { id } = await ensureDevWorkspace(testDb.db, "view");
    const [solana] = await ensureDepositAddresses(testDb.db, chains, id);
    chains[0].funds.set(solana.address, usd(30));
    expect((await getDepositState(testDb.db, chains, id, now)).networks).toEqual([
      { network: "solana", address: solana.address, testnet: false, incomingMicroUsd: ZERO, sweeping: false },
      { network: "base", address: `seed-a:base:${id}`, testnet: false, incomingMicroUsd: ZERO, sweeping: false },
    ]);

    await scanDeposits(testDb.db, chains, now, { workspaceId: id });
    expect((await getDepositState(testDb.db, chains, id, now)).networks[0]).toMatchObject({ incomingMicroUsd: usd(30), sweeping: true });

    chains[0].land("solana-tx-1");
    await scanDeposits(testDb.db, chains, now + 20_000, { workspaceId: id });
    const state = await getDepositState(testDb.db, chains, id, now + 20_000);
    expect(state).toMatchObject({ balanceMicroUsd: usd(30), networks: [{ incomingMicroUsd: ZERO, sweeping: false }, { incomingMicroUsd: ZERO }] });
    expect(state.credits).toMatchObject([{ network: "solana", amountMicroUsd: usd(30), url: "https://explorer.test/tx/solana-tx-1", at: new Date(now + 20_000) }]);

    const view = depositView({ networks: [], seed: "x".repeat(32), simulate: false }, chains, state);
    expect(view).toMatchObject({
      balanceMicroUsd: "30000000", minMicroUsd: "1000000", simulate: false,
      networks: [{ id: "solana", address: solana.address, walletUrl: `wallet:${solana.address}`, incomingMicroUsd: "0", sweeping: false }, { id: "base" }],
      credits: [{ amountMicroUsd: "30000000", at: now + 20_000 }],
    });
    expect(JSON.stringify(view)).not.toContain("x".repeat(32));
  });

  it("warns when a fee wallet is running low", async () => {
    const chains = [new FakeChain("solana"), new FakeChain("base")];
    chains[1].lowFees = true;
    const reports = await scanDeposits(testDb.db, chains, now);
    await checkFeeWallets(chains, reports);
    expect(reports).toEqual([
      { network: "solana", checked: 0, swept: 0, credited: 0 },
      { network: "base", checked: 0, swept: 0, credited: 0, lowFees: true },
    ]);
  });

  it("credits a simulated deposit in local development", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "simulated");
    await simulateDeposit(testDb.db, id, usd(25), now);
    await expect(simulateDeposit(testDb.db, id, usd(0.5), now)).rejects.toThrow("minimum");
    expect(await balance(id)).toBe(usd(25));
    const state = await getDepositState(testDb.db, depositChains(readCryptoConfig({ APP_ENV: "development" })), id, now);
    expect(state.credits).toMatchObject([{ network: "dev", amountMicroUsd: usd(25), url: null }]);
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [] });
  });
});

describe("buying with the balance", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => { testDb = await createTestDb(); });
  afterEach(async () => { await testDb?.close(); });

  let seq = 0;
  async function funded(name: string, amount: bigint) {
    const { id } = await ensureDevWorkspace(testDb.db, name);
    if (amount > ZERO) await recordTopUp(testDb.db, { workspaceId: id, amountMicroUsd: amount, payment: { provider: "usdc-dev", externalId: `dev:${++seq}` } });
    return id;
  }
  const balance = async (workspaceId: string) =>
    (await testDb.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)))[0].balanceMicroUsd;
  const subscription = async (workspaceId: string) =>
    (await testDb.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)))[0];
  const purchases = (workspaceId: string) => testDb.db.select().from(creditTransactions)
    .where(and(eq(creditTransactions.workspaceId, workspaceId), eq(creditTransactions.type, "purchase")));

  it("quotes a plan from the one in force", () => {
    const end = now + PERIOD_MS / 2;
    expect(planQuote(null, "pro", now)).toEqual({ mode: "activate", amountMicroUsd: PLANS.pro.priceMicroUsd });
    expect(planQuote({ planId: "pro", periodEnd: end }, "pro", now)).toEqual({ mode: "extend", amountMicroUsd: PLANS.pro.priceMicroUsd });
    expect(planQuote({ planId: "plus", periodEnd: end }, "max", now)).toEqual({ mode: "upgrade", amountMicroUsd: upgradeCharge("plus", "max", end, now) });
    expect(planQuote({ planId: "max", periodEnd: end }, "plus", now)).toBeNull();
    // Un plan que abrió un socio no se cambia desde el dashboard.
    expect(planQuote({ planId: "plan-9", periodEnd: end }, "max", now)).toBeNull();
  });

  it("activates a plan, adds 30 days to it and upgrades it, each paid from the balance", async () => {
    const id = await funded("plans", usd(200));
    expect(await buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "plus", now }))
      .toEqual({ mode: "activate", amountMicroUsd: PLANS.plus.priceMicroUsd });
    expect(await subscription(id)).toMatchObject({ planId: "plus", status: "active", paymentProvider: "balance", currentPeriodEnd: new Date(now + PERIOD_MS) });

    expect(await buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "plus", now: now + 1_000 }))
      .toEqual({ mode: "extend", amountMicroUsd: PLANS.plus.priceMicroUsd });
    expect((await subscription(id)).currentPeriodEnd).toEqual(new Date(now + 2 * PERIOD_MS));

    const prorated = upgradeCharge("plus", "max", now + 2 * PERIOD_MS, now + 2_000);
    expect(await buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "max", now: now + 2_000 }))
      .toEqual({ mode: "upgrade", amountMicroUsd: prorated });
    expect(await subscription(id)).toMatchObject({ planId: "max", currentPeriodEnd: new Date(now + 2 * PERIOD_MS) });

    const spent = PLANS.plus.priceMicroUsd * BigInt(2) + prorated;
    expect(await balance(id)).toBe(usd(200) - spent);
    expect((await purchases(id)).map((row) => row.amountMicroUsd)).toEqual([-PLANS.plus.priceMicroUsd, -PLANS.plus.priceMicroUsd, -prorated]);
    expect((await testDb.db.select().from(payments).where(eq(payments.paymentProvider, "balance"))).map((payment) => [payment.kind, payment.item, payment.amountMicroUsd]))
      .toEqual([["subscription", "plus", PLANS.plus.priceMicroUsd], ["subscription", "plus", PLANS.plus.priceMicroUsd], ["subscription", "max", prorated]]);
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [] });
  });

  it("starts a new period when the previous plan already ended", async () => {
    const id = await funded("renew", usd(100));
    await buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "pro", now });
    const later = now + PERIOD_MS + 60_000;
    expect(await buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "plus", now: later }))
      .toEqual({ mode: "activate", amountMicroUsd: PLANS.plus.priceMicroUsd });
    expect(await subscription(id)).toMatchObject({ planId: "plus", currentPeriodEnd: new Date(later + PERIOD_MS) });
  });

  it("does not sell a cheaper plan while a dearer one is in force", async () => {
    const id = await funded("downgrade", usd(200));
    await buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "max", now });
    await expect(buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "plus", now: now + 1_000 }))
      .rejects.toBeInstanceOf(PlanNotAvailableError);
    expect(await balance(id)).toBe(usd(200) - PLANS.max.priceMicroUsd);
    expect((await subscription(id)).planId).toBe("max");
  });

  it("changes nothing when the balance does not cover it, and says how much is missing", async () => {
    const id = await funded("short", usd(12.34));
    const attempt = buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "pro", now });
    await expect(attempt).rejects.toBeInstanceOf(InsufficientBalanceError);
    await expect(attempt).rejects.toMatchObject({ missingMicroUsd: PLANS.pro.priceMicroUsd - usd(12.34), balanceMicroUsd: usd(12.34) });
    expect(await balance(id)).toBe(usd(12.34));
    expect(await subscription(id)).toBeUndefined();
    expect(await purchases(id)).toEqual([]);
    expect(await testDb.db.select().from(payments).where(eq(payments.paymentProvider, "balance"))).toEqual([]);
  });

  it("deposits and then buys: the whole path leaves the ledger balanced", async () => {
    const chain = new FakeChain();
    const { id } = await ensureDevWorkspace(testDb.db, "end-to-end");
    const [{ address: owner }] = await ensureDepositAddresses(testDb.db, [chain], id);
    chain.funds.set(owner, usd(40));
    await scanDeposits(testDb.db, [chain], now, { workspaceId: id });
    chain.land("solana-tx-1");
    await scanDeposits(testDb.db, [chain], now + 20_000, { workspaceId: id });
    await buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "pro", now: now + 30_000 });
    expect(await balance(id)).toBe(usd(40) - PLANS.pro.priceMicroUsd);
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [] });
  });
});
