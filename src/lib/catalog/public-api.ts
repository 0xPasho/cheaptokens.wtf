import { getCatalog } from "./queries";
import type { CatalogEntry } from "./types";

// El catálogo del repo no tiene fecha de alta; esta época permanece estable entre builds.
const MODEL_CREATED = 1_760_000_000;

export function priceInUsd(microUsd: bigint): string {
  const digits = microUsd.toString().padStart(7, "0");
  const fraction = digits.slice(-6).replace(/0+$/, "").padEnd(2, "0");
  return `${digits.slice(0, -6)}.${fraction}`;
}

export function buildModelsResponse(entries?: CatalogEntry[]) {
  return {
    object: "list",
    data: getCatalog(entries).map((model) => ({
      id: model.id, object: "model", created: MODEL_CREATED, owned_by: model.author,
      name: model.name, context_length: model.contextLength, tags: model.allTags,
      // Los `reasoning_effort` que acepta el modelo; sin el campo, no se sabe (ADR-0076).
      ...(model.reasoningLevels !== undefined ? { reasoning_levels: model.reasoningLevels } : {}),
      pricing: {
        currency: "USD", unit: "1M_tokens",
        input: priceInUsd(BigInt(model.discountedInput)), output: priceInUsd(BigInt(model.discountedOutput)),
        official_input: priceInUsd(BigInt(model.officialInput)), official_output: priceInUsd(BigInt(model.officialOutput)),
        discount_percent: model.discountBps / 100,
      },
      status: model.status,
    })),
  };
}

/** Un modelo en el formato de `GET /anthropic/v1/models` (ADR-0078). */
function anthropicModel(model: { id: string; name: string }) {
  return { type: "model", id: model.id, display_name: model.name, created_at: new Date(MODEL_CREATED * 1000).toISOString() };
}

/**
 * `GET /anthropic/v1/models`: los mismos modelos que `/v1/models`, con la forma de Anthropic. Los IDs son los nuestros
 * (`anthropic/claude-sonnet-5.5`); el gateway también acepta los de Anthropic (`claude-sonnet-5-5`) al pedir un modelo.
 */
export function buildAnthropicModelsResponse(entries?: CatalogEntry[]) {
  const data = getCatalog(entries).map(anthropicModel);
  return { data, has_more: false, first_id: data[0]?.id ?? null, last_id: data.at(-1)?.id ?? null };
}

/** Un modelo por cualquiera de sus nombres, o null. `candidates` sale de `modelCandidates` del gateway. */
export function findAnthropicModel(candidates: readonly string[], entries?: CatalogEntry[]) {
  const models = getCatalog(entries);
  for (const candidate of candidates) {
    const model = models.find((item) => item.id === candidate);
    if (model) return anthropicModel(model);
  }
  return null;
}
