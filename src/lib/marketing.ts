/**
 * Contenido de las páginas públicas que explican el producto: la landing, /pricing y /faq
 * (ADR-0060, ADR-0061 y ADR-0062). Aquí vive lo que no es texto: qué modelos se muestran,
 * cómo se agrupa el vistazo al catálogo y qué preguntas van en cada página. El texto está
 * en los diccionarios.
 */
import type { CatalogModel } from "@/lib/catalog/types";
import type { ModelTag } from "@/lib/catalog/tags";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/** Modelos conocidos para «Precio a la vista». Los que salgan del catálogo simplemente no se muestran. */
export const PRICE_STRIP_MODELS = [
  "anthropic/claude-opus-5.5",
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6.1-sol",
  "google/gemini-4-argon",
  "moonshotai/kimi-k3",
  "deepseek/deepseek-v4.1-flash",
] as const;

/** Modelos con los que se calculan las requests típicas de cada plan. El primero es el de referencia del dashboard. */
export const ESTIMATOR_MODELS = [
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-opus-5.5",
  "openai/gpt-6.1-sol",
  "google/gemini-4-argon",
  "deepseek/deepseek-v4.1-flash",
] as const;

/** La tabla «Lo que gasta cada modelo» de /pricing. */
export const USAGE_TABLE_MODELS = [
  "anthropic/claude-fable-5.2",
  "anthropic/claude-opus-5.5",
  "openai/gpt-6.1-sol",
  "anthropic/claude-sonnet-5.5",
  "moonshotai/kimi-k3",
  "openai/gpt-5.3-codex",
  "x-ai/grok-4.7",
  "google/gemini-4-argon",
  "qwen/qwen4-max",
  "z-ai/glm-5.3",
  "minimax/minimax-m3.1-flash",
  "deepseek/deepseek-v4.1-flash",
] as const;

/** Requests por minuto de una cuenta sin plan (docs/04 › Rate limits, ADR-0017). */
export const DEFAULT_RATE_LIMIT_RPM = 60;
/** Depósito mínimo: el mismo `MIN_DEPOSIT_MICRO_USD` de los depósitos en USDC (ADR-0058). Lo comprueba una prueba. */
export const MIN_DEPOSIT_MICRO_USD = 1_000_000;
/** Tope mensual del excedente con el que empieza cada cuenta: el default de `workspaces.overflow_cap_micro_usd`. */
export const DEFAULT_OVERFLOW_CAP_MICRO_USD = 25_000_000;
/** El monto de ejemplo de la tarjeta de créditos: «10 US$ ≈ N requests». */
export const CREDITS_EXAMPLE_MICRO_USD = 10_000_000;

/** Los modelos de `ids` que existen en el catálogo, en el orden de `ids`. */
export function pickModels(models: readonly CatalogModel[], ids: readonly string[]): CatalogModel[] {
  return ids.flatMap((id) => models.filter((model) => model.id === id));
}

/** El mayor descuento del catálogo, para «Hasta 90 % menos». */
export function maxDiscountBps(models: readonly CatalogModel[]): number {
  return models.reduce((max, model) => Math.max(max, model.discountBps), 0);
}

/** El descuento mediano del catálogo (el menor de los dos centrales si son pares). */
export function medianDiscountBps(models: readonly CatalogModel[]): number {
  if (!models.length) return 0;
  const sorted = models.map((model) => model.discountBps).toSorted((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

// ── Vistazo al catálogo ──

/**
 * Los grupos por capacidad que ayudan a elegir. Fuera, a propósito: `open-weights` (hoy sin modelos),
 * `tools` (casi ninguno lo declara) y `long-context` (lo tienen casi todos).
 */
export const PEEK_TAGS = ["reasoning", "coding", "cheap", "vision", "fast"] as const satisfies readonly ModelTag[];
export type PeekTag = (typeof PEEK_TAGS)[number];
export type PeekMode = "tag" | "author";
/** Tarjetas por grupo. */
export const PEEK_SIZE = 4;

export type PeekGroup = { mode: PeekMode; key: string; count: number; models: CatalogModel[] };

/**
 * Las tarjetas de un grupo: mayor descuento primero y, por capacidad, una por autor para que no salgan
 * cuatro variantes del mismo modelo. Si no alcanzan los autores, se completa con los siguientes.
 */
export function previewModels(members: readonly CatalogModel[], mode: PeekMode, size = PEEK_SIZE): CatalogModel[] {
  const sorted = members.toSorted((a, b) => b.discountBps - a.discountBps || a.name.localeCompare(b.name));
  const picked: CatalogModel[] = [];
  const authors = new Set<string>();
  for (const model of sorted) {
    if (picked.length === size) break;
    if (mode === "tag" && authors.has(model.author)) continue;
    picked.push(model);
    authors.add(model.author);
  }
  for (const model of sorted) {
    if (picked.length === size) break;
    if (!picked.includes(model)) picked.push(model);
  }
  return picked;
}

/** Los grupos de un modo, sin los vacíos. Por autor, del que más modelos tiene al que menos. */
export function peekGroups(models: readonly CatalogModel[], mode: PeekMode): PeekGroup[] {
  const groups = mode === "tag"
    ? PEEK_TAGS.map((tag) => ({ key: tag as string, members: models.filter((model) => model.allTags.includes(tag)) }))
    : [...new Set(models.map((model) => model.author))]
      .map((author) => ({ key: author, members: models.filter((model) => model.author === author) }))
      .toSorted((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
  return groups
    .filter((group) => group.members.length > 0)
    .map((group) => ({ mode, key: group.key, count: group.members.length, models: previewModels(group.members, mode) }));
}

/** El catálogo con el grupo ya filtrado: los parámetros que `/models` ya entiende. */
export function groupHref(locale: string, mode: PeekMode, key: string) {
  return `/${locale}/models?${mode === "tag" ? "tags" : "author"}=${encodeURIComponent(key)}`;
}

// ── Preguntas frecuentes ──

export type FaqId = keyof Dictionary["faq"]["items"];
export type FaqTopicId = keyof Dictionary["faq"]["topics"];

/** Los temas de /faq y sus preguntas, en orden. */
export const FAQ_TOPICS: readonly { id: FaqTopicId; items: readonly FaqId[] }[] = [
  { id: "product", items: ["whatIs", "whyCheaper", "whoPicks", "freeTier", "whoRuns"] },
  { id: "billing", items: ["howCharged", "pricesChange", "failedRequest", "whereSpend"] },
  { id: "plans", items: ["whatPlan", "limitsInDollars", "limitsReset", "limitReached", "autoRenew", "changePlan"] },
  { id: "payments", items: ["howPay", "howLong", "cards", "wrongToken", "refunds"] },
  { id: "api", items: ["compatible", "endpoints", "rateLimit", "keyLimits"] },
  { id: "privacy", items: ["prompts", "export", "signOut"] },
];

/** Las siete de la landing. */
export const HOME_FAQ: readonly FaqId[] = ["whyCheaper", "compatible", "howPay", "limitReached", "prompts", "failedRequest", "pricesChange"];
/** Las de cobro, en /pricing. */
export const PRICING_FAQ: readonly FaqId[] = ["howCharged", "limitsInDollars", "autoRenew", "howPay", "failedRequest"];
