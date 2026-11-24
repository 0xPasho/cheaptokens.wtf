import type { Locale } from "@/lib/i18n/config";

import type { ModelTag } from "./tags";

/** Estados de un modelo (docs/06-catalogo-y-precios.md › Estados). */
export type ModelStatus = "active" | "hidden" | "deprecated" | "retired";

/** Un modelo como se escribe en catalog/models.ts. El precio cheapllm.wtf no se escribe: se deriva. */
export type CatalogEntry = {
  /** `autor/modelo`, permanente. */
  id: string;
  name: string;
  author: string;
  description: Record<"en", string> & Partial<Record<Locale, string>>;
  contextLength: number;
  /**
   * Salida máxima que reporta el proveedor (ADR-0067). Es el `max_tokens` que el gateway manda cuando el
   * cliente no fija uno. Sin valor, el gateway usa 32 768 y la sincronización conserva lo que haya en la base.
   */
  maxOutputTokens?: number;
  /**
   * Los `reasoning_effort` que aceptan todas las rutas que sirven el modelo, como los reporta el proveedor
   * (ADR-0076). Vacío: ninguno en común. Sin valor: no se sabe (la instantánea del repo, una base anterior).
   */
  reasoningLevels?: string[];
  /** µUSD por 1M de tokens (ADR-0007). */
  officialInput: number;
  officialOutput: number;
  officialPriceSourceUrl: string;
  /** `null` mientras el precio reportado no se haya verificado con el creador del modelo. */
  officialPriceVerifiedAt: string | null;
  discountBps: number;
  /** Solo los tags curados. `long-context` y `cheap` se calculan. */
  tags: ModelTag[];
  status: ModelStatus;
  retiresOn?: string;
};

/** Un modelo listo para mostrar: con precio cheapllm.wtf y tags calculados. */
export type CatalogModel = CatalogEntry & {
  discountedInput: number;
  discountedOutput: number;
  /** Curados + calculados, en el orden de MODEL_TAGS. */
  allTags: ModelTag[];
  /** Segmentos de la URL: /models/{author}/{slug}. */
  slug: string;
  /** Su lugar en «Recomendados» (`FEATURED_MODELS`), desde 0. Sin valor, no está destacado. */
  featuredRank?: number;
};

/** Entornos en los que existe un upstream. `mock` nunca lleva `production` (docs/07 › Tests automáticos). */
export type UpstreamEnvironment = "development" | "preview" | "production";

/** Un modelo mapeado a un upstream, como se escribe en catalog/upstreams.ts (docs/07 › Configuración). */
export type UpstreamModelMapping = {
  /** ID de cheapllm.wtf (`autor/modelo`). */
  model: string;
  /** ID en el upstream. En InferHub, siempre `prefijo/modelo`, nunca un alias (ADR-0028). */
  upstreamModel: string;
  /** Costo efectivo, µUSD por 1M de tokens. Con tope de precio, es también el tope (ADR-0028). */
  costInputPer1M: number;
  costOutputPer1M: number;
  /** Menor = se intenta primero. */
  priority: number;
  /** Default true. */
  enabled?: boolean;
};

/** Un upstream, como se escribe en catalog/upstreams.ts. */
export type UpstreamDefinition = {
  id: string;
  name: string;
  /** Sin `/` final. Se puede sobreescribir con `UPSTREAM_<ID>_BASE_URL`. */
  baseUrl: string;
  /** Nombre de la env var con la key, nunca el valor. Null si el upstream no pide key (el mock). */
  apiKeyEnv: string | null;
  /** Manda `x-max-input-price` / `x-max-output-price` (ADR-0028). */
  sendsPriceCap: boolean;
  environments: readonly UpstreamEnvironment[];
  models: UpstreamModelMapping[];
};
