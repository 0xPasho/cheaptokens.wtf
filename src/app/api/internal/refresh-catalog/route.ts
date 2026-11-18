import { revalidateTag } from "next/cache";

import { CATALOG } from "@catalog/models";
import { CATALOG_PROVIDERS } from "@/lib/catalog/providers";
import { refreshCatalog } from "@/lib/catalog/refresh";
import { getDb } from "@/lib/db/client";
import { readSecret, readServerEnv } from "@/lib/env";
import { hasInternalSecret } from "@/lib/server/internal-auth";

export const maxDuration = 60;

/**
 * Actualiza costos y precios desde los proveedores (ADR-0055). La llama un cron: el del servidor (deploy/cron.sh) manda
 * `Authorization: Bearer $CRON_SECRET` por GET; cualquier otro puede usar `INTERNAL_REVALIDATE_SECRET`.
 */
async function refresh(request: Request): Promise<Response> {
  if (!hasInternalSecret(request, [readSecret("CRON_SECRET"), readSecret("INTERNAL_REVALIDATE_SECRET")])) {
    return new Response(null, { status: 401 });
  }
  try {
    const report = await refreshCatalog(getDb(), {
      providers: CATALOG_PROVIDERS, environment: readServerEnv().appEnv, seed: CATALOG,
    });
    if (report.changed) revalidateTag("catalog", "max");
    console.log(JSON.stringify({ event: "catalog_refreshed", ...report }));
    return Response.json({ ok: true, ...report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Catalog refresh failed";
    console.error(JSON.stringify({ event: "catalog_refresh_failed", severity: "critical", message }));
    return Response.json({ ok: false, error: "refresh_failed" }, { status: 502 });
  }
}

export const GET = refresh;
export const POST = refresh;
