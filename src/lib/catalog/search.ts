import type { ModelTag } from "./tags";
import type { CatalogModel } from "./types";

/*
 * Búsqueda y orden del catálogo. Sin datos: los usan el catálogo, la paleta de búsqueda (en el navegador) y
 * las pruebas, así que este archivo no importa `@catalog/models`.
 */

/** `featured` es el orden por defecto: el de `FEATURED_MODELS` y, después, el resto por descuento. */
export const SORT_KEYS = ["featured", "output", "discount", "name"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type CatalogFilter = { query: string; tags: ModelTag[]; sort: SortKey };
/** Lo que necesitan la búsqueda y el orden: también lo cumple la lista compacta de la paleta de búsqueda. */
export type SearchableModel = Pick<CatalogModel, "id" | "name" | "allTags" | "discountBps" | "discountedOutput" | "featuredRank">;

/** Minúsculas, sin acentos ni signos: «GPT-6.1», «gpt 6.1» y «gpt61» se escriben igual. */
const normalize = (value: string) => value.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
/** El nombre ordena con números naturales (5.9 antes que 5.10) y con las mismas reglas en cualquier idioma. */
const byName = new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare;
/** Desempate final: el ID es único y ASCII, así el orden es el mismo en el servidor, el navegador y cada idioma. */
export const byId = (a: Pick<SearchableModel, "id">, b: Pick<SearchableModel, "id">) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const rank = (model: SearchableModel) => model.featuredRank ?? Number.MAX_SAFE_INTEGER;

/** Cada palabra de la búsqueda tiene que aparecer en el nombre o en el ID (que lleva el autor). */
export function matchesQuery(model: Pick<SearchableModel, "id" | "name">, query: string) {
  const words = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalize(model.name) + " " + normalize(model.id);
  return words.every((word) => haystack.includes(word));
}

/** Búsqueda por nombre, autor o ID; los tags se combinan con Y (docs/06). */
export function filterModels<T extends SearchableModel>(models: T[], { query, tags, sort }: CatalogFilter): T[] {
  return models
    .filter((model) => matchesQuery(model, query))
    .filter((model) => tags.every((tag) => model.allTags.includes(tag)))
    .toSorted((a, b) => {
      if (sort === "output") return a.discountedOutput - b.discountedOutput || byId(a, b);
      if (sort === "name") return byName(a.name, b.name) || byId(a, b);
      if (sort === "discount") return b.discountBps - a.discountBps || byId(a, b);
      return rank(a) - rank(b) || b.discountBps - a.discountBps || byId(a, b);
    });
}

/** Lo que la paleta de búsqueda necesita de cada modelo: viaja en cada página, así que va sin descripciones ni precios oficiales. */
export type SearchModel = SearchableModel & Pick<CatalogModel, "author" | "slug">;

export function toSearchModel(model: CatalogModel): SearchModel {
  const { id, name, author, slug, allTags, discountBps, discountedOutput, featuredRank } = model;
  return { id, name, author, slug, allTags, discountBps, discountedOutput, ...(featuredRank !== undefined ? { featuredRank } : {}) };
}
