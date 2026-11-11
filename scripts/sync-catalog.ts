import "./_env";

import { CATALOG } from "../catalog/models";
import { UPSTREAMS } from "../catalog/upstreams";
import { syncCatalog } from "../src/lib/catalog/sync";
import { closeDb, getDb } from "../src/lib/db/client";
import { readSecret, readServerEnv } from "../src/lib/env";

async function main(): Promise<void> {
  try {
    const { appEnv } = readServerEnv();
    const { warnings } = await syncCatalog(getDb(), { models: CATALOG, upstreams: UPSTREAMS, environment: appEnv });
    for (const warning of warnings) console.warn(warning);
    console.log(`Catalog synchronized for ${appEnv}.`);

    const appUrl = readSecret("APP_URL");
    const secret = readSecret("INTERNAL_REVALIDATE_SECRET");
    if (!appUrl || !secret) {
      console.warn("Catalog cache was not revalidated: APP_URL and INTERNAL_REVALIDATE_SECRET are required.");
      return;
    }
    const response = await fetch(new URL("/api/internal/revalidate-catalog", appUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      redirect: "error",
    }).catch((error: unknown) => {
      throw new Error("Catalog was synchronized, but cache revalidation failed: the server could not be reached.", { cause: error });
    });
    if (!response.ok) throw new Error(`Catalog cache revalidation failed (HTTP ${response.status}).`);
    console.log("Catalog cache revalidated.");
  } finally {
    await closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
