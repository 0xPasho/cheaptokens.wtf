import { eq } from "drizzle-orm";

import { modelUpstreams, models, upstreams } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

import { mergeCatalog, mockUpstreamFor, type MergeReport, type ProviderOffers } from "./merge";
import type { CatalogProvider, ProviderOffer } from "./providers/types";
import { syncCatalog } from "./sync";
import type { ModelTag } from "./tags";
import type { CatalogEntry, UpstreamDefinition, UpstreamEnvironment } from "./types";

/** Los calcula la sincronización: no forman parte de lo curado (docs/06 › Tags). */
const COMPUTED_TAGS: readonly ModelTag[] = ["long-context", "cheap"];

/** El catálogo como está en la base, en el formato del archivo. */
export async function loadStoredEntries(db: Db): Promise<CatalogEntry[]> {
  const rows = await db.select().from(models);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    author: row.author,
    description: row.description,
    contextLength: row.contextLength,
    ...(row.maxOutputTokens !== null ? { maxOutputTokens: row.maxOutputTokens } : {}),
    officialInput: Number(row.officialInputPriceMicroUsd),
    officialOutput: Number(row.officialOutputPriceMicroUsd),
    officialPriceSourceUrl: row.officialPriceSourceUrl,
    officialPriceVerifiedAt: row.officialPriceVerifiedAt,
    discountBps: row.discountBps,
    tags: (row.tags as ModelTag[]).filter((tag) => !COMPUTED_TAGS.includes(tag)),
    status: row.status,
    ...(row.retiresAt ? { retiresOn: row.retiresAt } : {}),
  })).sort((a, b) => a.id.localeCompare(b.id));
}

/** Las rutas vigentes de un upstream: lo que se conserva si ese proveedor no responde. */
async function loadStoredOffers(db: Db, upstreamId: string, entries: Map<string, CatalogEntry>): Promise<ProviderOffer[]> {
  const rows = await db.select().from(modelUpstreams).where(eq(modelUpstreams.upstreamId, upstreamId));
  return rows.flatMap((row) => {
    const entry = entries.get(row.modelId);
    if (!row.enabled || !entry || entry.status === "retired") return [];
    return [{
      entry,
      mapping: {
        model: row.modelId, upstreamModel: row.upstreamModel,
        costInputPer1M: Number(row.costInputMicroUsd), costOutputPer1M: Number(row.costOutputMicroUsd), priority: row.priority,
      },
    }];
  });
}

/** Lo público de cada modelo (lo que muestran el sitio y `GET /v1/models`), en una forma comparable. */
function modelRows(entries: CatalogEntry[]) {
  return entries.map((entry) => [
    entry.id, entry.name, entry.author, entry.description.en, entry.description.es ?? null, entry.contextLength,
    entry.maxOutputTokens ?? null, entry.officialInput, entry.officialOutput, entry.officialPriceSourceUrl, entry.officialPriceVerifiedAt,
    entry.discountBps, [...entry.tags].sort(), entry.status, entry.retiresOn ?? null,
  ]).sort();
}

/** Lo que la sincronización escribiría, en una forma comparable con lo que ya está en la base. */
function fingerprint(entries: CatalogEntry[], definitions: Pick<UpstreamDefinition, "id" | "name" | "baseUrl" | "apiKeyEnv" | "sendsPriceCap">[], routes: string[]): string {
  return JSON.stringify({
    models: modelRows(entries),
    upstreams: definitions.map((item) => [item.id, item.name, item.baseUrl, item.apiKeyEnv, item.sendsPriceCap]).sort(),
    routes: [...routes].sort(),
  });
}

const routeKey = (upstreamId: string, route: { model: string; upstreamModel: string; costInputPer1M: number; costOutputPer1M: number; priority: number }) =>
  [upstreamId, route.model, route.upstreamModel, route.costInputPer1M, route.costOutputPer1M, route.priority].join("|");

async function storedFingerprint(db: Db, entries: CatalogEntry[]): Promise<string> {
  const definitions = await db.select().from(upstreams).where(eq(upstreams.enabled, true));
  const rows = await db.select().from(modelUpstreams).where(eq(modelUpstreams.enabled, true));
  return fingerprint(entries, definitions, rows.map((row) => routeKey(row.upstreamId, {
    model: row.modelId, upstreamModel: row.upstreamModel,
    costInputPer1M: Number(row.costInputMicroUsd), costOutputPer1M: Number(row.costOutputMicroUsd), priority: row.priority,
  })));
}

export type RefreshReport = MergeReport & {
  /** False cuando los proveedores dieron lo mismo que ya estaba: no se escribió nada. */
  changed: boolean;
  /**
   * True si cambió algo público de un modelo (precio, descuento, estado…), no solo el costo de una ruta. Es lo
   * que obliga a revalidar el sitio: un costo que se mueve sin cambiar el descuento no se ve en ninguna página.
   */
  catalogChanged: boolean;
  providers: { id: string; ok: boolean; offers: number; error?: string }[];
  warnings: string[];
};

/**
 * Trae la lista de cada proveedor, las une y deja el resultado en la base (ADR-0055). El gateway lo
 * toma en su siguiente recarga del catálogo, y el sitio cuando se revalida el tag `catalog`.
 *
 * Un proveedor que falla conserva sus rutas vigentes. Si fallan todos, no se escribe nada.
 */
export async function refreshCatalog(db: Db, options: {
  providers: readonly CatalogProvider[];
  environment: UpstreamEnvironment;
  /** El catálogo del repo: solo se usa mientras la base está vacía. */
  seed?: CatalogEntry[];
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<RefreshReport> {
  const { providers, environment, seed = [], fetch: fetcher = fetch, timeoutMs = 30_000 } = options;
  const stored = await loadStoredEntries(db);
  const previous = stored.length > 0 ? stored : seed;
  const storedById = new Map(stored.map((entry) => [entry.id, entry]));

  const sources: ProviderOffers[] = [];
  const report: RefreshReport["providers"] = [];
  for (const provider of providers) {
    try {
      const offers = await provider.loadOffers({ previous, fetch: fetcher, signal: AbortSignal.timeout(timeoutMs) });
      sources.push({ upstream: provider.upstream, offers });
      report.push({ id: provider.upstream.id, ok: true, offers: offers.length });
    } catch (error) {
      const offers = await loadStoredOffers(db, provider.upstream.id, storedById);
      sources.push({ upstream: provider.upstream, offers });
      report.push({
        id: provider.upstream.id, ok: false, offers: offers.length,
        error: error instanceof Error ? error.message.slice(0, 200) : "Unknown error",
      });
    }
  }
  if (report.every((provider) => !provider.ok)) {
    throw new Error(`No catalog provider answered; the current catalog was retained (${report.map((p) => `${p.id}: ${p.error}`).join("; ")})`);
  }

  const merged = mergeCatalog(sources, previous);
  if (merged.report.models === 0) throw new Error("The merged catalog has no models; the current catalog was retained");
  const next = [...merged.upstreams, mockUpstreamFor(merged.upstreams)];
  // El cron corre cada minuto: casi siempre no hay nada que escribir.
  const written = next.filter((upstream) => upstream.environments.includes(environment));
  const target = fingerprint(merged.models, written, written.flatMap((upstream) => upstream.models.map((route) => routeKey(upstream.id, route))));
  if (target === await storedFingerprint(db, stored)) return { ...merged.report, changed: false, catalogChanged: false, providers: report, warnings: [] };

  const catalogChanged = JSON.stringify(modelRows(merged.models)) !== JSON.stringify(modelRows(stored));
  const { warnings } = await syncCatalog(db, { models: merged.models, upstreams: next, environment });
  return { ...merged.report, changed: true, catalogChanged, providers: report, warnings };
}
