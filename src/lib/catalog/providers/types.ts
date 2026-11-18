import type { CatalogEntry, UpstreamDefinition, UpstreamModelMapping } from "../types";

/** Una ruta que un proveedor ofrece para un modelo, con los datos del modelo según ese proveedor. */
export type ProviderOffer = {
  /** El modelo con el mayor descuento que este proveedor permite por sí solo. */
  entry: CatalogEntry;
  /** `priority` la reasigna la mezcla: aquí no significa nada. */
  mapping: UpstreamModelMapping;
};

export type ProviderContext = {
  /** El catálogo vigente: sirve para conservar lo curado (tags) entre actualizaciones. */
  previous: CatalogEntry[];
  fetch: typeof fetch;
  signal: AbortSignal;
};

/**
 * Un proveedor (upstream) que publica su lista de modelos y precios (ADR-0055).
 * Para agregar uno: implementar esta interfaz y registrarlo en `providers/index.ts`.
 */
export interface CatalogProvider {
  upstream: Omit<UpstreamDefinition, "models">;
  loadOffers(context: ProviderContext): Promise<ProviderOffer[]>;
}
