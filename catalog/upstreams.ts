import type { UpstreamDefinition, UpstreamModelMapping } from "@/lib/catalog/types";

/**
 * Upstreams y mapeos modelo → upstream (docs/07 › Configuración). Fuente de verdad que después
 * sincroniza `pnpm catalog:sync`, igual que catalog/models.ts. Las reglas las valida
 * `validateCatalog()` en src/lib/catalog/validate.ts.
 *
 * Catálogo de pruebas del gateway (ADR-0028, ADR-0029): InferHub es el único upstream real, y el
 * mock va detrás para probar el fallback. Antes de sincronizar, se revisa en `GET /v1/models` de
 * InferHub el ID y el ask de cada modelo: los asks se mueven.
 */

const usd = (dollars: number) => Math.round(dollars * 1_000_000);

/**
 * El costo es el ask que se acepta, y viaja como tope de precio en cada request: InferHub nunca
 * cobra más (ADR-0028). En Haiku y Qwen es el ask medido; en DeepSeek y GLM, su segundo ask.
 */
const INFERHUB_MODELS: UpstreamModelMapping[] = [
  {
    model: "anthropic/claude-haiku-4.5",
    upstreamModel: "ant/claude-haiku-4-5",
    costInputPer1M: usd(0.199),
    costOutputPer1M: usd(0.995),
    priority: 1,
  },
  {
    model: "qwen/qwen3.8-flash",
    upstreamModel: "alicn/qwen3.8-flash",
    costInputPer1M: usd(0.01755),
    costOutputPer1M: usd(0.05499),
    priority: 1,
  },
  {
    model: "deepseek/deepseek-v4.1-flash",
    upstreamModel: "alicn/deepseek-v4.1-flash",
    costInputPer1M: usd(0.01755),
    costOutputPer1M: usd(0.0702),
    priority: 1,
  },
  {
    model: "z-ai/glm-5.3-flash",
    upstreamModel: "zai/glm-5.3-flash",
    costInputPer1M: usd(0.00645),
    costOutputPer1M: usd(0.0215),
    priority: 1,
  },
];

export const UPSTREAMS: UpstreamDefinition[] = [
  {
    id: "inferhub",
    name: "InferHub",
    baseUrl: "https://api.inferhub.dev/v1",
    apiKeyEnv: "UPSTREAM_INFERHUB_API_KEY",
    sendsPriceCap: true,
    environments: ["development", "preview", "production"],
    models: INFERHUB_MODELS,
  },
  {
    // El upstream simulado (scripts/mock-upstream.ts). Nunca existe en producción (docs/07 › Tests automáticos).
    id: "mock",
    name: "Mock upstream",
    baseUrl: "http://127.0.0.1:4010/v1",
    apiKeyEnv: null,
    sendsPriceCap: true,
    environments: ["development", "preview"],
    // Los mismos modelos que InferHub, detrás de él. No cobra de verdad: el costo existe para probar
    // el tope de precio y el registro del costo, y va a la mitad del de InferHub para que siempre deje margen.
    models: INFERHUB_MODELS.map((mapping) => ({
      model: mapping.model,
      upstreamModel: "mock/ok",
      costInputPer1M: Math.floor(mapping.costInputPer1M / 2),
      costOutputPer1M: Math.floor(mapping.costOutputPer1M / 2),
      priority: 2,
    })),
  },
];
