import type { ModelTag } from "@/lib/catalog/tags";

/**
 * Lo que la lista del proveedor no dice de un modelo (ADR-0069). Vive en el repo y se aplica al leer el
 * catálogo, encima de lo que haya en la base: así un cambio aquí llega al sitio y a `GET /v1/models` con
 * el siguiente deploy, sin sincronizar, y una actualización en vivo no lo pisa.
 */

/**
 * El orden de «Recomendados», el orden por defecto del catálogo: los modelos que más gente viene a buscar,
 * uno o dos por laboratorio. Los que no están aquí van después, por descuento. Un ID que salga del
 * catálogo simplemente no se muestra.
 */
export const FEATURED_MODELS = [
  "anthropic/claude-sonnet-5.5",
  "openai/gpt-6.1-sol",
  "google/gemini-4-carbon",
  "deepseek/deepseek-v4.1-flash",
  "anthropic/claude-opus-5.5",
  "moonshotai/kimi-k3",
  "z-ai/glm-5.3",
  "openai/gpt-5.3-codex",
  "qwen/qwen4-max",
  "x-ai/grok-4.7",
  "minimax/minimax-m3.1-flash",
  "anthropic/claude-fable-5.2",
] as const;

/**
 * Tags curados por modelo (docs/06 › Tags). `add` suma y `remove` quita, sobre lo que traiga la base.
 * Cada entrada lleva las fuentes que la respaldan: sin fuente, no se agrega. `open-weights` solo va donde
 * el autor publicó los pesos del modelo que se sirve; una variante de API («highspeed», «-256k») cuenta si
 * el autor dice que es el mismo modelo.
 *
 * Revisado el 2026-11-22 contra la documentación de cada autor y Hugging Face.
 */
export type TagCuration = { add?: ModelTag[]; remove?: ModelTag[]; sources: string[] };

const HF = "https://huggingface.co/";
/** Dónde cada familia documenta function calling y sus capacidades. */
const DOCS = {
  claude: "https://platform.claude.com/docs/en/about-claude/models/overview",
  openai: "https://developers.openai.com/api/docs/models",
  gemini: "https://aistudio.google.com/docs/models",
  grok: "https://docs.x.ai/docs/models",
  grok47: "https://x.ai/news/grok-4-7",
  deepseek: "https://api-docs.deepseek.com/quick_start/pricing",
  deepseekV32: "https://api-docs.deepseek.com/news/news251201",
  deepseekV4: "https://api-docs.deepseek.com/news/news260424",
  muse: "https://openrouter.ai/meta/muse-spark-1.3",
  minimax: "https://platform.minimax.io/docs/guides/text-generation",
  qwen: "https://help.aliyun.com/en/model-studio/",
  kimiHighspeed: "https://help.aliyun.com/en/model-studio/kimi-k2-7-code-highspeed",
  zai: "https://docs.z.ai/guides/llm/glm-5.3",
  zaiFlash: "https://docs.z.ai/guides/vlm/glm-5.3-flash",
  zai51: "https://docs.z.ai/guides/llm/glm-5.1",
  glm46v: "https://docs.z.ai/guides/vlm/glm-4.6v",
} as const;

export const CURATED_TAGS: Record<string, TagCuration> = {
  // Anthropic: todos llaman herramientas; Fable y los 4.6 piensan aunque el proveedor no lo reporte.
  "anthropic/claude-fable-5.1": { add: ["reasoning", "tools"], sources: [DOCS.claude] },
  "anthropic/claude-fable-5.2": { add: ["reasoning", "tools"], sources: [DOCS.claude] },
  "anthropic/claude-haiku-5.5": { add: ["fast", "tools"], sources: [DOCS.claude] },
  "anthropic/claude-opus-4.5": { add: ["tools"], sources: [DOCS.claude] },
  "anthropic/claude-opus-4.6": { add: ["reasoning", "tools"], sources: [DOCS.claude] },
  "anthropic/claude-opus-4.7": { add: ["tools"], sources: [DOCS.claude] },
  "anthropic/claude-opus-4.8": { add: ["tools"], sources: [DOCS.claude] },
  "anthropic/claude-opus-5": { add: ["tools"], sources: [DOCS.claude] },
  "anthropic/claude-opus-5.5": { add: ["tools"], sources: [DOCS.claude] },
  "anthropic/claude-sonnet-4.6": { add: ["reasoning", "tools"], sources: [DOCS.claude] },
  "anthropic/claude-sonnet-5": { add: ["tools"], sources: [DOCS.claude] },
  "anthropic/claude-sonnet-5.5": { add: ["tools"], sources: [DOCS.claude] },
  // Retirado en el repo, pero todavía activo en la base de producción (2026-11-22).
  "anthropic/claude-fable-5": { add: ["tools"], sources: [DOCS.claude] },

  // DeepSeek publica los pesos de cada versión. V4 Flash y V4 Pro son de solo texto: la visión llegó con V4.1.
  "deepseek/deepseek-v3.2": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}deepseek-ai/DeepSeek-V3.2`, DOCS.deepseekV32, DOCS.deepseek] },
  "deepseek/deepseek-v4-flash": { add: ["fast", "reasoning", "tools", "open-weights"], remove: ["vision"], sources: [`${HF}deepseek-ai/DeepSeek-V4-Flash`, DOCS.deepseekV4, DOCS.deepseek] },
  "deepseek/deepseek-v4-flash-0731": { add: ["fast", "reasoning", "tools", "open-weights"], sources: [`${HF}deepseek-ai/DeepSeek-V4-Flash-0731`, DOCS.deepseek] },
  "deepseek/deepseek-v4-pro": { add: ["reasoning", "tools", "open-weights"], remove: ["vision"], sources: [`${HF}deepseek-ai/DeepSeek-V4-Pro`, DOCS.deepseek] },
  "deepseek/deepseek-v4-pro-0813": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}deepseek-ai/DeepSeek-V4-Pro-0813`, DOCS.deepseek] },
  "deepseek/deepseek-v4.1-flash": { add: ["open-weights"], sources: [`${HF}deepseek-ai/DeepSeek-V4.1-Flash`] },
  "deepseek/deepseek-v4.1-flash-1017": { add: ["fast", "tools", "open-weights"], sources: [`${HF}deepseek-ai/DeepSeek-V4.1-Flash-1017`, DOCS.deepseek] },
  // Un nivel de velocidad de los proveedores sobre los mismos pesos de V4.1 Flash.
  "deepseek/deepseek-v4.1-flash-fast": { add: ["fast", "vision", "tools", "open-weights"], sources: [`${HF}deepseek-ai/DeepSeek-V4.1-Flash`, DOCS.deepseek] },
  // «SG» no aparece en ninguna fuente: solo lo que vale para toda la familia.
  "deepseek/deepseek-v4.1-flash-sg": { add: ["tools"], sources: [DOCS.deepseek] },

  "google/gemini-3.8-flash": { add: ["fast", "tools"], sources: [`${DOCS.gemini}/gemini-3.8-flash`] },
  "google/gemini-4-argon-contributor": { add: ["tools"], sources: [DOCS.gemini] },
  "google/gemini-4-carbon": { add: ["tools"], sources: [DOCS.gemini] },
  "google/gemini-4-neon": { add: ["tools"], sources: [DOCS.gemini] },
  // Retirados en el repo, pero todavía activos en la base de producción (2026-11-22).
  "google/gemini-4-argon": { add: ["tools"], sources: [DOCS.gemini] },
  "google/gemini-4-hydrogen": { add: ["tools"], sources: [DOCS.gemini] },

  // Meta: los Muse son de API, salvo Muse Spark Open (licencia Muse, con aprobación de acceso).
  "meta-llama/muse-ember-1.0": { add: ["fast", "tools"], sources: [DOCS.muse, "https://vercel.com/ai-gateway/models/muse-ember"] },
  "meta-llama/muse-spark-1.1": { add: ["tools"], sources: [DOCS.muse] },
  "meta-llama/muse-spark-1.2": { add: ["tools"], sources: [DOCS.muse] },
  "meta-llama/muse-spark-1.2-contributor": { add: ["tools"], sources: [DOCS.muse] },
  "meta-llama/muse-spark-1.3": { add: ["tools"], sources: [DOCS.muse] },
  "meta-llama/muse-spark-1.3-contributor": { add: ["tools"], sources: [DOCS.muse] },
  "meta-llama/muse-spark-open": { add: ["vision", "reasoning", "coding", "tools", "open-weights"], sources: [`${HF}meta-models/Muse-Spark-Open-816B-A42B`] },
  "meta-llama/muse-wonder-1.0": { add: ["tools"], sources: [DOCS.muse] },

  // MiniMax publica los pesos; «highspeed» es el mismo modelo, más rápido.
  "minimax/minimax-m2.1": { add: ["reasoning", "coding", "tools", "open-weights"], sources: [`${HF}MiniMaxAI/MiniMax-M2.1`] },
  "minimax/minimax-m2.5": { add: ["reasoning", "coding", "tools", "open-weights"], sources: [`${HF}MiniMaxAI/MiniMax-M2.5`] },
  "minimax/minimax-m2.5-highspeed": { add: ["fast", "reasoning", "coding", "tools", "open-weights"], sources: [`${HF}MiniMaxAI/MiniMax-M2.5`] },
  "minimax/minimax-m2.7": { add: ["reasoning", "coding", "tools", "open-weights"], sources: [`${HF}MiniMaxAI/MiniMax-M2.7`] },
  "minimax/minimax-m2.7-highspeed": { add: ["fast", "reasoning", "coding", "tools", "open-weights"], sources: [`${HF}MiniMaxAI/MiniMax-M2.7`, "https://www.minimax.io/models/text/m27"] },
  "minimax/minimax-m3": { add: ["reasoning", "coding", "tools", "open-weights"], sources: [`${HF}MiniMaxAI/MiniMax-M3`] },
  "minimax/minimax-m3.1-flash": { add: ["fast", "coding", "tools", "open-weights"], sources: [`${HF}MiniMaxAI/MiniMax-M3.1-Flash`, DOCS.minimax] },
  // El checkpoint de la preview nunca se publicó.
  "minimax/minimax-m3.1-flash-preview": { add: ["fast", "coding", "tools"], sources: [DOCS.minimax] },

  "mistralai/mistral-large-4": { add: ["vision", "tools", "open-weights"], sources: [`${HF}mistralai/Mistral-Large-4-1T-A52B`] },
  "mistralai/mistral-medium-3.5": { add: ["vision", "coding", "tools", "open-weights"], sources: [`${HF}mistralai/Mistral-Medium-3.5-128B`] },

  // Moonshot publica los pesos de Kimi; las previews no. «highspeed» y «-256k» son el mismo modelo.
  "moonshotai/kimi-for-coding-highspeed-k2.7-code": { add: ["fast", "reasoning", "tools", "open-weights"], sources: [`${HF}moonshotai/Kimi-K2.7-Code`, DOCS.kimiHighspeed] },
  "moonshotai/kimi-for-coding-k2.8-preview": { add: ["tools"], sources: ["https://platform.moonshot.ai/docs"] },
  "moonshotai/kimi-k2.5": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}moonshotai/Kimi-K2.5`] },
  "moonshotai/kimi-k2.6": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}moonshotai/Kimi-K2.6`] },
  "moonshotai/kimi-k2.7-code": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}moonshotai/Kimi-K2.7-Code`] },
  "moonshotai/kimi-k2.7-code-highspeed": { add: ["fast", "vision", "reasoning", "tools", "open-weights"], sources: [`${HF}moonshotai/Kimi-K2.7-Code`, DOCS.kimiHighspeed] },
  "moonshotai/kimi-k2.8-preview": { add: ["tools"], sources: ["https://platform.moonshot.ai/docs"] },
  "moonshotai/kimi-k3": { add: ["tools", "open-weights"], sources: [`${HF}moonshotai/Kimi-K3`] },
  "moonshotai/kimi-k3-256k": { add: ["tools", "open-weights"], sources: [`${HF}moonshotai/Kimi-K3`] },
  "moonshotai/kimi-k3.1-pro": { add: ["tools", "open-weights"], sources: [`${HF}moonshotai/Kimi-K3.1-Pro`] },
  // El nombre «highspeed» no aparece en ninguna fuente: sin pesos abiertos hasta confirmarlo.
  "moonshotai/kimi-k3.1-pro-highspeed": { add: ["fast", "tools"], sources: [`${HF}moonshotai/Kimi-K3.1-Pro`] },

  "openai/gpt-5.3-codex": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-5.4": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-5.4-mini": { add: ["fast", "tools"], sources: [DOCS.openai] },
  "openai/gpt-5.5": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-5.6-luna": { add: ["fast", "tools"], sources: [DOCS.openai] },
  "openai/gpt-5.6-sol": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-5.6-terra": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-6-astra": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-6-luna": { add: ["fast", "tools"], sources: [DOCS.openai] },
  "openai/gpt-6-sol": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-6.1-sol": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-6.1-terra": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-6.2-astra": { add: ["tools"], sources: [DOCS.openai] },
  "openai/gpt-6.2-sol": { add: ["tools"], sources: [DOCS.openai] },

  // Qwen: los «Max» y «Plus» son cerrados; Qwen3.6 Flash es el Qwen3.6-35B-A3B abierto servido por API.
  "qwen/qwen3-coder-next": { add: ["tools", "open-weights"], sources: [`${HF}Qwen/Qwen3-Coder-Next`] },
  "qwen/qwen3.6-flash": { add: ["fast", "vision", "reasoning", "tools", "open-weights"], sources: [`${HF}Qwen/Qwen3.6-35B-A3B`, `${DOCS.qwen}qwen3-6-flash`] },
  "qwen/qwen3.7-max": { add: ["reasoning", "coding", "tools"], sources: [`${DOCS.qwen}qwen3-7-max`] },
  "qwen/qwen3.7-plus": { add: ["reasoning", "tools"], sources: [`${DOCS.qwen}qwen3-7-plus`] },
  // Su ficha no menciona function calling: sin `tools` hasta confirmarlo.
  "qwen/qwen3.8-2.4t-a95b": { add: ["reasoning", "open-weights"], sources: [`${HF}Qwen/Qwen3.8-2.4T-A95B`] },
  "qwen/qwen3.8-27b": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}Qwen/Qwen3.8-27B`, `${DOCS.qwen}qwen3-8-27b`] },
  // Basados en modelos abiertos, pero el servido agrega funciones que los pesos no tienen: no cuentan como abiertos.
  "qwen/qwen3.8-flash": { add: ["reasoning", "tools"], sources: [`${DOCS.qwen}qwen3-8-flash`] },
  "qwen/qwen3.8-max": { add: ["reasoning", "coding", "tools"], sources: [`${DOCS.qwen}qwen3-8-max`] },
  "qwen/qwen3.8-max-0902": { add: ["reasoning", "coding", "tools"], sources: [`${DOCS.qwen}qwen3-8-max`] },
  "qwen/qwen3.8-omni-flash": { add: ["reasoning", "tools"], sources: [`${DOCS.qwen}qwen3-8-omni-flash`] },
  "qwen/qwen4-max": { add: ["coding", "tools"], sources: [`${DOCS.qwen}qwen4-max`] },
  "qwen/qwen4-max-preview": { add: ["coding", "tools"], sources: [`${DOCS.qwen}qwen4-max`] },

  "x-ai/grok-4.5": { add: ["tools"], sources: [DOCS.grok] },
  "x-ai/grok-4.6": { add: ["vision", "reasoning", "tools"], sources: [`${DOCS.grok}/grok-4.6`] },
  "x-ai/grok-4.7": { add: ["vision", "reasoning", "coding", "tools"], sources: [`${DOCS.grok}/grok-4.7`, DOCS.grok47] },
  "x-ai/grok-4.7-fast": { add: ["fast", "vision", "tools"], sources: [DOCS.grok47] },

  "xiaomi/mimo-v2.5": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}XiaomiMiMo/MiMo-V2.5`] },
  "xiaomi/mimo-v2.5-pro": { add: ["reasoning", "coding", "tools", "open-weights"], sources: [`${HF}XiaomiMiMo/MiMo-V2.5-Pro`] },
  "xiaomi/mimo-v2.6-flash": { add: ["fast", "reasoning", "tools", "open-weights"], sources: [`${HF}XiaomiMiMo/MiMo-V2.6-Flash-RL`] },
  "xiaomi/mimo-v2.6-pro": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}XiaomiMiMo/MiMo-V2.6-Pro-RL`] },

  // Z.ai publica los pesos de GLM. GLM-5.1 y GLM-5.3 son de solo texto; la visión de la serie está en 5.3 Flash.
  "z-ai/glm-4.6v-vision": { add: ["reasoning", "tools", "open-weights"], sources: [`${HF}zai-org/GLM-4.6V`, DOCS.glm46v] },
  "z-ai/glm-5": { add: ["reasoning", "coding", "tools", "open-weights"], sources: [`${HF}zai-org/GLM-5`] },
  "z-ai/glm-5.1": { add: ["reasoning", "coding", "tools", "open-weights"], remove: ["vision"], sources: [`${HF}zai-org/GLM-5.1`, DOCS.zai51] },
  "z-ai/glm-5.2": { add: ["coding", "tools", "open-weights"], sources: [`${HF}zai-org/GLM-5.2`] },
  "z-ai/glm-5.3": { add: ["coding", "tools", "open-weights"], remove: ["vision"], sources: [`${HF}zai-org/GLM-5.3`, DOCS.zai] },
  "z-ai/glm-5.3-flash": { add: ["coding", "tools", "open-weights"], sources: [`${HF}zai-org/GLM-5.3-Flash`, DOCS.zaiFlash] },
  // Un nivel más rápido de 5.3 Flash; Z.ai no dice que los pesos sean los mismos.
  "z-ai/glm-5.3-flashx": { add: ["fast", "vision", "tools"], sources: [DOCS.zaiFlash] },
};
