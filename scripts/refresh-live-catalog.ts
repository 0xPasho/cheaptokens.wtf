import "./_env";

import { CATALOG } from "../catalog/models";
import { CATALOG_PROVIDERS } from "../src/lib/catalog/providers";
import { refreshCatalog } from "../src/lib/catalog/refresh";
import { closeDb, getDb } from "../src/lib/db/client";
import { readSecret, readServerEnv } from "../src/lib/env";

/** Lo mismo que hace el cron (`/api/internal/refresh-catalog`), desde la terminal (ADR-0055). */
async function main(): Promise<void> {
  try {
    const { appEnv } = readServerEnv();
    const report = await refreshCatalog(getDb(), { providers: CATALOG_PROVIDERS, environment: appEnv, seed: CATALOG });
    for (const warning of report.warnings) console.warn(warning);
    for (const provider of report.providers) {
      console.log(`${provider.id}: ${provider.ok ? `${provider.offers} offers` : `FAILED (${provider.error}); kept ${provider.offers} stored routes`}`);
    }
    if (!report.changed) { console.log(`Catalog for ${appEnv} is already up to date (${report.models} models).`); return; }
    console.log(`Catalog refreshed for ${appEnv}: ${report.models} models, ${report.routes} routes, ${report.droppedRoutes} routes dropped, ${report.retired} retired.`);
    if (!report.catalogChanged) { console.log("Only route costs changed: the site shows the same catalog."); return; }

    const appUrl = readSecret("APP_URL");
    const secret = readSecret("INTERNAL_REVALIDATE_SECRET");
    if (!appUrl || !secret) {
      console.warn("Catalog cache was not revalidated: APP_URL and INTERNAL_REVALIDATE_SECRET are required. The site picks up the change within a minute.");
      return;
    }
    const response = await fetch(new URL("/api/internal/revalidate-catalog", appUrl), {
      method: "POST", headers: { authorization: `Bearer ${secret}` }, redirect: "error",
    }).catch(() => null);
    console.log(response?.ok ? "Catalog cache revalidated." : "Catalog cache was not revalidated; the site picks up the change within a minute.");
  } finally {
    await closeDb();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Catalog refresh failed");
  process.exitCode = 1;
});
