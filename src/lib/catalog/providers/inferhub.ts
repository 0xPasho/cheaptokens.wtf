import { importInferhubCatalog, INFERHUB_CATALOG_URL } from "../inferhub-import";

import type { CatalogProvider } from "./types";

/** InferHub: lista pública con el precio oficial y los asks de cada ruta (ADR-0028, ADR-0046). */
export const inferhubProvider: CatalogProvider = {
  upstream: {
    id: "inferhub",
    name: "InferHub",
    baseUrl: "https://api.inferhub.dev/v1",
    apiKeyEnv: "UPSTREAM_INFERHUB_API_KEY",
    sendsPriceCap: true,
    environments: ["development", "preview", "production"],
  },
  async loadOffers({ previous, fetch, signal }) {
    const response = await fetch(INFERHUB_CATALOG_URL, { signal, redirect: "error" });
    if (!response.ok) throw new Error(`InferHub catalog failed (HTTP ${response.status})`);
    const imported = importInferhubCatalog(await response.json(), previous);
    const entries = new Map(imported.models.map((entry) => [entry.id, entry]));
    return imported.mappings.map((mapping) => ({ entry: entries.get(mapping.model)!, mapping }));
  },
};
