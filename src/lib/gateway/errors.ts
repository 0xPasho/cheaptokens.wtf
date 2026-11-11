import { GATEWAY_ERROR_STATUS } from "./types";
import type { GatewayErrorBody, GatewayErrorCode, ResponseContext } from "./types";

const DEFAULT_MESSAGES: Record<GatewayErrorCode, string> = {
  invalid_request: "The request is invalid.",
  invalid_api_key: "The API key is missing or invalid.",
  insufficient_credits: "Insufficient credits. Top up at https://cheaptokens.wtf/dashboard/credits",
  key_limit_exceeded: "The API key has reached its spending limit.",
  account_suspended: "The account is suspended.",
  model_not_found: "The requested model was not found.",
  model_retired: "The requested model has been retired.",
  request_too_large: "The request body is too large.",
  rate_limit_exceeded: "The request rate limit has been exceeded.",
  upstream_error: "The model failed while processing the request.",
  no_upstream_available: "The requested model is temporarily unavailable.",
  upstream_timeout: "The model timed out while processing the request.",
};

const PROVIDER_NAMES = [
  "inferhub", "openrouter", "qwencloud", "qwen", "alibaba", "aliyun", "dashscope",
  "anthropic", "openai", "google", "vertex", "bedrock", "azure", "deepseek", "zhipu",
  "moonshot", "minimax", "kiro", "codex", "cohere", "mistral", "groq",
  "fireworks", "replicate", "perplexity", "huggingface", "siliconflow", "chutes",
  "cerebras", "nvidia", "baidu", "tencent", "volcengine", "bytedance", "sambanova",
  "alicn", "litellm",
];
const COMMON_WORD_PROVIDER_NAMES = new Set(["cohere", "replicate", "perplexity", "vertex", "bedrock", "fireworks", "chutes"]);
const NAME_SEPARATOR = "[\\s_.\\p{Pd}·]*";
function nameLetters(name: string): string[] {
  return [...name].map((letter) => `[${letter}${letter.toUpperCase()}]`);
}
// Solo las minúsculas cierran palabras: sufijos CamelCase e IDs también revelan marcas.
const PROVIDER_PATTERN = new RegExp(`(?<![a-z])(?:${[
  ...PROVIDER_NAMES.map((name) => nameLetters(name).join(COMMON_WORD_PROVIDER_NAMES.has(name) ? "" : NAME_SEPARATOR)),
  `${nameLetters("together").join("")}${NAME_SEPARATOR}(?:${nameLetters("ai").join("")}|${nameLetters("computer").join("")})`,
].join("|")})(?![a-z])`, "u");
const GATEWAY_MESSAGES = new Set(Object.values(DEFAULT_MESSAGES));
const GENERIC_PARAMETER_MESSAGE = "The model rejected the request parameters.";

function isSafeText(message: string): boolean {
  if (message.trim() === "" || message.length > 300 || /[\p{Cc}\p{Cf}]/u.test(message)) return false;
  const normalized = message.normalize("NFKC");
  if (PROVIDER_PATTERN.test(normalized)) return false;
  if (/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/i.test(normalized)) return false;
  if (/(?:0x)?[\da-f]{16,}/i.test(normalized)) return false;
  const tokens = normalized.match(/[a-z\d_-]{8,}/gi) ?? [];
  if (tokens.some((token) => /[a-z]/i.test(token) && /\d/.test(token))) return false;
  return !/request[_ -]?id/i.test(normalized);
}

function isSafeMessage(message: string): boolean {
  if (!isSafeText(message)) return false;
  const normalized = message.normalize("NFKC");
  // Un host con puntos necesita letras; los decimales sí describen parámetros válidos.
  if (/(?:[a-z][a-z\d+.-]*:\/\/|www\.|\/\/[a-z\d]|\b(?=[a-z\d.-]*[a-z])[a-z\d-]+(?:\.[a-z\d-]+)+\b)/i.test(normalized)) return false;
  if (/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/.test(normalized)) return false;
  if (/\b[a-z][\w-]*:\d{2,5}\b/i.test(normalized)) return false;
  if (/(?:[a-f\d]+:[a-f\d:]*:|::[a-f\d]+)/i.test(normalized)) return false;
  for (const [identifier] of normalized.matchAll(/\b[\w.-]+\/[\w.:-]+/g)) {
    if (!/^(?:image|audio|video|text|application)\/[\w.+-]+$/i.test(identifier)) return false;
  }
  return true;
}

function upstreamError(body: unknown): Record<string, unknown> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body) || !("error" in body)) return null;
  const error = body.error;
  return typeof error === "object" && error !== null && !Array.isArray(error)
    ? error as Record<string, unknown>
    : null;
}

export function errorBody(code: GatewayErrorCode, message?: string): GatewayErrorBody {
  return {
    error: {
      // Los mensajes propios ya son públicos; uno incluye la URL para recargar saldo.
      message: message !== undefined && (GATEWAY_MESSAGES.has(message) || isSafeMessage(message)) ? message : DEFAULT_MESSAGES[code],
      type: code,
      code,
    },
  };
}

export function errorResponse(
  code: GatewayErrorCode,
  options: { message?: string; requestId?: string; retryAfterSeconds?: number } = {},
): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (options.requestId !== undefined) headers.set("x-request-id", options.requestId);
  if (options.retryAfterSeconds !== undefined) {
    const seconds = Number.isFinite(options.retryAfterSeconds) ? Math.max(1, Math.ceil(options.retryAfterSeconds)) : 1;
    headers.set("retry-after", String(seconds));
  }
  return new Response(JSON.stringify(errorBody(code, options.message)), {
    status: GATEWAY_ERROR_STATUS[code],
    headers,
  });
}

export function streamErrorChunk(ctx: ResponseContext): Record<string, unknown> {
  return {
    id: ctx.id,
    object: "chat.completion.chunk",
    created: ctx.created,
    model: ctx.model,
    ...errorBody("upstream_error", "The model failed while generating the response."),
    choices: [{ index: 0, delta: {}, finish_reason: "error" }],
  };
}

export function upstreamErrorCode(body: unknown): string | null {
  const error = upstreamError(body);
  if (typeof error?.code === "string" && error.code !== "") return error.code;
  if (typeof error?.code === "number" && Number.isFinite(error.code)) return String(error.code);
  return typeof error?.type === "string" && error.type !== "" ? error.type : null;
}

export function sanitizeUpstreamClientMessage(body: unknown): string {
  const error = upstreamError(body);
  const message = typeof error?.message === "string" && isSafeMessage(error.message)
    ? error.message
    : GENERIC_PARAMETER_MESSAGE;
  const param = error?.param;
  // El parámetro también es texto ajeno: solo se admite una ruta de campos segura.
  if (typeof param !== "string" || !/^[A-Za-z_]\w*(\[\d+\]|\.\w+)*$/.test(param) || !isSafeText(param)) return message;
  const suffix = ` (param: ${param})`;
  if ((message + suffix).length <= 300) return message + suffix;
  return (GENERIC_PARAMETER_MESSAGE + suffix).length <= 300 ? GENERIC_PARAMETER_MESSAGE + suffix : message;
}
