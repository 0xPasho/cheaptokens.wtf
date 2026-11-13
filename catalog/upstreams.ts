import type { UpstreamDefinition } from "@/lib/catalog/types";

/**
 * Upstreams y mapeos modelo → upstream (docs/07 › Configuración). Fuente de verdad que después
 * sincroniza `pnpm catalog:sync`, igual que catalog/models.ts. Las reglas las valida
 * `validateCatalog()` en src/lib/catalog/validate.ts.
 *
 * Las rutas y sus topes se importan de la lista oficial mediante `pnpm catalog:refresh`.
 * El mock queda detrás únicamente para desarrollo y pruebas. Ver ADR-0046.
 */

import { INFERHUB_MODELS } from "./generated/inferhub-mappings";

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
    // `upstreamModel` sin el prefijo `mock/`: así el escenario lo elige cada prueba con `x_mock` en el body.
    // Un `mock/<escenario>` aquí tendría prioridad y fijaría el mismo escenario para todo request.
    models: INFERHUB_MODELS.map((mapping) => ({
      model: mapping.model,
      upstreamModel: mapping.model,
      costInputPer1M: Math.floor(mapping.costInputPer1M / 2),
      costOutputPer1M: Math.floor(mapping.costOutputPer1M / 2),
      priority: 2,
    })),
  },
];
