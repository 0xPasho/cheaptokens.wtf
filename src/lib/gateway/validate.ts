type ChatRequestValidation =
  | {
      ok: true; body: Record<string, unknown>; model: string; stream: boolean; includeUsage: boolean;
      /** El menor de `max_tokens` y `max_completion_tokens`, o null si no vino ninguno (ADR-0066). */
      maxOutputTokens: number | null;
      /** `n`, o 1. */
      choices: number;
    }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Definen el costo máximo que se reserva (ADR-0066): se validan aquí en vez de dejárselos al upstream. */
const SIZE_FIELDS = ["max_tokens", "max_completion_tokens", "n"] as const;

export function validateChatRequest(body: unknown): ChatRequestValidation {
  if (!isObject(body)) return { ok: false, message: "The request body must be a JSON object." };
  if (typeof body.model !== "string" || body.model.trim() === "") {
    return { ok: false, message: "The 'model' field must be a non-empty string." };
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, message: "The 'messages' field must be a non-empty array." };
  }
  if (body.messages.some((message) => !isObject(message) || typeof message.role !== "string")) {
    return { ok: false, message: "Each message must be an object with a string 'role'." };
  }
  if ("stream" in body && body.stream !== null && typeof body.stream !== "boolean") {
    return { ok: false, message: "The 'stream' field must be a boolean." };
  }

  let includeUsage = false;
  if ("stream_options" in body && body.stream_options !== null) {
    if (!isObject(body.stream_options)) {
      return { ok: false, message: "The 'stream_options' field must be an object." };
    }
    if ("include_usage" in body.stream_options) {
      if (typeof body.stream_options.include_usage !== "boolean") {
        return { ok: false, message: "The 'stream_options.include_usage' field must be a boolean." };
      }
      includeUsage = body.stream_options.include_usage;
    }
  }

  for (const field of SIZE_FIELDS) {
    if (field in body && body[field] !== null && !isPositiveInteger(body[field])) {
      return { ok: false, message: `The '${field}' field must be a positive integer.` };
    }
  }
  const outputLimits = [body.max_tokens, body.max_completion_tokens].filter(isPositiveInteger);

  // No se clona ni normaliza: los parámetros del modelo pasan tal cual. El handler solo puede bajar la salida.
  return {
    ok: true, body, model: body.model, stream: body.stream === true, includeUsage,
    maxOutputTokens: outputLimits.length > 0 ? Math.min(...outputLimits) : null,
    choices: isPositiveInteger(body.n) ? body.n : 1,
  };
}
