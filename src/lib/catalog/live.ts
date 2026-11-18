import { cacheLife, cacheTag } from "next/cache";

import { CATALOG } from "@catalog/models";
import { getDb } from "@/lib/db/client";
import { readServerEnv } from "@/lib/env";

import { getCatalog } from "./queries";
import { loadStoredEntries } from "./refresh";
import type { CatalogEntry, CatalogModel } from "./types";

const DB_TIMEOUT_MS = 3_000;

/**
 * El catálogo vigente (ADR-0055): sale de la base, que `refreshCatalog` mantiene al día con los
 * proveedores. Se cachea con el tag `catalog`, que la actualización revalida; aun sin ella, se
 * vuelve a leer cada minuto.
 *
 * El catálogo del repo es el respaldo: sin base (build, pruebas), si está vacía o si no responde.
 */
export async function loadCatalogEntries(): Promise<CatalogEntry[]> {
  "use cache";
  cacheTag("catalog");
  cacheLife("minutes");
  try {
    if (!readServerEnv().databaseUrl) return CATALOG;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Catalog query timed out")), DB_TIMEOUT_MS);
    });
    try {
      const stored = await Promise.race([loadStoredEntries(getDb()), timeout]);
      return stored.length > 0 ? stored : CATALOG;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error("Catalog could not be read from the database; serving the repository snapshot", error instanceof Error ? error.message : error);
    return CATALOG;
  }
}

/** Lo que se ve en el catálogo: `active` y `deprecated`, con precio y tags calculados. */
export async function getLiveCatalog(): Promise<CatalogModel[]> {
  return getCatalog(await loadCatalogEntries());
}

export async function getLiveModel(author: string, slug: string): Promise<CatalogModel | undefined> {
  return (await getLiveCatalog()).find((model) => model.id === `${author}/${slug}`);
}
