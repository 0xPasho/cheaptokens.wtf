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
  "google/gemini-4-carbon",
  "moonshotai/kimi-k3",
  "deepseek/deepseek-v4.1-flash",
] as const;

/**
 * Los cuatro candidatos del hero (ADR-0070). `heroModels` decide el orden y el seleccionado inicial
 * con los descuentos vigentes (ADR-0074). Opus gana los empates con GPT; Gemini queda al final.
 */
export const HERO_MODELS = [
  "anthropic/claude-opus-5.5",
  "openai/gpt-6.2-sol",
  "deepseek/deepseek-v4.1-flash",
  "google/gemini-4-carbon",
] as const;

/** Descuento mínimo para que Opus o GPT encabecen el hero: 80 %, en puntos base. */
const HERO_PRIORITY_MIN_DISCOUNT_BPS = 8_000;

/**
 * Opus y GPT compiten por descuento, aunque DeepSeek tenga más. Si ninguno llega al 80 %, DeepSeek
 * va primero. El cliente selecciona el primero al cargar; las elecciones manuales siguen disponibles.
 * Los modelos ausentes se omiten, como en el resto de los ejemplos públicos.
 */
export function heroModels(models: readonly CatalogModel[]): CatalogModel[] {
  const [opus, gpt, deepseek, gemini] = HERO_MODELS;
  const primary = pickModels(models, [opus, gpt]).toSorted((a, b) => b.discountBps - a.discountBps);
  const fallback = pickModels(models, [deepseek]);
  const last = pickModels(models, [gemini]);
  return (primary[0]?.discountBps ?? 0) >= HERO_PRIORITY_MIN_DISCOUNT_BPS
    ? [...primary, ...fallback, ...last]
    : [...fallback, ...primary, ...last];
}

/** Modelos con los que se calculan las requests típicas de cada plan. El primero es el de referencia del dashboard. */
export const ESTIMATOR_MODELS = [
  "anthropic/claude-sonnet-5.5",
  "anthropic/claude-opus-5.5",
  "openai/gpt-6.1-sol",
  "google/gemini-4-carbon",
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
  "google/gemini-4-carbon",
  "qwen/qwen4-max",
  "z-ai/glm-5.3",
  "minimax/minimax-m3.1-flash",
  "deepseek/deepseek-v4.1-flash",
] as const;

/** Requests por minuto de una cuenta sin plan (docs/04 › Rate limits, ADR-0017). */
export const DEFAULT_RATE_LIMIT_RPM = 60;
/** Depósito mínimo: el mismo `MIN_DEPOSIT_MICRO_USD` de los depósitos en USDC (ADR-0058). Lo comprueba una prueba. */
export const MIN_DEPOSIT_MICRO_USD = 1_000_000;
/** Compra mínima en Bitcoin: el mismo `MIN_BITCOIN_ORDER_MICRO_USD` de las cotizaciones (ADR-0065). Lo comprueba una prueba. */
export const MIN_BITCOIN_ORDER_MICRO_USD = 10_000_000;
/** Minutos que queda fijo el precio de una cotización en Bitcoin: el `QUOTE_WINDOW_MS` de las cotizaciones. Lo comprueba una prueba. */
export const BITCOIN_QUOTE_MINUTES = 15;
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

// ── Tabla de precios de la landing ──

/** Los grupos de la tabla además de «Populares». Los mismos criterios que el vistazo: sin `fast` (casi vacío). */
export const PRICE_TABLE_TAGS = ["reasoning", "coding", "cheap", "vision"] as const satisfies readonly ModelTag[];
/** Filas por grupo: el resto está a un link, en /models con el filtro puesto. */
export const PRICE_TABLE_ROWS = 8;

/**
 * Las filas de un grupo: los modelos insignia primero (el precio oficial de salida más alto) y uno por autor antes
 * de repetir. Ordenar por descuento dejaría solo filas de −90 %, que no representan el catálogo.
 */
export function priceTableRows(members: readonly CatalogModel[], size = PRICE_TABLE_ROWS): CatalogModel[] {
  const sorted = members.toSorted((a, b) => b.officialOutput - a.officialOutput || a.name.localeCompare(b.name));
  const picked: CatalogModel[] = [];
  const authors = new Set<string>();
  for (const model of sorted) {
    if (picked.length === size) break;
    if (authors.has(model.author)) continue;
    picked.push(model);
    authors.add(model.author);
  }
  for (const model of sorted) {
    if (picked.length === size) break;
    if (!picked.includes(model)) picked.push(model);
  }
  return picked;
}

/** Cuántos modelos hay en cada tramo de 5 puntos de descuento, del menor tramo con modelos al mayor. */
export function discountHistogram(models: readonly CatalogModel[], step = 5) {
  const percents = models.map((model) => model.discountBps / 100);
  if (!percents.length) return { buckets: [] as { from: number; count: number }[], minBps: 0, maxBps: 0 };
  const low = Math.floor(Math.min(...percents) / step) * step;
  const high = Math.floor(Math.max(...percents) / step) * step;
  const buckets = Array.from({ length: (high - low) / step + 1 }, (_, index) => ({ from: low + index * step, count: 0 }));
  for (const percent of percents) buckets[Math.floor((percent - low) / step)].count++;
  return {
    buckets,
    minBps: Math.min(...models.map((model) => model.discountBps)),
    maxBps: Math.max(...models.map((model) => model.discountBps)),
  };
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
  { id: "payments", items: ["howPay", "bitcoin", "howLong", "cards", "wrongToken", "refunds"] },
  { id: "api", items: ["compatible", "endpoints", "rateLimit", "keyLimits"] },
  { id: "privacy", items: ["prompts", "export", "signOut"] },
];

/** Las siete de la landing. */
/** «Por qué cuesta menos» ya es una sección de la landing: aquí van las otras dudas de antes de empezar. */
export const HOME_FAQ: readonly FaqId[] = ["compatible", "howPay", "limitReached", "pricesChange", "failedRequest"];
/** Las de cómo funciona, en /how-it-works (ADR-0071). */
export const HOW_FAQ: readonly FaqId[] = ["whoPicks", "pricesChange", "failedRequest", "prompts", "endpoints"];
/** Las de cobro, en /pricing. */
export const PRICING_FAQ: readonly FaqId[] = ["howCharged", "limitsInDollars", "autoRenew", "howPay", "failedRequest"];
