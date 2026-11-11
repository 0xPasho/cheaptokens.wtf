import type { z } from "zod";

import { applyDiscount } from "./pricing";
import { catalogEntrySchema, upstreamDefinitionSchema } from "./schema";
import type { ModelTag } from "./tags";
import type { CatalogEntry, UpstreamDefinition, UpstreamEnvironment, UpstreamModelMapping } from "./types";

/** Margen mínimo sobre el costo del upstream, en bps: 1000 = 10% (docs/06 › Margen mínimo). */
export const MIN_MARGIN_BPS = 1_000;

/** Los calcula la sincronización a partir del contexto y del precio: nunca se escriben a mano (docs/06 › Tags). */
const COMPUTED_TAGS: readonly ModelTag[] = ["long-context", "cheap"];

/** El upstream simulado: solo existe en desarrollo y previews (docs/07 › Tests automáticos). */
const MOCK_UPSTREAM_ID = "mock";

/**
 * Upstreams en los que `upstreamModel` es siempre `prefijo/modelo`. En InferHub, un ID sin prefijo
 * es un alias y no tiene precio propio: no se sabría qué modelo ni a qué costo se sirve (ADR-0028).
 */
const PREFIXED_MODEL_UPSTREAMS: ReadonlySet<string> = new Set(["inferhub"]);
const PREFIXED_MODEL_PATTERN = /^[a-z0-9][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

const BPS = BigInt(10_000);

export type CatalogValidationInput = {
  models: CatalogEntry[];
  upstreams: UpstreamDefinition[];
  environment: UpstreamEnvironment;
};

export type CatalogValidationResult = { errors: string[]; warnings: string[] };

/**
 * Valida catalog/models.ts y catalog/upstreams.ts antes de sincronizar (docs/06 › Fuente de verdad).
 * Los mensajes van en inglés: los lee quien corre `pnpm catalog:sync`.
 *
 * Las reglas del archivo (esquema, IDs, referencias, alias, el mock fuera de producción) aplican en
 * cualquier entorno. El margen depende del entorno: solo cuenta en los mapeos habilitados de los
 * upstreams que existen en él, así que el mock no se revisa en producción. Fuera de producción, un
 * margen insuficiente es warning, para poder probar mapeos sin costo confirmado; en producción, error.
 */
export function validateCatalog({ models, upstreams, environment }: CatalogValidationInput): CatalogValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  models.forEach((entry, index) => {
    errors.push(...schemaErrors(catalogEntrySchema, entry, `model ${entry.id || `#${index}`}`));
  });
  upstreams.forEach((upstream, index) => {
    errors.push(...schemaErrors(upstreamDefinitionSchema, upstream, `upstream ${upstream.id || `#${index}`}`));
  });

  const modelsById = new Map<string, CatalogEntry>();
  for (const entry of models) {
    const where = `model ${entry.id}`;
    if (modelsById.has(entry.id)) errors.push(`${where}: duplicate id`);
    else modelsById.set(entry.id, entry);

    if (!entry.id.startsWith(`${entry.author}/`)) {
      errors.push(`${where}: author "${entry.author}" does not match the id prefix`);
    }
    if (new Set(entry.tags).size !== entry.tags.length) errors.push(`${where}: repeated tag`);
    for (const tag of COMPUTED_TAGS) {
      if (entry.tags.includes(tag)) errors.push(`${where}: tag "${tag}" is computed at sync time, remove it from tags`);
    }
    if (entry.status === "deprecated" && !entry.retiresOn) errors.push(`${where}: a deprecated model needs retiresOn`);
    // Sin `es` se muestra `en`: advierte, no falla (docs/10 › Contenido del catálogo).
    if (!entry.description.es) warnings.push(`${where}: missing "es" description, "en" will be shown`);
  }

  const upstreamIds = new Set<string>();
  for (const upstream of upstreams) {
    const where = `upstream ${upstream.id}`;
    if (upstreamIds.has(upstream.id)) errors.push(`${where}: duplicate id`);
    upstreamIds.add(upstream.id);

    if (upstream.environments.includes("production")) {
      if (upstream.apiKeyEnv === null) errors.push(`${where}: available in production but has no apiKeyEnv`);
      if (upstream.id === MOCK_UPSTREAM_ID) errors.push(`${where}: the mock upstream must never be available in production`);
    }

    const checksMargin = upstream.environments.includes(environment);
    const marginIssues = environment === "production" ? errors : warnings;
    const mapped = new Set<string>();

    for (const mapping of upstream.models) {
      const at = `${where} → ${mapping.model}`;
      if (mapped.has(mapping.model)) errors.push(`${at}: model is mapped more than once`);
      mapped.add(mapping.model);

      if (PREFIXED_MODEL_UPSTREAMS.has(upstream.id) && !PREFIXED_MODEL_PATTERN.test(mapping.upstreamModel)) {
        errors.push(`${at}: upstreamModel "${mapping.upstreamModel}" must be "prefix/model", never an alias`);
      }

      const entry = modelsById.get(mapping.model);
      if (!entry) {
        errors.push(`${at}: unknown model`);
        continue;
      }
      if (checksMargin && mapping.enabled !== false) {
        marginIssues.push(...marginShortfalls(entry, mapping).map((issue) => `${at}: ${issue}`));
      }
    }
  }

  return { errors, warnings };
}

function schemaErrors(schema: z.ZodType, value: unknown, label: string): string[] {
  const result = schema.safeParse(value);
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return `${label}: ${path ? `${path}: ` : ""}${issue.message}`;
  });
}

/**
 * Precio cheaptokens.wtf ≥ costo × (1 + MIN_MARGIN), por separado en input y output (ADR-0010).
 * Se compara en enteros (`precio × 10000 ≥ costo × (10000 + bps)`) para no redondear el umbral.
 */
function marginShortfalls(entry: CatalogEntry, mapping: UpstreamModelMapping): string[] {
  const sides = [
    { side: "input", official: entry.officialInput, cost: mapping.costInputPer1M },
    { side: "output", official: entry.officialOutput, cost: mapping.costOutputPer1M },
  ];
  const issues: string[] = [];
  for (const { side, official, cost } of sides) {
    // Un monto que no es entero ya lo reportó el esquema, y BigInt() lo rechazaría.
    if (!Number.isSafeInteger(official) || !Number.isSafeInteger(cost)) continue;
    const price = BigInt(applyDiscount(official, entry.discountBps));
    const floor = BigInt(cost) * (BPS + BigInt(MIN_MARGIN_BPS));
    if (price * BPS >= floor) continue;
    const minimum = (floor + BPS - BigInt(1)) / BPS;
    issues.push(
      `${side} price ${price} µUSD/1M is below cost ${cost} + ${MIN_MARGIN_BPS / 100}% margin (needs ≥ ${minimum})`,
    );
  }
  return issues;
}
