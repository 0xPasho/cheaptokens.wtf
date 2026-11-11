import { CATALOG } from "@catalog/models";

import { applyDiscount } from "./pricing";
import { MODEL_TAGS, type ModelTag } from "./tags";
import type { CatalogEntry, CatalogModel } from "./types";

/** `long-context`: contexto ≥ 200,000 tokens (docs/06 › Tags). */
export const LONG_CONTEXT_MIN = 200_000;
/** `cheap`: precio cheaptokens.wtf de output ≤ $1.00 por 1M. */
export const CHEAP_OUTPUT_MAX = 1_000_000;

export function computedTags(entry: CatalogEntry): ModelTag[] {
  const discountedOutput = applyDiscount(entry.officialOutput, entry.discountBps);
  const tags: ModelTag[] = [];
  if (entry.contextLength >= LONG_CONTEXT_MIN) tags.push("long-context");
  if (discountedOutput <= CHEAP_OUTPUT_MAX) tags.push("cheap");
  return tags;
}

export function toModel(entry: CatalogEntry): CatalogModel {
  const all = new Set<ModelTag>([...entry.tags, ...computedTags(entry)]);
  return {
    ...entry,
    discountedInput: applyDiscount(entry.officialInput, entry.discountBps),
    discountedOutput: applyDiscount(entry.officialOutput, entry.discountBps),
    allTags: MODEL_TAGS.filter((tag) => all.has(tag)),
    slug: entry.id.slice(entry.author.length + 1),
  };
}

/** Lo que se ve en el catálogo: `active` y `deprecated`. `hidden` y `retired` no aparecen. */
export function getCatalog(entries: CatalogEntry[] = CATALOG): CatalogModel[] {
  return entries
    .filter((entry) => entry.status === "active" || entry.status === "deprecated")
    .map(toModel);
}

export function getModel(author: string, slug: string, entries = CATALOG) {
  return getCatalog(entries).find((model) => model.id === `${author}/${slug}`);
}

export type SortKey = "discount" | "output" | "name";
export type CatalogFilter = { query: string; tags: ModelTag[]; sort: SortKey };

/** Búsqueda por nombre, autor o ID; los tags se combinan con Y (docs/06). */
export function filterModels(models: CatalogModel[], { query, tags, sort }: CatalogFilter) {
  const needle = query.trim().toLowerCase();
  return models
    .filter(
      (model) =>
        !needle ||
        model.name.toLowerCase().includes(needle) ||
        model.id.toLowerCase().includes(needle),
    )
    .filter((model) => tags.every((tag) => model.allTags.includes(tag)))
    .toSorted((a, b) => {
      if (sort === "output") return a.discountedOutput - b.discountedOutput || a.name.localeCompare(b.name);
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.discountBps - a.discountBps || a.name.localeCompare(b.name);
    });
}

/** Modelos que comparten más tags con `model`, sin incluirlo. */
export function similarModels(model: CatalogModel, models: CatalogModel[], limit = 3) {
  return models
    .filter((other) => other.id !== model.id)
    .map((other) => ({
      other,
      shared: other.allTags.filter((tag) => model.allTags.includes(tag)).length,
    }))
    .filter(({ shared }) => shared > 0)
    .toSorted((a, b) => b.shared - a.shared || b.other.discountBps - a.other.discountBps)
    .slice(0, limit)
    .map(({ other }) => other);
}

/**
 * Costo de un request en µUSD (docs/06 › Costo de un request):
 * `ceil((prompt × input_1M + completion × output_1M) / 1M)`.
 */
export function requestCost(
  inputPerMillion: number,
  outputPerMillion: number,
  promptTokens: number,
  completionTokens: number,
) {
  return Math.ceil(
    (promptTokens * inputPerMillion + completionTokens * outputPerMillion) / 1_000_000,
  );
}
