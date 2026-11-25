/**
 * El formato de Anthropic (`/anthropic/v1/messages`, ADR-0078). Funciones puras: nombres de modelo, validación,
 * errores, saneo de respuestas y eventos, y medición del `usage` con caché. El handler está en `anthropic-handler.ts`.
 *
 * El contenido (bloques de texto, `thinking` con su `signature`, `tool_use`) pasa intacto: Claude Code reenvía los
 * bloques de `thinking` en el turno siguiente y el request falla si cambió un byte. Lo que se sanea es lo que rodea
 * al contenido: el `id`, el `model`, el `usage` y los campos que revelarían al upstream (docs/07 › Ocultar el upstream).
 */
import { errorBody } from "./errors";
import { IMAGE_PROMPT_TOKENS } from "./request-cost";
import { usdToMicroUsdCeil } from "./metering";
import type { GatewayErrorCode, Usage, UsageAccumulator } from "./types";

/** La versión del formato que se manda si el cliente no manda ninguna. Es la única que publica Anthropic. */
export const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

/** Tokens que se reservan por PDF cuando no se conoce el número de páginas: el base64 no dice cuántos cobra el modelo. */
const DOCUMENT_BYTES_PER_TOKEN = 4;
const PROMPT_BYTES_PER_TOKEN = 3;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

// ─── Errores ──────────────────────────────────────────────────────────────────

/** Los `error.type` de Anthropic que puede mandar el gateway, en el orden de su status (la tabla de /docs). */
export const ANTHROPIC_ERROR_TYPES = [
  "invalid_request_error", "authentication_error", "billing_error", "permission_error", "not_found_error",
  "request_too_large", "rate_limit_error", "api_error", "timeout_error", "overloaded_error",
] as const;
export type AnthropicErrorType = (typeof ANTHROPIC_ERROR_TYPES)[number];

/** El mensaje del evento `error` cuando el modelo falla a mitad del stream. */
export const MID_STREAM_FAILURE = "The model failed while generating the response.";

/** Status y `error.type` de Anthropic para cada error del gateway (docs/04 › Formato Anthropic). */
export const ANTHROPIC_ERRORS: Record<GatewayErrorCode, { status: number; type: AnthropicErrorType }> = {
  invalid_request: { status: 400, type: "invalid_request_error" },
  invalid_api_key: { status: 401, type: "authentication_error" },
  insufficient_credits: { status: 402, type: "billing_error" },
  no_active_plan: { status: 402, type: "billing_error" },
  key_limit_exceeded: { status: 403, type: "permission_error" },
  account_suspended: { status: 403, type: "permission_error" },
  model_not_allowed_for_key: { status: 403, type: "permission_error" },
  model_not_found: { status: 404, type: "not_found_error" },
  model_retired: { status: 404, type: "not_found_error" },
  request_too_large: { status: 413, type: "request_too_large" },
  rate_limit_exceeded: { status: 429, type: "rate_limit_error" },
  usage_limit_reached: { status: 429, type: "rate_limit_error" },
  // Las tres fallas del upstream van con 503: Cloudflare tapa un 502 o un 504 del origen y no está claro que deje
  // pasar un 500 o un 529 (ADR-0077). El `type` sigue distinguiéndolas y los SDKs de Anthropic reintentan un 503.
  upstream_error: { status: 503, type: "api_error" },
  upstream_timeout: { status: 503, type: "timeout_error" },
  no_upstream_available: { status: 503, type: "overloaded_error" },
};

/** `{"type":"error","error":{...}}` con el mismo mensaje saneado que el formato OpenAI. */
export function anthropicErrorBody(code: GatewayErrorCode, message?: string) {
  return { type: "error", error: { type: ANTHROPIC_ERRORS[code].type, message: errorBody(code, message).error.message } };
}

export function anthropicErrorResponse(
  code: GatewayErrorCode,
  options: { message?: string; requestId?: string; retryAfterSeconds?: number; status?: number } = {},
): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (options.requestId !== undefined) {
    headers.set("request-id", options.requestId);
    headers.set("x-request-id", options.requestId);
  }
  if (options.retryAfterSeconds !== undefined) {
    const seconds = Number.isFinite(options.retryAfterSeconds) ? Math.max(1, Math.ceil(options.retryAfterSeconds)) : 1;
    headers.set("retry-after", String(seconds));
  }
  return new Response(JSON.stringify(anthropicErrorBody(code, options.message)), {
    status: options.status ?? ANTHROPIC_ERRORS[code].status,
    headers,
  });
}

// ─── Key y modelo ─────────────────────────────────────────────────────────────

/** `x-api-key` (`ANTHROPIC_API_KEY`) o `Authorization: Bearer` (`ANTHROPIC_AUTH_TOKEN`), como `Authorization`. */
export function authorizationFromHeaders(headers: Headers): string | null {
  const apiKey = headers.get("x-api-key")?.trim();
  return apiKey ? `Bearer ${apiKey}` : headers.get("authorization");
}

/**
 * Los IDs que se prueban para un nombre de modelo, en orden. Claude Code manda los nombres de Anthropic
 * (`claude-sonnet-5-5`, `claude-haiku-4-5-20251001`, `claude-opus-4-8[1m]`); también valen los nuestros
 * (`anthropic/claude-sonnet-5.5`) y cualquier otro modelo del catálogo.
 */
export function modelCandidates(name: string): string[] {
  const trimmed = name.trim();
  if (trimmed === "") return [];
  const lower = trimmed.toLowerCase();
  const candidates = [trimmed, lower];
  if (lower.includes("/")) return [...new Set(candidates)];
  // `[1m]` (contexto largo) y la fecha o `-latest` del final no son parte del ID del catálogo.
  const base = lower.replace(/\[[^\]]*\]$/, "").replace(/-(?:\d{8}|latest)$/, "");
  // `claude-sonnet-5-5` → `claude-sonnet-5.5`; `claude-3-5-haiku` → `claude-3.5-haiku`.
  const dotted = base.replace(/(?<=-)(\d+)-(\d{1,2})(?=$|-)/g, "$1.$2");
  for (const id of [dotted, base]) candidates.push(`anthropic/${id}`);
  return [...new Set(candidates)];
}

// ─── Validación ───────────────────────────────────────────────────────────────

export type ValidatedMessages =
  | { ok: true; model: string; maxTokens: number; stream: boolean; body: Readonly<Record<string, unknown>> }
  | { ok: false; message: string };

/** Lo mínimo para no mandarle al upstream algo que va a rechazar igual. El resto lo valida el modelo. */
export function validateMessagesRequest(body: unknown): ValidatedMessages {
  if (!isObject(body)) return { ok: false, message: "The request body must be a JSON object." };
  if (typeof body.model !== "string" || body.model.trim() === "") return { ok: false, message: "model: Field required." };
  if (!Array.isArray(body.messages) || body.messages.length === 0) return { ok: false, message: "messages: Field required and must not be empty." };
  if (!body.messages.every(isObject)) return { ok: false, message: "messages: Each message must be an object." };
  const maxTokens = body.max_tokens;
  if (typeof maxTokens !== "number" || !Number.isSafeInteger(maxTokens) || maxTokens < 1) {
    return { ok: false, message: "max_tokens: Field required and must be a positive integer." };
  }
  if (body.stream !== undefined && typeof body.stream !== "boolean") return { ok: false, message: "stream: Must be a boolean." };
  return { ok: true, model: body.model, maxTokens, stream: body.stream === true, body };
}

// ─── Estimaciones ─────────────────────────────────────────────────────────────

/** Las fuentes base64 de imágenes y documentos del request: su tamaño no dice cuántos tokens cobra el modelo. */
function binarySources(body: Readonly<Record<string, unknown>>): { images: number; imageBytes: number; documentBytes: number } {
  let images = 0;
  let imageBytes = 0;
  let documentBytes = 0;
  const visit = (blocks: unknown) => {
    if (!Array.isArray(blocks)) return;
    for (const block of blocks) {
      if (!isObject(block)) continue;
      const source = isObject(block.source) ? block.source : null;
      const data = source && typeof source.data === "string" ? source.data : "";
      if (block.type === "image") {
        images++;
        imageBytes += Buffer.byteLength(data, "utf8");
      } else if (block.type === "document") {
        documentBytes += Buffer.byteLength(data, "utf8");
      }
      // Las imágenes de un `tool_result` (capturas de pantalla de Claude Code) viven en su `content`.
      if (block.type === "tool_result") visit(block.content);
    }
  };
  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    if (isObject(message)) visit(message.content);
  }
  return { images, imageBytes, documentBytes };
}

/**
 * Tokens de prompt hacia arriba, para la reserva (ADR-0066): el body a 3 bytes por token, cada imagen a un monto fijo
 * y cada PDF a su tamaño decodificado ÷ 4. Nunca más que el contexto del modelo.
 */
export function estimateMessagesPromptTokens(rawBody: string, body: Readonly<Record<string, unknown>>, contextLength: number): number {
  const { images, imageBytes, documentBytes } = binarySources(body);
  const textBytes = Math.max(0, Buffer.byteLength(rawBody, "utf8") - imageBytes - documentBytes);
  const documentTokens = Math.ceil((documentBytes * 3) / 4 / DOCUMENT_BYTES_PER_TOKEN);
  const tokens = Math.ceil(textBytes / PROMPT_BYTES_PER_TOKEN) + images * IMAGE_PROMPT_TOKENS + documentTokens;
  return Math.min(tokens, Math.max(1, contextLength));
}

/**
 * La cuenta de `count_tokens`: una estimación local, sin llamar al modelo ni cobrar. Texto a 4 caracteres por token
 * (lo habitual en inglés y en código), cada imagen a un monto fijo y cada PDF a su tamaño. No es exacta.
 */
export function countMessageTokens(rawBody: string, body: Readonly<Record<string, unknown>>): number {
  const { images, imageBytes, documentBytes } = binarySources(body);
  const textBytes = Math.max(0, Buffer.byteLength(rawBody, "utf8") - imageBytes - documentBytes);
  const documentTokens = Math.ceil((documentBytes * 3) / 4 / DOCUMENT_BYTES_PER_TOKEN);
  return Math.max(1, Math.ceil(textBytes / 4) + images * IMAGE_PROMPT_TOKENS + documentTokens);
}

function textLength(value: unknown): number {
  return typeof value === "string" ? Array.from(value).length : 0;
}

/** Caracteres de texto del prompt (sistema y mensajes): base de la estimación si el upstream no manda `usage`. */
export function messagesPromptLength(body: Readonly<Record<string, unknown>>): number {
  let count = 0;
  const visit = (content: unknown) => {
    if (typeof content === "string") { count += textLength(content); return; }
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!isObject(block)) continue;
      count += textLength(block.text) + textLength(block.thinking);
      if (block.type === "tool_use" && isObject(block.input)) count += textLength(JSON.stringify(block.input));
      if (block.type === "tool_result") visit(block.content);
    }
  };
  visit(body.system);
  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    if (isObject(message)) visit(message.content);
  }
  return count;
}

/** Caracteres generados en una respuesta (`content`) o en un evento del stream (`content_block_*`). */
export function messageOutputLength(payload: Readonly<Record<string, unknown>>): number {
  let count = 0;
  const block = (value: unknown) => {
    if (!isObject(value)) return;
    count += textLength(value.text) + textLength(value.thinking);
    if (value.type === "tool_use") {
      count += textLength(value.name);
      if (isObject(value.input) && Object.keys(value.input).length > 0) count += textLength(JSON.stringify(value.input));
    }
  };
  if (Array.isArray(payload.content)) payload.content.forEach(block);
  block(payload.content_block);
  if (isObject(payload.delta)) {
    count += textLength(payload.delta.text) + textLength(payload.delta.thinking) + textLength(payload.delta.partial_json);
  }
  return count;
}

// ─── Medición ─────────────────────────────────────────────────────────────────

/**
 * Junta el `usage` de Anthropic: `message_start` trae la entrada (con la caché) y `message_delta` la salida acumulada.
 * El prompt cobrado es entrada + escritura de caché + lectura de caché; lo leído de caché queda en `cachedTokens`.
 * El `cost` que agrega el upstream (en cualquier evento) se usa para cobrar (ADR-0054).
 */
export function createMessagesUsageAccumulator(): UsageAccumulator & { upstreamCost(): bigint | null } {
  let input: number | null = null;
  let cacheCreation: number | null = null;
  let cacheRead: number | null = null;
  let output: number | null = null;
  let cost: bigint | null = null;

  const read = (usage: Record<string, unknown>) => {
    if (isTokenCount(usage.input_tokens)) input = usage.input_tokens;
    if (isTokenCount(usage.cache_creation_input_tokens)) cacheCreation = usage.cache_creation_input_tokens;
    if (isTokenCount(usage.cache_read_input_tokens)) cacheRead = usage.cache_read_input_tokens;
    // `message_delta` trae la salida acumulada: el número más alto es el final.
    if (isTokenCount(usage.output_tokens)) output = Math.max(output ?? 0, usage.output_tokens);
    if (typeof usage.cost === "number" || typeof usage.cost === "string") {
      try {
        cost = usdToMicroUsdCeil(usage.cost);
      } catch {
        // Un costo ilegible no borra uno válido anterior.
      }
    }
  };

  return {
    observe(payload) {
      if (!isObject(payload)) return;
      if (isObject(payload.usage)) read(payload.usage);
      if (isObject(payload.message) && isObject(payload.message.usage)) read(payload.message.usage);
    },
    result(): Usage | null {
      if (input === null && output === null) return null;
      return {
        promptTokens: (input ?? 0) + (cacheCreation ?? 0) + (cacheRead ?? 0),
        completionTokens: output ?? 0,
        cachedTokens: cacheRead,
        reasoningTokens: null,
        upstreamCostMicroUsd: cost,
        estimated: false,
      };
    },
    upstreamCost() {
      return cost;
    },
  };
}

// ─── Saneo de respuestas y eventos ────────────────────────────────────────────

export interface MessagesContext {
  /** `msg_…` con el ID público del request. */
  id: string;
  /** El nombre que mandó el cliente: Anthropic devuelve el modelo pedido. */
  model: string;
}

const USAGE_NUMBERS = ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"] as const;

/** Solo los contadores de Anthropic: sin `cost`, sin vendedor y sin nada que el cliente no espere. */
export function sanitizeMessagesUsage(usage: unknown): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (!isObject(usage)) return clean;
  for (const field of USAGE_NUMBERS) if (isTokenCount(usage[field])) clean[field] = usage[field];
  if (isObject(usage.cache_creation)) {
    const creation: Record<string, number> = {};
    for (const field of ["ephemeral_5m_input_tokens", "ephemeral_1h_input_tokens"]) {
      const value = usage.cache_creation[field];
      if (isTokenCount(value)) creation[field] = value;
    }
    clean.cache_creation = creation;
  }
  if (isObject(usage.server_tool_use)) {
    const tools: Record<string, number> = {};
    for (const [field, value] of Object.entries(usage.server_tool_use)) {
      if (/^[a-z_]{1,40}$/.test(field) && isTokenCount(value)) tools[field] = value;
    }
    clean.server_tool_use = tools;
  }
  return clean;
}

/**
 * `stop_reason` y `stop_sequence`. Cualquier motivo con forma de identificador pasa (`end_turn`, `tool_use`,
 * `pause_turn`, `refusal`… y los que agregue Anthropic): el cliente decide qué hacer con cada uno.
 */
function stopFields(source: Record<string, unknown>) {
  return {
    stop_reason: typeof source.stop_reason === "string" && /^[a-z_]{1,40}$/.test(source.stop_reason) ? source.stop_reason : null,
    stop_sequence: typeof source.stop_sequence === "string" ? source.stop_sequence : null,
  };
}

/** Una respuesta completa (`type: "message"`) con nuestro `id` y el `model` pedido. El `content` va intacto. */
export function sanitizeMessage(body: Record<string, unknown>, ctx: MessagesContext): Record<string, unknown> {
  const stop = stopFields(body);
  return {
    id: ctx.id,
    type: "message",
    role: "assistant",
    model: ctx.model,
    content: Array.isArray(body.content) ? body.content : [],
    stop_reason: stop.stop_reason,
    stop_sequence: stop.stop_sequence,
    usage: sanitizeMessagesUsage(body.usage),
  };
}

/** Un evento del stream listo para el cliente, o null si no es uno de los de Anthropic. Los errores los maneja el handler. */
export function sanitizeStreamEvent(payload: Record<string, unknown>, ctx: MessagesContext): Record<string, unknown> | null {
  const index = isTokenCount(payload.index) ? payload.index : 0;
  switch (payload.type) {
    case "message_start":
      return { type: "message_start", message: sanitizeMessage(isObject(payload.message) ? payload.message : {}, ctx) };
    case "content_block_start":
      return isObject(payload.content_block) ? { type: "content_block_start", index, content_block: payload.content_block } : null;
    case "content_block_delta":
      return isObject(payload.delta) ? { type: "content_block_delta", index, delta: payload.delta } : null;
    case "content_block_stop":
      return { type: "content_block_stop", index };
    case "message_delta": {
      const delta = isObject(payload.delta) ? payload.delta : {};
      const stop = stopFields(delta);
      return {
        type: "message_delta",
        delta: { stop_reason: stop.stop_reason, stop_sequence: stop.stop_sequence },
        usage: sanitizeMessagesUsage(payload.usage),
      };
    }
    case "message_stop":
      return { type: "message_stop" };
    case "ping":
      return { type: "ping" };
    default:
      return null;
  }
}

/** Un evento SSE con su nombre: los SDK de Anthropic lo leen de la línea `event:`. */
export function encodeAnthropicEvent(payload: Record<string, unknown>): string {
  return `event: ${String(payload.type)}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export const ANTHROPIC_PING = encodeAnthropicEvent({ type: "ping" });
