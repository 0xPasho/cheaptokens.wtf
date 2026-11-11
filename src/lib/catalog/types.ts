import type { Locale } from "@/lib/i18n/config";

import type { ModelTag } from "./tags";

/** Estados de un modelo (docs/06-catalogo-y-precios.md › Estados). */
export type ModelStatus = "active" | "hidden" | "deprecated" | "retired";

/** Un modelo como se escribe en catalog/models.ts. El precio cheaptokens.wtf no se escribe: se deriva. */
export type CatalogEntry = {
  /** `autor/modelo`, permanente. */
  id: string;
  name: string;
  author: string;
  description: Record<"en", string> & Partial<Record<Locale, string>>;
  contextLength: number;
  /** µUSD por 1M de tokens (ADR-0007). */
  officialInput: number;
  officialOutput: number;
  officialPriceSourceUrl: string;
  /** `null` mientras el precio sea de ejemplo y nadie lo haya verificado. */
  officialPriceVerifiedAt: string | null;
  discountBps: number;
  /** Solo los tags curados. `long-context` y `cheap` se calculan. */
  tags: ModelTag[];
  status: ModelStatus;
  retiresOn?: string;
};

/** Un modelo listo para mostrar: con precio cheaptokens.wtf y tags calculados. */
export type CatalogModel = CatalogEntry & {
  discountedInput: number;
  discountedOutput: number;
  /** Curados + calculados, en el orden de MODEL_TAGS. */
  allTags: ModelTag[];
  /** Segmentos de la URL: /models/{author}/{slug}. */
  slug: string;
};
