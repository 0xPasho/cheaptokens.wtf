import { z } from "zod";

import { MODEL_TAGS } from "./tags";
import type { CatalogEntry, UpstreamDefinition, UpstreamModelMapping } from "./types";

/**
 * Esquemas zod de catalog/models.ts y catalog/upstreams.ts (ADR-0012). Los tipos de TypeScript ya
 * fijan la forma; esto valida los valores (rangos, formatos) que el compilador no ve.
 * Las reglas que cruzan modelos y upstreams viven en `validateCatalog()`.
 */

/** `autor/modelo`, en minúsculas (docs/06 › Identificadores). */
export const MODEL_ID_PATTERN = /^[a-z0-9-]+\/[a-z0-9.-]+$/;

/** µUSD por 1M de tokens: siempre un entero (ADR-0007). */
const microUsdPer1M = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const isoDate = z.iso.date();

const description = z.strictObject({
  en: z.string().trim().min(1),
  es: z.string().trim().min(1).optional(),
});

export const catalogEntrySchema = z.strictObject({
  id: z.string().regex(MODEL_ID_PATTERN, "Must be author/model, lowercase"),
  name: z.string().trim().min(1),
  author: z.string().regex(/^[a-z0-9-]+$/, "Must be lowercase letters, digits and hyphens"),
  description,
  contextLength: z.number().int().positive(),
  officialInput: microUsdPer1M.positive(),
  officialOutput: microUsdPer1M.positive(),
  officialPriceSourceUrl: z.url({ protocol: /^https$/, error: "Must be an https URL" }),
  officialPriceVerifiedAt: isoDate.nullable(),
  // 0–9999, el mismo check que `models.discount_bps` (docs/09).
  discountBps: z.number().int().min(0).max(9_999),
  tags: z.array(z.enum(MODEL_TAGS)),
  status: z.enum(["active", "hidden", "deprecated", "retired"]),
  retiresOn: isoDate.optional(),
}) satisfies z.ZodType<CatalogEntry>;

export const upstreamModelMappingSchema = z.strictObject({
  model: z.string().regex(MODEL_ID_PATTERN, "Must be a cheaptokens.wtf model ID (author/model)"),
  upstreamModel: z.string().trim().min(1),
  costInputPer1M: microUsdPer1M,
  costOutputPer1M: microUsdPer1M,
  priority: z.number().int().nonnegative(),
  enabled: z.boolean().optional(),
}) satisfies z.ZodType<UpstreamModelMapping>;

export const upstreamDefinitionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, "Must be lowercase letters, digits and hyphens"),
  name: z.string().trim().min(1),
  // Sin `/` final: el gateway le agrega `/chat/completions`.
  baseUrl: z
    .url({ protocol: /^https?$/, error: "Must be an http(s) URL" })
    .refine((url) => !url.endsWith("/"), "Must not end with /"),
  // El nombre de la env var, nunca el valor.
  apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "Must be an env var name").nullable(),
  sendsPriceCap: z.boolean(),
  environments: z
    .array(z.enum(["development", "preview", "production"]))
    .min(1)
    .refine((list) => new Set(list).size === list.length, "Must not repeat an environment"),
  models: z.array(upstreamModelMappingSchema),
}) satisfies z.ZodType<UpstreamDefinition>;
