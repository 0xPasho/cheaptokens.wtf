// @vitest-environment node
/**
 * Los adaptadores de USDC contra las redes de verdad (ADR-0058). Solo lee y simula: no envía ninguna
 * transacción ni necesita fondos. Corre con `USDC_LIVE=1 pnpm test:live`, con los RPC de `.env.local`
 * (`CRYPTO_SOLANA_RPC_URL`, `CRYPTO_BASE_RPC_URL`) o, si faltan, los públicos.
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  type Address, address, appendTransactionMessageInstructions, blockhash, compileTransaction, createNoopSigner, createTransactionMessage,
  getBase58Decoder, getBase64EncodedWireTransaction, pipe, setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  decodeFunctionResult, encodeAbiParameters, encodeFunctionData, type Hex, keccak256, multicall3Abi, numberToHex, parseTransaction, toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { BaseChain, usdcAbi } from "@/lib/payments/crypto/base";
import { jsonRpc, type SweepRef } from "@/lib/payments/crypto/chain";
import { type BaseConfig, BASE_MAINNET_USDC, type SolanaConfig, SOLANA_MAINNET_USDC } from "@/lib/payments/crypto/config";
import { COMPUTE_UNIT_LIMIT, SolanaChain, sweepInstructions } from "@/lib/payments/crypto/solana";

const liveEnabled = process.env.USDC_LIVE === "1";
if (liveEnabled && existsSync(".env.local")) process.loadEnvFile(".env.local");

/** Una semilla solo para esta prueba: sus direcciones nunca reciben nada. */
const SEED = "live-test-seed-that-never-holds-any-funds-0123456789";
const WORKSPACE = "018f3c2a-0000-7000-8000-00000000beef";
const usd = (dollars: number) => BigInt(Math.round(dollars * 100)) * BigInt(10_000);
const ZERO = BigInt(0);

describe.skipIf(!liveEnabled)("USDC on Solana mainnet (read only)", () => {
  const rpcUrl = process.env.CRYPTO_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const mint = address(SOLANA_MAINNET_USDC);
  const config = (treasury: string): SolanaConfig => ({ id: "solana", treasury, rpcUrl, mint, cluster: "mainnet" });
  const rpc = <T>(method: string, params: unknown[]) => jsonRpc<T>(rpcUrl, method, params);
  const usdcAccount = async (owner: string) =>
    (await findAssociatedTokenPda({ owner: address(owner), tokenProgram: TOKEN_PROGRAM_ADDRESS, mint }))[0];

  interface Holder {
    owner: string;
    account: Address;
  }

  interface Sample {
    /** Una cuenta que acaba de pagar una comisión: tiene SOL. */
    feePayer: string;
    /** Wallets con USDC en su cuenta asociada. */
    holders: Holder[];
    okSignature: string;
    failedSignature: string | undefined;
  }

  /** Gente de verdad con USDC, sacada de las transacciones más recientes que tocaron el token. */
  let sampled: Promise<Sample> | undefined;
  function sample(): Promise<Sample> {
    sampled ??= (async () => {
      const signatures = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [mint, { limit: 40, commitment: "finalized" }]);
      const holders = new Map<string, Holder>();
      let feePayer: string | undefined;
      for (const { signature, err } of signatures) {
        if (err || holders.size >= 2) continue;
        const tx = await rpc<{
          transaction: { message: { accountKeys: { pubkey: string }[] } };
          meta: { postTokenBalances: { accountIndex: number; mint: string; owner?: string; programId?: string; uiTokenAmount: { amount: string } }[] };
        } | null>("getTransaction", [signature, { encoding: "jsonParsed", commitment: "finalized", maxSupportedTransactionVersion: 1 }]).catch(() => null);
        if (!tx) continue;
        const keys = tx.transaction.message.accountKeys;
        for (const item of tx.meta.postTokenBalances) {
          if (item.mint !== mint || !item.owner || item.programId !== TOKEN_PROGRAM_ADDRESS || BigInt(item.uiTokenAmount.amount) < usd(5)) continue;
          const account = keys[item.accountIndex]?.pubkey;
          if (account && account === await usdcAccount(item.owner)) {
            holders.set(item.owner, { owner: item.owner, account: address(account) });
            feePayer ??= keys[0].pubkey;
          }
        }
      }
      const okSignature = signatures.find((item) => !item.err)?.signature;
      if (holders.size < 2 || !feePayer || !okSignature) throw new Error("Could not find two USDC holders in recent transactions: run it again");
      return { feePayer, holders: [...holders.values()], okSignature, failedSignature: signatures.find((item) => item.err)?.signature };
    })();
    return sampled;
  }

  it("reads real USDC balances from associated token accounts, and nothing for a fresh address", async () => {
    const { holders } = await sample();
    const chain = new SolanaChain(config(holders[1].owner), SEED);
    const fresh = await chain.depositAddress(WORKSPACE);
    const balances = await chain.balances([holders[0].owner, fresh]);
    const onChain = await rpc<{ value: { amount: string } }>("getTokenAccountBalance", [holders[0].account, { commitment: "confirmed" }]);
    expect(balances.has(fresh)).toBe(false);
    // Entre las dos lecturas el saldo puede moverse: se comparan como magnitud, no al centavo.
    expect(balances.get(holders[0].owner) ?? ZERO).toBeGreaterThan(ZERO);
    expect(BigInt(onChain.value.amount)).toBeGreaterThan(ZERO);
  });

  it("sweeps only to a treasury wallet that already has a USDC account", async () => {
    const { holders } = await sample();
    expect(await new SolanaChain(config(holders[1].owner), SEED).treasuryReady()).toBe(true);
    const unused = await new SolanaChain(config(holders[1].owner), SEED).depositAddress("never-a-treasury");
    expect(await new SolanaChain(config(unused), SEED).treasuryReady()).toBe(false);
  });

  it("builds a sweep the token program executes within the compute limit", async () => {
    const { feePayer, holders } = await sample();
    const latest = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
    // Las mismas instrucciones del barrido, entre dos cuentas reales con USDC. Sin firmas: solo se simula.
    const message = pipe(
      createTransactionMessage({ version: "legacy" }),
      (tx) => setTransactionMessageFeePayerSigner(createNoopSigner(address(feePayer)), tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: blockhash(latest.value.blockhash), lastValidBlockHeight: BigInt(latest.value.lastValidBlockHeight) }, tx,
      ),
      (tx) => appendTransactionMessageInstructions(sweepInstructions({
        source: holders[0].account, mint, destination: holders[1].account, authority: createNoopSigner(address(holders[0].owner)), amountMicroUsd: usd(1),
      }), tx),
    );
    const wire = getBase64EncodedWireTransaction(compileTransaction(message));
    const { value } = await rpc<{ value: { err: unknown; unitsConsumed?: number; logs?: string[] } }>("simulateTransaction", [
      wire, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" },
    ]);
    expect(value.err, JSON.stringify(value.logs)).toBeNull();
    expect(value.unitsConsumed).toBeGreaterThan(0);
    expect(value.unitsConsumed).toBeLessThanOrEqual(COMPUTE_UNIT_LIMIT);
  });

  it("signs a sweep the network can decode and whose signatures it verifies", async () => {
    const { holders } = await sample();
    let wire: string | undefined;
    // En vez de enviarla se simula verificando firmas. Las wallets de esta semilla no tienen SOL, así que
    // la respuesta esperada es «no existe quien paga»: llegar ahí prueba que el formato y las firmas pasan.
    const interceptSend: typeof fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (body.method !== "sendTransaction") return fetch(url, init);
      wire = body.params[0] as string;
      return fetch(url, {
        ...init,
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "simulateTransaction", params: [wire, { encoding: "base64", sigVerify: true, commitment: "confirmed" }] }),
      });
    };
    const chain = new SolanaChain(config(holders[1].owner), SEED, interceptSend);
    const height = await rpc<number>("getBlockHeight", [{ commitment: "finalized" }]);
    const sweep = await chain.prepareSweep(WORKSPACE, usd(25.37));
    expect(sweep.txId).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
    expect(sweep.lastValid).toBeGreaterThan(BigInt(height));
    await sweep.send();
    const { value } = await rpc<{ value: { err: unknown } }>("simulateTransaction", [wire, { encoding: "base64", sigVerify: true, commitment: "confirmed" }]);
    expect(value.err).toBe("AccountNotFound");
  });

  it("tells finalized, failed and unseen transactions apart", async () => {
    const { okSignature, failedSignature } = await sample();
    const unseen = () => getBase58Decoder().decode(randomBytes(64));
    const height = await rpc<number>("getBlockHeight", [{ commitment: "finalized" }]);
    const refs: SweepRef[] = [
      { txId: okSignature, address: "", authNonce: null, lastValid: ZERO },
      { txId: unseen(), address: "", authNonce: null, lastValid: BigInt(height - 1_000) },
      { txId: unseen(), address: "", authNonce: null, lastValid: BigInt(height + 1_000) },
      ...(failedSignature ? [{ txId: failedSignature, address: "", authNonce: null, lastValid: ZERO }] : []),
    ];
    const states = await new SolanaChain(config(SOLANA_MAINNET_USDC), SEED).sweepStates(refs);
    expect(states.get(refs[0].txId)).toEqual({ state: "confirmed" });
    expect(states.get(refs[1].txId)).toEqual({ state: "failed", reason: "expired" });
    expect(states.get(refs[2].txId)).toEqual({ state: "pending" });
    if (failedSignature) expect(states.get(failedSignature)).toEqual({ state: "failed", reason: "reverted" });
  });
});

describe.skipIf(!liveEnabled)("USDC on Base mainnet (read only)", () => {
  const rpcUrl = process.env.CRYPTO_BASE_RPC_URL || "https://mainnet.base.org";
  const USDC = BASE_MAINNET_USDC as Hex;
  const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  /** Una dirección que nadie usa, derivada de otra semilla: hace de wallet principal en la simulación. */
  const treasury = privateKeyToAccount(keccak256(toHex("cheapllm.wtf live test treasury"))).address;
  const config: BaseConfig = { id: "base", treasury, rpcUrl, token: USDC, chainId: 8453, confirmations: 10 };
  const rpc = <T>(method: string, params: unknown[]) => jsonRpc<T>(rpcUrl, method, params);

  /** Dónde guarda el contrato de USDC el saldo de una cuenta: `balanceAndBlacklistStates`, en la posición 9. */
  const balanceSlot = (owner: Hex) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner, BigInt(9)]));
  /** Para simular: el contrato «cree» que la dirección de depósito tiene ese USDC. */
  const withBalance = (owner: Hex, amount: bigint) => ({ [USDC]: { stateDiff: { [balanceSlot(owner)]: numberToHex(amount, { size: 32 }) } } });

  it("signs an authorization the real USDC contract accepts, and it moves the whole deposit to the treasury", async () => {
    const amount = usd(25.37);
    const depositAddress = await new BaseChain(config, SEED).depositAddress(WORKSPACE) as Hex;
    const funded = withBalance(depositAddress, amount);
    const balanceOf = (owner: Hex) => encodeFunctionData({ abi: usdcAbi, functionName: "balanceOf", args: [owner] });
    // La posición del saldo es un detalle del contrato: se comprueba antes de usarla.
    expect(BigInt(await rpc<Hex>("eth_call", [{ to: USDC, data: balanceOf(depositAddress) }, "latest", funded]))).toBe(amount);

    let raw: Hex | undefined;
    // El gas se estima con ese saldo simulado y la transacción firmada se captura en vez de enviarse.
    const simulated: typeof fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      if (body.method === "eth_estimateGas") {
        return fetch(url, { ...init, body: JSON.stringify({ ...body, params: [body.params[0], "latest", funded] }) });
      }
      if (body.method === "eth_sendRawTransaction") {
        raw = body.params[0] as Hex;
        return Response.json({ jsonrpc: "2.0", id: 1, result: keccak256(raw) });
      }
      return fetch(url, init);
    };
    const chain = new BaseChain(config, SEED, simulated);
    const sweep = await chain.prepareSweep(WORKSPACE, amount, Date.now());
    await sweep.send();
    expect(raw).toBeDefined();
    const transaction = parseTransaction(raw!);
    expect(sweep.txId).toBe(keccak256(raw!));
    expect(transaction.to?.toLowerCase()).toBe(USDC.toLowerCase());

    // La llamada exacta que enviaría el relayer, y enseguida los saldos: todo en una sola simulación.
    const before = BigInt(await rpc<Hex>("eth_call", [{ to: USDC, data: balanceOf(treasury) }, "latest"]));
    const calls = [
      { target: USDC, allowFailure: false, callData: transaction.data! },
      { target: USDC, allowFailure: false, callData: balanceOf(treasury) },
      { target: USDC, allowFailure: false, callData: balanceOf(depositAddress) },
      { target: USDC, allowFailure: false, callData: encodeFunctionData({ abi: usdcAbi, functionName: "authorizationState", args: [depositAddress, sweep.authNonce as Hex] }) },
    ];
    const result = decodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      data: await rpc<Hex>("eth_call", [
        { to: MULTICALL3, data: encodeFunctionData({ abi: multicall3Abi, functionName: "aggregate3", args: [calls] }) }, "latest", funded,
      ]),
    });
    expect(result.map((item) => item.success)).toEqual([true, true, true, true]);
    expect(BigInt(result[1].returnData) - before).toBe(amount);
    expect(BigInt(result[2].returnData)).toBe(ZERO);
    expect(decodeFunctionResult({ abi: usdcAbi, functionName: "authorizationState", data: result[3].returnData })).toBe(true);
  });

  it("reads real balances through Multicall3, and tells mined, unseen and expired sweeps apart", async () => {
    const latest = Number(BigInt(await rpc<Hex>("eth_blockNumber", [])));
    const logs = await rpc<{ topics: Hex[]; transactionHash: Hex }[]>("eth_getLogs", [{
      address: USDC, topics: [TRANSFER_TOPIC], fromBlock: numberToHex(latest - 40), toBlock: numberToHex(latest - 38),
    }]);
    expect(logs.length).toBeGreaterThan(0);
    const chain = new BaseChain(config, SEED);
    const fresh = await chain.depositAddress(WORKSPACE);
    const receivers = [...new Set(logs.slice(0, 20).map((log) => `0x${log.topics[2].slice(-40)}`))];
    const balances = await chain.balances([...receivers, fresh]);
    expect(balances.has(fresh)).toBe(false);
    expect([...balances.values()].some((value) => value > ZERO)).toBe(true);

    const unseen = () => `0x${randomBytes(32).toString("hex")}`;
    const seconds = BigInt(Math.floor(Date.now() / 1000));
    const refs: SweepRef[] = [
      { txId: logs[0].transactionHash, address: fresh, authNonce: null, lastValid: ZERO },
      { txId: unseen(), address: fresh, authNonce: null, lastValid: seconds + BigInt(600) },
      { txId: unseen(), address: fresh, authNonce: null, lastValid: seconds - BigInt(3_600) },
    ];
    const states = await chain.sweepStates(refs);
    expect(states.get(refs[0].txId)).toEqual({ state: "confirmed" });
    expect(states.get(refs[1].txId)).toEqual({ state: "pending" });
    expect(states.get(refs[2].txId)).toEqual({ state: "failed", reason: "expired" });
  });
});
