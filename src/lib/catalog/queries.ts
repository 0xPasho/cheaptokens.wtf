import { CURATED_TAGS, FEATURED_MODELS, type TagCuration } from "@catalog/curation";
import { CATALOG } from "@catalog/models";

import { generatedDescription, isGeneratedDescription } from "./describe";
import { applyDiscount } from "./pricing";
import { byId } from "./search";
import { MODEL_TAGS, type ModelTag } from "./tags";
import type { CatalogEntry, CatalogModel } from "./types";

export { filterModels, matchesQuery, SORT_KEYS, type CatalogFilter, type SearchableModel, type SortKey } from "./search";

/** `long-context`: contexto ≥ 200,000 tokens (docs/06 › Tags). */
export const LONG_CONTEXT_MIN = 200_000;
/** `cheap`: precio cheapllm.wtf de output ≤ $1.00 por 1M. */
export const CHEAP_OUTPUT_MAX = 1_000_000;

export function computedTags(entry: CatalogEntry): ModelTag[] {
  const discountedOutput = applyDiscount(entry.officialOutput, entry.discountBps);
  const tags: ModelTag[] = [];
  if (entry.contextLength >= LONG_CONTEXT_MIN) tags.push("long-context");
  if (discountedOutput <= CHEAP_OUTPUT_MAX) tags.push("cheap");
  return tags;
}

/**
 * Lo que guarda la base (curados + calculados), sin la curaduría del repo. Es lo que escribe la
 * sincronización: así quitar una entrada de `CURATED_TAGS` la deshace sin tocar la base.
 */
export function storedTags(entry: CatalogEntry): ModelTag[] {
  const all = new Set<ModelTag>([...entry.tags, ...computedTags(entry)]);
  return MODEL_TAGS.filter((tag) => all.has(tag));
}

/**
 * Un modelo listo para mostrar. Aplica la curaduría del repo (ADR-0069) sobre lo que trae la base: suma y
 * quita tags curados y marca su lugar en «Recomendados». Los calculados siempre se recalculan.
 */
export function toModel(
  entry: CatalogEntry,
  curation: Record<string, TagCuration> = CURATED_TAGS,
  featured: readonly string[] = FEATURED_MODELS,
): CatalogModel {
  const curated = curation[entry.id];
  const all = new Set<ModelTag>([...entry.tags, ...(curated?.add ?? [])]);
  for (const tag of curated?.remove ?? []) all.delete(tag);
  for (const tag of computedTags(entry)) all.add(tag);
  const rank = featured.indexOf(entry.id);
  const allTags = MODEL_TAGS.filter((tag) => all.has(tag));
  return {
    ...entry,
    // La descripción generada dice si acepta imágenes: sigue al tag `vision` ya curado, no al del proveedor.
    description: isGeneratedDescription(entry) ? generatedDescription(entry.name, allTags.includes("vision")) : entry.description,
    discountedInput: applyDiscount(entry.officialInput, entry.discountBps),
    discountedOutput: applyDiscount(entry.officialOutput, entry.discountBps),
    allTags,
    slug: entry.id.slice(entry.author.length + 1),
    ...(rank >= 0 ? { featuredRank: rank } : {}),
  };
}

/** Lo que se ve en el catálogo: `active` y `deprecated`. `hidden` y `retired` no aparecen. */
export function getCatalog(entries: CatalogEntry[] = CATALOG): CatalogModel[] {
  return entries
    .filter((entry) => entry.status === "active" || entry.status === "deprecated")
    .map((entry) => toModel(entry));
}

export function getModel(author: string, slug: string, entries = CATALOG) {
  return getCatalog(entries).find((model) => model.id === `${author}/${slug}`);
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
    .toSorted((a, b) => b.shared - a.shared || b.other.discountBps - a.other.discountBps || byId(a.other, b.other))
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
