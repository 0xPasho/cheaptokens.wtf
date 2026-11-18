import "./_env";

import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { count, eq, sql } from "drizzle-orm";

import { closeDb, getDb } from "../src/lib/db/client";
import { depositAddresses, depositSweeps } from "../src/lib/db/schema";
import { readCryptoConfig } from "../src/lib/payments/crypto/config";
import { checkFeeWallets, depositChains, scanDeposits } from "../src/lib/payments/crypto/deposits";
import { SolanaChain } from "../src/lib/payments/crypto/solana";
import { usdcDecimal } from "../src/lib/payments/crypto/usdc";

/** `1500000000` con 9 decimales → `1.5`. */
function units(value: bigint, decimals: number): string {
  const text = value.toString().padStart(decimals + 1, "0");
  const fraction = text.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${text.slice(0, -decimals)}.${fraction}` : text.slice(0, -decimals);
}

/**
 * Estado de los pagos en USDC (ADR-0058): qué redes están activas, qué wallets hay que fondear para las
 * comisiones y si hay barridos sin resolver.
 *
 *   pnpm payments:status              el estado
 *   pnpm payments:status --new-seed   genera una semilla para CRYPTO_DEPOSIT_SEED
 *   pnpm payments:status --scan       corre un barrido ahora, como el cron
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args: args[0] === "--" ? args.slice(1) : args,
    options: { "new-seed": { type: "boolean" }, scan: { type: "boolean" } },
  });
  if (values["new-seed"]) {
    console.log(`CRYPTO_DEPOSIT_SEED=${randomBytes(32).toString("hex")}`);
    console.log("\nKeep it in a password manager and set it in Vercel. Every deposit address comes from it:");
    console.log("- if it leaks, whoever has it can move the deposits that have not been swept yet;");
    console.log("- if it changes or is lost, nothing sent to the current addresses can be swept.");
    return 0;
  }

  const config = readCryptoConfig();
  const chains = depositChains(config);
  if (chains.length === 0) {
    console.log("USDC payments are off. Set CRYPTO_DEPOSIT_SEED and CRYPTO_SOLANA_ADDRESS and/or CRYPTO_BASE_ADDRESS.");
    return 1;
  }
  if (config.simulate) console.log("Local development: example addresses, deposits are simulated.\n");

  let problems = 0;
  for (const [index, chain] of chains.entries()) {
    const network = config.networks[index];
    const fees = await chain.feeWallet();
    const unit = chain.network === "solana" ? "SOL" : "ETH";
    console.log(`${chain.network}${chain.testnet ? " (test network)" : ""}`);
    console.log(`  treasury      ${network.treasury}`);
    if (chain.live) {
      // Solo el host: la URL del RPC suele llevar la API key.
      console.log(`  rpc           ${new URL(network.rpcUrl).host}`);
      const usdc = (await chain.balances([network.treasury])).get(network.treasury) ?? BigInt(0);
      console.log(`  treasury USDC ${usdcDecimal(usdc)}`);
      if (chain instanceof SolanaChain && !await chain.treasuryReady()) {
        problems++;
        console.log("  PROBLEM       the treasury wallet has no USDC account: send it some USDC first, or sweeps will not run");
      }
    }
    console.log(`  fee wallet    ${fees.address}`);
    if (chain.live) {
      console.log(`  fee balance   ${units(fees.balance, chain.network === "solana" ? 9 : 18)} ${unit}`);
      if (fees.low) {
        problems++;
        console.log(`  PROBLEM       fund the fee wallet with ${chain.network === "solana" ? "0.05 SOL" : "0.002 ETH on Base"}: it pays the network fee of every sweep`);
      }
    }
  }

  if (chains.some((chain) => chain.live)) {
    try {
      const db = getDb();
      if (values.scan) {
        const reports = await scanDeposits(db, chains, Date.now());
        await checkFeeWallets(chains, reports);
        console.log(`\nScan: ${JSON.stringify(reports)}`);
        problems += reports.filter((report) => report.error).length;
      }
      const [[addresses], [pending], [failed]] = await Promise.all([
        db.select({ value: count() }).from(depositAddresses),
        db.select({ value: count() }).from(depositSweeps).where(eq(depositSweeps.status, "pending")),
        db.select({ value: count() }).from(depositSweeps)
          .where(sql`${depositSweeps.status} = 'failed' and ${depositSweeps.settledAt} > now() - interval '24 hours'`),
      ]);
      console.log(`\nDeposit addresses: ${addresses.value}`);
      console.log(`Sweeps in flight: ${pending.value}`);
      console.log(`Sweeps failed in the last 24 hours: ${failed.value}`);
    } finally {
      await closeDb();
    }
  }
  return problems > 0 ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  void main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Failed to read the payments status");
    process.exitCode = 1;
  });
}
