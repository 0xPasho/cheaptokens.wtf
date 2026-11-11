import "./_env";

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { usdToMicroUsdExact } from "../src/lib/billing/ledger";
import { createApiKey, ensureDevWorkspace } from "../src/lib/billing/workspaces";
import { closeDb, getDb } from "../src/lib/db/client";

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const { values } = parseArgs({
    args: args[0] === "--" ? args.slice(1) : args,
    options: { workspace: { type: "string" }, name: { type: "string", default: "CLI key" }, "limit-usd": { type: "string" } },
  });
  if (!values.workspace?.trim()) throw new Error("Missing required argument: --workspace <name>");
  if (!values.name.trim()) throw new Error("API key name is required");
  const spendLimitMicroUsd = values["limit-usd"] === undefined ? null : usdToMicroUsdExact(values["limit-usd"]);
  if (spendLimitMicroUsd !== null && spendLimitMicroUsd < BigInt(0)) {
    throw new Error("API key spend limit must not be negative");
  }
  try {
    const db = getDb();
    const workspace = await ensureDevWorkspace(db, values.workspace);
    const created = await createApiKey(db, { workspaceId: workspace.id, name: values.name, spendLimitMicroUsd });
    console.log(`Workspace ID: ${workspace.id}\nHint: ${created.hint}\nSave this API key; it will not be shown again:\n${created.key}`);
  } finally {
    await closeDb();
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Failed to create API key");
    if (error instanceof Error && error.cause instanceof Error) {
      console.error(error.cause.message);
    }
    process.exitCode = 1;
  });
}
