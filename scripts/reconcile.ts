import "./_env";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { reconcile } from "../src/lib/billing/reconcile";
import { closeDb, getDb } from "../src/lib/db/client";

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  parseArgs({ args: args[0] === "--" ? args.slice(1) : args, options: {} });
  try {
    const result = await reconcile(getDb());
    console.log(`Balance invariant: ${result.balanceMismatches.length} mismatches`);
    for (const row of result.balanceMismatches) {
      console.log(`Workspace ${row.workspaceId}: expected ${row.expected}, actual ${row.actual} micro USD`);
    }
    console.log(`Key spend invariant: ${result.keySpendMismatches.length} mismatches`);
    for (const row of result.keySpendMismatches) {
      console.log(`API key ${row.apiKeyId}: expected ${row.expected}, actual ${row.actual} micro USD`);
    }
    console.log("Upstream spend by UTC day (micro USD):");
    for (const row of result.upstreamDaily) {
      console.log(`${row.day} | ${row.upstreamId ?? "(no upstream)"} | ${row.requestCount} requests | ${row.upstreamCostMicroUsd}`);
    }
    return result.balanceMismatches.length || result.keySpendMismatches.length ? 1 : 0;
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Failed to reconcile billing");
    process.exitCode = 1;
  });
}
