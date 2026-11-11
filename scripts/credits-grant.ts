import "./_env";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { grantCredits, usdToMicroUsdExact } from "../src/lib/billing/ledger";
import { ensureDevWorkspace } from "../src/lib/billing/workspaces";
import { closeDb, getDb } from "../src/lib/db/client";

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : [...args];
  // parseArgs confunde un monto negativo separado con otra opción.
  for (let index = 0; index < normalizedArgs.length - 1; index++) {
    const next = normalizedArgs[index + 1];
    if (normalizedArgs[index] === "--usd" && /^-\d+(?:\.\d+)?$/.test(next)) {
      normalizedArgs.splice(index, 2, `--usd=${next}`);
    }
  }
  const { values } = parseArgs({
    args: normalizedArgs,
    options: { workspace: { type: "string" }, usd: { type: "string" }, note: { type: "string" } },
  });
  if (!values.workspace?.trim()) throw new Error("Missing required argument: --workspace <name>");
  if (values.usd === undefined) throw new Error("Missing required argument: --usd <amount>");
  if (!values.note?.trim()) throw new Error("Missing required argument: --note <text>");
  const amountMicroUsd = usdToMicroUsdExact(values.usd);
  try {
    const db = getDb();
    const workspace = await ensureDevWorkspace(db, values.workspace);
    await grantCredits(db, { workspaceId: workspace.id, amountMicroUsd, note: values.note });
    console.log(`Granted ${amountMicroUsd} micro USD to workspace ${workspace.id}.`);
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Failed to grant credits");
    process.exitCode = 1;
  });
}
