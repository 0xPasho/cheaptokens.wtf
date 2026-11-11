import { applyDiscount } from "@/lib/catalog/pricing";
import type { ModelTag } from "@/lib/catalog/tags";

/** La página es interna y está en español. Los formatos se comparan en `en` y `es` en Fundamentos. */
export const LOCALE = "es";

/** Hasta que existan los diccionarios (docs/10-i18n.md), las etiquetas de ejemplo viven aquí. */
export const TAG_LABELS: Record<ModelTag, string> = {
  fast: "Rápido",
  reasoning: "Razonamiento",
  coding: "Código",
  vision: "Visión",
  tools: "Herramientas",
  "open-weights": "Pesos abiertos",
  "long-context": "Contexto largo",
  cheap: "Económico",
};

const usd = (dollars: number) => Math.round(dollars * 1_000_000);

type SampleModel = {
  id: string;
  name: string;
  contextLength: number;
  officialInput: number;
  officialOutput: number;
  discountedInput: number;
  discountedOutput: number;
  discountBps: number;
  tags: ModelTag[];
  retiresOn?: string;
};

function model(
  data: Omit<SampleModel, "discountedInput" | "discountedOutput">,
): SampleModel {
  return {
    ...data,
    discountedInput: applyDiscount(data.officialInput, data.discountBps),
    discountedOutput: applyDiscount(data.officialOutput, data.discountBps),
  };
}

/** Datos de ejemplo para mostrar los patrones. No son el catálogo real. */
export const SAMPLE_MODELS: SampleModel[] = [
  model({
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    contextLength: 200_000,
    officialInput: usd(1),
    officialOutput: usd(5),
    discountBps: 9000,
    tags: ["fast", "vision", "tools", "long-context"],
  }),
  model({
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    contextLength: 200_000,
    officialInput: usd(3),
    officialOutput: usd(15),
    discountBps: 9000,
    tags: ["reasoning", "coding", "vision", "tools", "long-context"],
  }),
  model({
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    contextLength: 1_048_576,
    officialInput: usd(0.3),
    officialOutput: usd(2.5),
    discountBps: 8500,
    tags: ["fast", "vision", "tools", "long-context", "cheap"],
  }),
  model({
    id: "deepseek/deepseek-v3.1",
    name: "DeepSeek V3.1",
    contextLength: 128_000,
    officialInput: usd(0.56),
    officialOutput: usd(1.68),
    discountBps: 6000,
    tags: ["open-weights", "coding", "tools", "cheap"],
    retiresOn: "2027-01-15",
  }),
];

export const SAMPLE_API_KEY = "wtf_Ab3xR9t2Lm8Qp4Vw7Zc1Ny6Hs0Kd5Fg9kQz";
/** Base URL de la API (ADR-0026). */
export const SAMPLE_BASE_URL = "https://api.cheaptokens.wtf/v1";
