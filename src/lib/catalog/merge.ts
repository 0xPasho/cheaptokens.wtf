import { applyDiscount } from "./pricing";
import type { ProviderOffer } from "./providers/types";
import type { CatalogEntry, UpstreamDefinition, UpstreamModelMapping } from "./types";
import { MIN_MARGIN_BPS } from "./validate";

export type ProviderOffers = { upstream: Omit<UpstreamDefinition, "models">; offers: ProviderOffer[] };

export type MergeReport = { models: number; routes: number; droppedRoutes: number; retired: number };

const BPS = BigInt(10_000);

/** El precio publicado cubre el costo de la ruta más el margen, en input y en output (docs/06 › Margen mínimo). */
function fitsUnderPrice(entry: CatalogEntry, mapping: UpstreamModelMapping): boolean {
  const covers = (official: number, cost: number) =>
    BigInt(applyDiscount(official, entry.discountBps)) * BPS >= BigInt(cost) * (BPS + BigInt(MIN_MARGIN_BPS));
  return covers(entry.officialInput, mapping.costInputPer1M) && covers(entry.officialOutput, mapping.costOutputPer1M);
}

/**
 * Une las ofertas de todos los proveedores en un catálogo (ADR-0055):
 * - el precio publicado de un modelo sale de la ruta que permite el mayor descuento;
 * - las demás rutas quedan como respaldo solo si su costo cabe bajo ese precio, de la más barata a la más cara;
 * - `hidden` y `deprecated` se conservan, y lo que ya nadie ofrece pasa a `retired` (los IDs son permanentes).
 */
export function mergeCatalog(sources: ProviderOffers[], previous: CatalogEntry[] = []): {
  models: CatalogEntry[];
  upstreams: UpstreamDefinition[];
  report: MergeReport;
} {
  const known = new Map(previous.map((entry) => [entry.id, entry]));
  const byModel = new Map<string, { upstreamId: string; offer: ProviderOffer }[]>();
  for (const { upstream, offers } of sources) {
    for (const offer of offers) {
      const routes = byModel.get(offer.entry.id) ?? [];
      // Una ruta por proveedor y modelo: la llave de `model_upstreams`.
      if (!routes.some((route) => route.upstreamId === upstream.id)) routes.push({ upstreamId: upstream.id, offer });
      byModel.set(offer.entry.id, routes);
    }
  }

  const models: CatalogEntry[] = [];
  const mappings = new Map<string, UpstreamModelMapping[]>(sources.map(({ upstream }) => [upstream.id, []]));
  let routes = 0;
  let droppedRoutes = 0;
  for (const id of [...byModel.keys()].sort((a, b) => a.localeCompare(b))) {
    const candidates = byModel.get(id)!;
    // El primero en caso de empate: respeta el orden de los proveedores.
    const best = candidates.reduce((winner, candidate) =>
      candidate.offer.entry.discountBps > winner.offer.entry.discountBps ? candidate : winner);
    const before = known.get(id);
    const curated = before?.status === "hidden" || before?.status === "deprecated";
    const entry: CatalogEntry = {
      ...best.offer.entry,
      status: curated ? before.status : "active",
      ...(curated && before.retiresOn ? { retiresOn: before.retiresOn } : {}),
    };
    delete entry.maxOutputTokens;

    const kept = candidates
      .filter((candidate) => fitsUnderPrice(entry, candidate.offer.mapping))
      .sort((a, b) => a.offer.mapping.costOutputPer1M - b.offer.mapping.costOutputPer1M
        || a.offer.mapping.costInputPer1M - b.offer.mapping.costInputPer1M);
    // La menor de las rutas que sirven: el fallback puede terminar en cualquiera (ADR-0067). Si ninguna la
    // reporta, se conserva la que ya estaba, que pudo fijarse a mano.
    const reported = kept.flatMap((candidate) => candidate.offer.entry.maxOutputTokens ?? []);
    const maxOutputTokens = reported.length > 0 ? Math.min(...reported) : before?.maxOutputTokens;
    if (maxOutputTokens !== undefined) entry.maxOutputTokens = maxOutputTokens;
    models.push(entry);
    droppedRoutes += candidates.length - kept.length;
    kept.forEach((candidate, index) => {
      mappings.get(candidate.upstreamId)!.push({ ...candidate.offer.mapping, model: id, priority: index + 1 });
      routes += 1;
    });
  }

  const retired = previous.filter((entry) => !byModel.has(entry.id)).map((entry) => ({ ...entry, status: "retired" as const }));
  return {
    models: [...models, ...retired],
    upstreams: sources.map(({ upstream }) => ({ ...upstream, models: mappings.get(upstream.id)! })),
    report: { models: models.length, routes, droppedRoutes, retired: retired.length },
  };
}

/**
 * El upstream simulado (scripts/mock-upstream.ts), detrás de las rutas reales. Solo existe en desarrollo
 * y preview; su costo va a la mitad del de la ruta más barata para que siempre deje margen.
 */
export function mockUpstreamFor(upstreams: UpstreamDefinition[]): UpstreamDefinition {
  const cheapest = new Map<string, UpstreamModelMapping>();
  for (const mapping of upstreams.flatMap((upstream) => upstream.models)) {
    if (mapping.priority === 1 || !cheapest.has(mapping.model)) cheapest.set(mapping.model, mapping);
  }
  return {
    id: "mock",
    name: "Mock upstream",
    baseUrl: "http://127.0.0.1:4010/v1",
    apiKeyEnv: null,
    sendsPriceCap: true,
    environments: ["development", "preview"],
    models: [...cheapest.values()].map((mapping) => ({
      model: mapping.model,
      upstreamModel: mapping.model,
      costInputPer1M: Math.floor(mapping.costInputPer1M / 2),
      costOutputPer1M: Math.floor(mapping.costOutputPer1M / 2),
      priority: 1_000,
    })),
  };
}
