// @vitest-environment node
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PLANS } from "@/lib/billing/plans";
import { buyPlanWithBalance, recordTopUp } from "@/lib/billing/purchases";
import { reconcile } from "@/lib/billing/reconcile";
import { ensureDevWorkspace } from "@/lib/billing/workspaces";
import { bitcoinAddresses, bitcoinOrders, bitcoinReceipts, creditTransactions, payments, subscriptions, workspaces } from "@/lib/db/schema";
import { bip21Url, btcDecimal, microUsdForSats, satsForMicroUsd } from "@/lib/payments/bitcoin/amounts";
import { type BitcoinConfig, bitcoinTxUrl, QUOTE_GRACE_MS, QUOTE_WINDOW_MS, readBitcoinConfig } from "@/lib/payments/bitcoin/config";
import { type BitcoinChain, type ChainPayment, EsploraChain, EsploraError } from "@/lib/payments/bitcoin/esplora";
import {
  BitcoinAddressMismatchError, type BitcoinDeps, CHECK_INTERVAL_MS, createBitcoinQuote, ensureBitcoinAddress, getBitcoinState,
  MISSING_DROP_MS, QuoteError, scanBitcoin, simulateBitcoinConfirmation, simulateBitcoinPayment,
} from "@/lib/payments/bitcoin/orders";
import { BitcoinRates, medianRate, parseUsdMicros, type Rate, type RateProvider, RateUnavailableError } from "@/lib/payments/bitcoin/rates";
import { bitcoinView } from "@/lib/payments/bitcoin/view";
import { BitcoinAccount, XpubError } from "@/lib/payments/bitcoin/xpub";

import { createTestDb } from "../helpers/db";

const usd = (dollars: number) => BigInt(Math.round(dollars * 100)) * BigInt(10_000);
const ZERO = BigInt(0);
const now = Date.UTC(2026, 10, 17, 18);
const MINUTE = 60_000;

// Los vectores de BIP84: la frase pública «abandon … about». Nadie debe enviar nada a estas direcciones.
const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const ZPUB = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
const XPUB = "xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V";
const VPUB = "vpub5Y6cjg78GGuNLsaPhmYsiw4gYX3HoQiRBiSwDaBXKUafCt9bNwWQiitDk5VZ5BVxYnQdwoTyXSs2JHRPAgjAvtbBrf8ZhDYe2jWAqvZVnsc";

describe("bitcoin addresses", () => {
  // Estas direcciones no pueden cambiar nunca: si cambian, lo que llegue a las de producción no lo ve la wallet.
  it("derives the BIP84 receive addresses from a zpub or an xpub", () => {
    for (const key of [ZPUB, XPUB]) {
      const account = new BitcoinAccount(key, "mainnet");
      expect(account.address(0)).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
      expect(account.address(1)).toBe("bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g");
      expect(account.accountNumber).toBe(0);
    }
    expect(new BitcoinAccount(VPUB, "signet").address(0)).toBe("tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl");
    expect(new BitcoinAccount(VPUB, "testnet4").address(1)).toBe("tb1qd7spv5q28348xl4myc8zmh983w5jx32cjhkn97");
  });

  it("rejects a private key, a key of another network and a key that is not an account", () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));
    expect(() => new BitcoinAccount(root.derive("m/84'/0'/0'").privateExtendedKey, "mainnet")).toThrow(/PRIVATE key/);
    expect(() => new BitcoinAccount(ZPUB, "signet")).toThrow(XpubError);
    expect(() => new BitcoinAccount(VPUB, "mainnet")).toThrow(/test network key/);
    expect(() => new BitcoinAccount(root.publicExtendedKey, "mainnet")).toThrow(/account key/);
    expect(() => new BitcoinAccount(root.derive("m/84'/0'/0'/0").publicExtendedKey, "mainnet")).toThrow(/account key/);
    expect(() => new BitcoinAccount("not-a-key", "mainnet")).toThrow(XpubError);
  });
});

describe("bitcoin amounts", () => {
  it("writes BTC with 8 decimals and rounds sats up and dollars down", () => {
    expect(btcDecimal(BigInt(41_234))).toBe("0.00041234");
    expect(btcDecimal(BigInt(150_000_000))).toBe("1.50000000");
    const rate = BigInt(94_580_120_000);
    const sats = satsForMicroUsd(usd(39), rate);
    expect(sats).toBe(BigInt(41_235));
    // Enviar lo cotizado nunca vale un µUSD menos de lo pedido.
    expect(microUsdForSats(sats, rate) >= usd(39)).toBe(true);
    expect(microUsdForSats(BigInt(41_234), rate) < usd(39)).toBe(true);
    expect(bip21Url("bc1qexample", BigInt(41_235))).toBe("bitcoin:bc1qexample?amount=0.00041235&label=cheapllm.wtf");
    expect(bip21Url("bc1qexample")).toBe("bitcoin:bc1qexample?label=cheapllm.wtf");
  });
});

describe("bitcoin price", () => {
  const source = (name: string, value: string | Error) => ({
    name,
    read: async () => {
      if (value instanceof Error) throw value;
      return parseUsdMicros(value);
    },
  });

  it("parses prices exactly and takes the median", () => {
    expect(parseUsdMicros("94580.12")).toBe(BigInt(94_580_120_000));
    expect(parseUsdMicros("94580.1234567")).toBe(BigInt(94_580_123_456));
    expect(() => parseUsdMicros("1e5")).toThrow();
    expect(medianRate([usd(3), usd(1), usd(2)])).toBe(usd(2));
    expect(medianRate([usd(1), usd(2)])).toBe(usd(1.5));
  });

  it("needs two sources that agree within 1%, and reuses the price for 30 seconds", async () => {
    let reads = 0;
    const counting = { name: "c", read: async () => { reads++; return usd(95_000); } };
    const rates = new BitcoinRates({ sources: [source("a", "94500"), counting, source("b", new Error("down"))] });
    expect((await rates.current(now)).rateMicroUsd).toBe(usd(94_750));
    await rates.current(now + 29_000);
    expect(reads).toBe(1);
    await rates.current(now + 31_000);
    expect(reads).toBe(2);
    await expect(new BitcoinRates({ sources: [source("a", "94000"), source("b", new Error("down"))] }).current(now)).rejects.toThrow(RateUnavailableError);
    await expect(new BitcoinRates({ sources: [source("a", "94000"), source("b", "96000")] }).current(now)).rejects.toThrow(/disagree/);
  });

  it("reads Coinbase, Kraken and Bitstamp", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      const text = String(url);
      if (text.includes("coinbase")) return Response.json({ data: { amount: "94580.10", base: "BTC", currency: "USD" } });
      if (text.includes("kraken")) return Response.json({ error: [], result: { XXBTZUSD: { c: ["94590.00000", "0.01"] } } });
      return Response.json({ last: "94600" });
    }) as typeof fetch;
    const rate = await new BitcoinRates({ fetchImpl }).current(now);
    expect(rate).toMatchObject({ rateMicroUsd: BigInt(94_590_000_000), sources: ["coinbase", "kraken", "bitstamp"] });
  });
});

describe("bitcoin config", () => {
  it("offers nothing without an xpub outside local development, and an example in development", () => {
    expect(readBitcoinConfig({ APP_ENV: "preview" })).toBeNull();
    expect(readBitcoinConfig({ APP_ENV: "development" })).toMatchObject({ network: "signet", simulate: true, esploraUrl: "" });
  });

  it("reads the xpub, the network and the API", () => {
    expect(readBitcoinConfig({ APP_ENV: "production", CRYPTO_BITCOIN_XPUB: ZPUB })).toEqual({
      network: "mainnet", xpub: ZPUB, esploraUrl: "https://mempool.space/api", confirmations: 1, simulate: false,
    });
    expect(readBitcoinConfig({ APP_ENV: "preview", CRYPTO_BITCOIN_XPUB: VPUB, CRYPTO_BITCOIN_NETWORK: "testnet4" }))
      .toMatchObject({ network: "testnet4", esploraUrl: "https://mempool.space/testnet4/api" });
    expect(readBitcoinConfig({
      APP_ENV: "preview", CRYPTO_BITCOIN_XPUB: ZPUB, CRYPTO_BITCOIN_ESPLORA_URL: "https://esplora.example/api/", CRYPTO_BITCOIN_CONFIRMATIONS: "3",
    })).toMatchObject({ esploraUrl: "https://esplora.example/api", confirmations: 3 });
    expect(() => readBitcoinConfig({ APP_ENV: "preview", CRYPTO_BITCOIN_XPUB: ZPUB, CRYPTO_BITCOIN_CONFIRMATIONS: "0" })).toThrow(/from 1/);
    expect(() => readBitcoinConfig({ APP_ENV: "preview", CRYPTO_BITCOIN_XPUB: ZPUB, CRYPTO_BITCOIN_NETWORK: "regtest" })).toThrow(/must be one of/);
    expect(() => readBitcoinConfig({ APP_ENV: "preview", CRYPTO_BITCOIN_XPUB: VPUB })).toThrow(/test network key/);
    expect(bitcoinTxUrl("mainnet", "ab")).toBe("https://mempool.space/tx/ab");
    expect(bitcoinTxUrl("signet", "ab")).toBe("https://mempool.space/signet/tx/ab");
  });
});

describe("Esplora", () => {
  it("lists the outputs that pay the address, in the mempool and confirmed", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url).endsWith("/blocks/tip/height")) return new Response("905120");
      return Response.json([
        { txid: "aa", vout: [{ scriptpubkey_address: "bc1qother", value: 5 }, { scriptpubkey_address: "bc1qme", value: 41_235 }], status: { confirmed: false } },
        { txid: "bb", vout: [{ scriptpubkey_address: "bc1qme", value: 1000 }], status: { confirmed: true, block_height: 905_100, block_time: 1_700_000_000 } },
        { txid: "cc", vout: [{ value: 7 }], status: { confirmed: true, block_height: 905_000, block_time: 1_699_000_000 } },
      ]);
    }) as typeof fetch;
    const chain = new EsploraChain("https://esplora.test/api", fetchImpl);
    expect(await chain.payments("bc1qme")).toEqual([
      { txid: "aa", vout: 1, sats: BigInt(41_235), blockHeight: null, blockTime: null },
      { txid: "bb", vout: 0, sats: BigInt(1000), blockHeight: 905_100, blockTime: 1_700_000_000_000 },
    ]);
    expect(await chain.tipHeight()).toBe(905_120);
    expect(calls[0]).toBe("https://esplora.test/api/address/bc1qme/txs");
    const limited = new EsploraChain("https://esplora.test/api", (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch);
    await expect(limited.payments("bc1qme")).rejects.toMatchObject({ status: 429 });
  });
});

/** Una cadena de mentira: lo que paga cada dirección y la altura del último bloque. */
class FakeChain implements BitcoinChain {
  readonly live = true;
  readonly outputs = new Map<string, ChainPayment[]>();
  readonly reads: string[] = [];
  tip = 905_000;
  failWith: Error | null = null;

  async payments(address: string) {
    this.reads.push(address);
    if (this.failWith) throw this.failWith;
    return this.outputs.get(address) ?? [];
  }

  async tipHeight() {
    return this.tip;
  }

  pay(address: string, txid: string, sats: bigint) {
    this.outputs.set(address, [...(this.outputs.get(address) ?? []), { txid, vout: 0, sats, blockHeight: null, blockTime: null }]);
  }

  /** El pago entra en el siguiente bloque. */
  mine(txid: string) {
    this.tip++;
    for (const [address, list] of this.outputs) {
      this.outputs.set(address, list.map((payment) => payment.txid === txid ? { ...payment, blockHeight: this.tip, blockTime: null } : payment));
    }
  }

  drop(txid: string) {
    for (const [address, list] of this.outputs) this.outputs.set(address, list.filter((payment) => payment.txid !== txid));
  }
}

class FakeRates implements RateProvider {
  rate = BigInt(90_000_000_000);
  async current(at = now): Promise<Rate> {
    return { rateMicroUsd: this.rate, sources: ["fake"], at };
  }
}

describe("bitcoin payments", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  let chain: FakeChain;
  let rates: FakeRates;
  let deps: BitcoinDeps;
  const config: BitcoinConfig = { network: "mainnet", xpub: ZPUB, esploraUrl: "https://esplora.test/api", confirmations: 1, simulate: false };
  beforeEach(async () => {
    testDb = await createTestDb();
    chain = new FakeChain();
    rates = new FakeRates();
    deps = { config, account: new BitcoinAccount(ZPUB, "mainnet"), chain, rates };
  });
  afterEach(async () => { await testDb?.close(); });

  const balance = async (workspaceId: string) =>
    (await testDb.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)))[0].balanceMicroUsd;
  const plan = async (workspaceId: string) =>
    (await testDb.db.select().from(subscriptions).where(eq(subscriptions.workspaceId, workspaceId)))[0] ?? null;
  const receipts = (workspaceId: string) =>
    testDb.db.select().from(bitcoinReceipts).where(eq(bitcoinReceipts.workspaceId, workspaceId)).orderBy(bitcoinReceipts.seenAt);
  const order = async (id: string) => (await testDb.db.select().from(bitcoinOrders).where(eq(bitcoinOrders.id, id)))[0];
  /** Una corrida del cron, después de que pasó el intervalo de lectura. */
  let clock = now;
  const scan = async (at?: number) => {
    clock = at ?? clock + CHECK_INTERVAL_MS;
    return scanBitcoin(testDb.db, deps, clock);
  };
  beforeEach(() => { clock = now; });

  it("gives each workspace its next address in order, and a new one after it receives", async () => {
    const a = await ensureDevWorkspace(testDb.db, "a");
    const b = await ensureDevWorkspace(testDb.db, "b");
    expect(await ensureBitcoinAddress(testDb.db, deps, a.id)).toBe("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
    expect(await ensureBitcoinAddress(testDb.db, deps, b.id)).toBe("bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g");
    // Cotizar varias veces no gasta índices: la dirección sigue siendo la misma mientras no reciba.
    await createBitcoinQuote(testDb.db, deps, a.id, { intent: "topup", amountMicroUsd: usd(10) }, now);
    await createBitcoinQuote(testDb.db, deps, a.id, { intent: "topup", amountMicroUsd: usd(20) }, now + 1);
    expect(await ensureBitcoinAddress(testDb.db, deps, a.id)).toBe(deps.account.address(0));
    chain.pay(deps.account.address(0), "tx-a", BigInt(10_000));
    await scan();
    expect(await ensureBitcoinAddress(testDb.db, deps, a.id)).toBe(deps.account.address(2));
    const rows = await testDb.db.select().from(bitcoinAddresses).orderBy(bitcoinAddresses.derivationIndex);
    expect(rows.map((row) => [row.derivationIndex, row.workspaceId, row.usedAt !== null])).toEqual([[0, a.id, true], [1, b.id, false], [2, a.id, false]]);
  });

  it("refuses to show an address that no longer comes from the xpub", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "moved");
    await ensureBitcoinAddress(testDb.db, deps, id);
    // Otra cuenta de la misma wallet: el índice 0 da otra dirección.
    const otherAccount = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC)).derive("m/84'/0'/1'").publicExtendedKey;
    const other = { ...deps, account: new BitcoinAccount(otherAccount, "mainnet") };
    await expect(ensureBitcoinAddress(testDb.db, other, id)).rejects.toThrow(BitcoinAddressMismatchError);
  });

  it("credits a top-up paid on time at the quoted price, once, after one confirmation", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "topup");
    const quote = await createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(25) }, now);
    expect(quote).toMatchObject({ amountMicroUsd: usd(25), rateMicroUsd: rates.rate, amountSats: BigInt(27_778), intent: "topup" });
    expect(quote.expiresAt.getTime()).toBe(now + QUOTE_WINDOW_MS);
    // El precio cae mientras tanto: llegó a tiempo, así que vale el cotizado.
    rates.rate = BigInt(85_000_000_000);
    chain.pay(quote.address, "tx-1", quote.amountSats);
    expect(await scan(now + 10 * MINUTE)).toMatchObject({ seen: 1, credited: 0 });
    expect(await balance(id)).toBe(ZERO);
    const state = await getBitcoinState(testDb.db, deps, id, now + 10 * MINUTE);
    expect(state.order).toMatchObject({ pending: true, receivedMicroUsd: BigInt(25_000_200) });
    chain.mine("tx-1");
    expect(await scan()).toMatchObject({ credited: 1 });
    expect(await scan()).toMatchObject({ seen: 0, credited: 0 });
    expect(await balance(id)).toBe(BigInt(25_000_200));
    expect(await receipts(id)).toMatchObject([{ status: "credited", rateSource: "quote", rateMicroUsd: BigInt(90_000_000_000), amountSats: BigInt(27_778) }]);
    expect(await testDb.db.select().from(payments).where(eq(payments.workspaceId, id))).toMatchObject([{
      kind: "topup", paymentProvider: "bitcoin", externalId: "bitcoin:tx-1:0", receiptUrl: "https://mempool.space/tx/tx-1",
    }]);
    expect(await order(quote.id)).toMatchObject({ outcome: "balance" });
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [] });
  });

  it("waits for the configured confirmations", async () => {
    deps = { ...deps, config: { ...config, confirmations: 3 } };
    const { id } = await ensureDevWorkspace(testDb.db, "deep");
    const quote = await createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(10) }, now);
    chain.pay(quote.address, "tx-deep", quote.amountSats);
    chain.mine("tx-deep");
    await scan();
    chain.tip += 1;
    expect(await scan()).toMatchObject({ credited: 0 });
    chain.tip += 1;
    expect(await scan()).toMatchObject({ credited: 1 });
  });

  it("prices a late payment at the market, and only honors the quote up to 10% over it", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "late");
    const quote = await createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(100) }, now);
    rates.rate = BigInt(80_000_000_000);
    chain.pay(quote.address, "half", quote.amountSats / BigInt(2));
    await scan(now + MINUTE);
    // Con lo anterior pasa de lo cotizado más 10 %: al precio del momento.
    chain.pay(quote.address, "too-much", quote.amountSats);
    await scan(now + 2 * MINUTE);
    // Visto dentro de los 2 minutos de gracia: todavía el precio cotizado.
    chain.pay(quote.address, "grace", BigInt(10_000));
    await scan(now + QUOTE_WINDOW_MS + QUOTE_GRACE_MS);
    // Después de la gracia: al precio del momento.
    chain.pay(quote.address, "late", BigInt(10_000));
    await scan(now + QUOTE_WINDOW_MS + QUOTE_GRACE_MS + MINUTE);
    expect((await receipts(id)).map((row) => [row.txid, row.rateSource, row.rateMicroUsd])).toEqual([
      ["half", "quote", BigInt(90_000_000_000)],
      ["too-much", "market", BigInt(80_000_000_000)],
      ["grace", "quote", BigInt(90_000_000_000)],
      ["late", "market", BigInt(80_000_000_000)],
    ]);
  });

  it("does not save a late payment while there is no price: it is seen again on the next run", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "no-price");
    const address = await ensureBitcoinAddress(testDb.db, deps, id);
    const failing = { ...deps, rates: { current: async () => { throw new RateUnavailableError("down"); } } };
    chain.pay(address, "tx-np", BigInt(50_000));
    expect(await scanBitcoin(testDb.db, failing, now)).toMatchObject({ checked: 1, seen: 0 });
    expect(await scan(now + MINUTE)).toMatchObject({ seen: 1 });
    expect(await receipts(id)).toMatchObject([{ rateSource: "market", orderId: null }]);
  });

  it("buys the plan when its payment confirms, even with the dialog closed", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "plan");
    await recordTopUp(testDb.db, { workspaceId: id, amountMicroUsd: usd(5), payment: { provider: "test", externalId: "seed-plan" } });
    const quote = await createBitcoinQuote(testDb.db, deps, id, { intent: "plan", planId: "pro" }, now);
    expect(quote).toMatchObject({ intent: "plan", planId: "pro", planMode: "activate", amountMicroUsd: usd(34) });
    chain.pay(quote.address, "tx-plan", quote.amountSats);
    await scan();
    chain.mine("tx-plan");
    await scan();
    expect(await plan(id)).toMatchObject({ planId: "pro", status: "active" });
    expect(await order(quote.id)).toMatchObject({ outcome: "plan" });
    // Los centavos de más por redondear los sats quedan como saldo.
    expect(await balance(id)).toBe(microUsdForSats(quote.amountSats, quote.rateMicroUsd) - usd(34));
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [] });
  });

  it("absorbs up to 2% so the plan goes through, and leaves the adjustment in the ledger", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "tolerance");
    const quote = await createBitcoinQuote(testDb.db, deps, id, { intent: "plan", planId: "pro" }, now);
    // Llega tarde, desde un exchange, y el precio bajó 1.5 %.
    rates.rate = (quote.rateMicroUsd * BigInt(985)) / BigInt(1000);
    chain.pay(quote.address, "tx-late", quote.amountSats);
    await scan(now + 40 * MINUTE);
    chain.mine("tx-late");
    await scan();
    expect(await plan(id)).toMatchObject({ planId: "pro" });
    expect(await balance(id)).toBe(ZERO);
    const [adjustment] = await testDb.db.select().from(creditTransactions)
      .where(and(eq(creditTransactions.workspaceId, id), eq(creditTransactions.type, "adjustment")));
    expect(adjustment).toMatchObject({ externalId: `bitcoin-tolerance:${quote.id}`, paymentProvider: "bitcoin" });
    expect(adjustment.amountMicroUsd > ZERO && adjustment.amountMicroUsd <= (PLANS.pro.priceMicroUsd * BigInt(2)) / BigInt(100)).toBe(true);
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [] });
  });

  it("keeps a short payment as balance and buys the plan when the rest arrives", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "short");
    const quote = await createBitcoinQuote(testDb.db, deps, id, { intent: "plan", planId: "plus" }, now);
    chain.pay(quote.address, "half", quote.amountSats / BigInt(2));
    await scan();
    chain.mine("half");
    await scan();
    expect(await plan(id)).toBeNull();
    expect(await order(quote.id)).toMatchObject({ settledAt: null });
    expect(await balance(id)).toBe(microUsdForSats(quote.amountSats / BigInt(2), quote.rateMicroUsd));
    chain.pay(quote.address, "rest", quote.amountSats - quote.amountSats / BigInt(2));
    await scan();
    chain.mine("rest");
    await scan();
    expect(await plan(id)).toMatchObject({ planId: "plus" });
    expect(await order(quote.id)).toMatchObject({ outcome: "plan" });
  });

  it("does not buy the plan again if it was already bought another way", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "twice");
    const quote = await createBitcoinQuote(testDb.db, deps, id, { intent: "plan", planId: "plus" }, now);
    chain.pay(quote.address, "tx-twice", quote.amountSats);
    await scan();
    // Mientras se confirma, paga el plan con USDC.
    await recordTopUp(testDb.db, { workspaceId: id, amountMicroUsd: usd(9), payment: { provider: "usdc-base", externalId: "usdc" } });
    await buyPlanWithBalance(testDb.db, { workspaceId: id, planId: "plus", now: clock });
    const periodEnd = (await plan(id))!.currentPeriodEnd.getTime();
    chain.mine("tx-twice");
    await scan();
    expect((await plan(id))!.currentPeriodEnd.getTime()).toBe(periodEnd);
    expect(await order(quote.id)).toMatchObject({ outcome: "balance" });
    expect(await balance(id)).toBe(microUsdForSats(quote.amountSats, quote.rateMicroUsd));
  });

  it("stops treating a payment as on its way when it leaves the network, and picks it up if it comes back", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "rbf");
    const quote = await createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(10) }, now);
    chain.pay(quote.address, "replaced", quote.amountSats);
    await scan();
    chain.drop("replaced");
    await scan();
    expect(await receipts(id)).toMatchObject([{ status: "seen" }]);
    expect((await receipts(id))[0].missingSince).not.toBeNull();
    expect(await scan(clock + MISSING_DROP_MS)).toMatchObject({ dropped: 1 });
    expect(await receipts(id)).toMatchObject([{ status: "dropped" }]);
    expect(bitcoinView(deps, await getBitcoinState(testDb.db, deps, id, clock), clock).receipts).toEqual([]);
    chain.pay(quote.address, "replaced", quote.amountSats);
    chain.mine("replaced");
    await scan();
    expect(await receipts(id)).toMatchObject([{ status: "credited" }]);
  });

  it("replaces the previous quote, and keeps one with a payment on its way", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "replace");
    const first = await createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(10) }, now);
    const second = await createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(20) }, now + MINUTE);
    expect(await order(first.id)).toMatchObject({ outcome: "replaced" });
    expect(second.address).toBe(first.address);
    chain.pay(second.address, "tx-second", second.amountSats);
    await scan(now + 2 * MINUTE);
    const third = await createBitcoinQuote(testDb.db, deps, id, { intent: "plan", planId: "pro" }, now + 3 * MINUTE);
    expect(third.address).not.toBe(second.address);
    expect(await order(second.id)).toMatchObject({ settledAt: null });
    expect(await receipts(id)).toMatchObject([{ orderId: second.id, rateSource: "quote" }]);
  });

  it("rejects quotes out of range, for a plan the balance covers, and too many in an hour", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "limits");
    await expect(createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(9.99) }, now)).rejects.toMatchObject({ code: "amount" });
    await expect(createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(10_001) }, now)).rejects.toMatchObject({ code: "amount" });
    await expect(createBitcoinQuote(testDb.db, deps, id, { intent: "plan", planId: "ultra" }, now)).rejects.toThrow(QuoteError);
    await recordTopUp(testDb.db, { workspaceId: id, amountMicroUsd: usd(100), payment: { provider: "test", externalId: "rich" } });
    await expect(createBitcoinQuote(testDb.db, deps, id, { intent: "plan", planId: "max" }, now)).rejects.toMatchObject({ code: "covered" });
    for (let index = 0; index < 30; index++) {
      await createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(10) }, now + index);
    }
    await expect(createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(10) }, now + 31)).rejects.toMatchObject({ code: "tooMany" });
  });

  it("stops the run when the API rate-limits us, and reads each address at most every few seconds", async () => {
    const { id } = await ensureDevWorkspace(testDb.db, "limited");
    await createBitcoinQuote(testDb.db, deps, id, { intent: "topup", amountMicroUsd: usd(10) }, now);
    chain.failWith = new EsploraError("HTTP 429", 429);
    expect(await scan(now)).toMatchObject({ error: "rate limited by the Esplora API" });
    chain.failWith = null;
    expect(await scan(now + 1000)).toMatchObject({ checked: 0 });
    expect(await scan(now + CHECK_INTERVAL_MS)).toMatchObject({ checked: 1 });
  });

  it("simulates the payment and its confirmation in local development", async () => {
    const dev = readBitcoinConfig({ APP_ENV: "development" })!;
    const devDeps: BitcoinDeps = { config: dev, account: new BitcoinAccount(dev.xpub, dev.network), chain, rates };
    const { id } = await ensureDevWorkspace(testDb.db, "dev");
    const quote = await createBitcoinQuote(testDb.db, devDeps, id, { intent: "plan", planId: "plus" }, now);
    expect(quote.address).toBe("tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl");
    await simulateBitcoinPayment(testDb.db, devDeps, id, now + MINUTE);
    expect((await getBitcoinState(testDb.db, devDeps, id, now + MINUTE)).order).toMatchObject({ pending: true });
    await simulateBitcoinConfirmation(testDb.db, devDeps, id, now + 2 * MINUTE);
    expect(await plan(id)).toMatchObject({ planId: "plus" });
    expect(await testDb.db.select().from(payments).where(and(eq(payments.workspaceId, id), eq(payments.kind, "topup"))))
      .toMatchObject([{ paymentProvider: "bitcoin-dev", receiptUrl: null }]);
    const view = bitcoinView(devDeps, await getBitcoinState(testDb.db, devDeps, id, now + 2 * MINUTE), now + 2 * MINUTE);
    expect(view).toMatchObject({ simulate: true, testnet: true, order: { outcome: "plan" }, receipts: [{ status: "credited", url: null }] });
    expect(view.address).toBe(devDeps.account.address(1));
  });
});
