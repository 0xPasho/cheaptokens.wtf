type ChatRequestValidation =
  | { ok: true; body: Record<string, unknown>; model: string; stream: boolean; includeUsage: boolean }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  // No se clona ni normaliza: los parámetros del modelo pasan tal cual.
  return { ok: true, body, model: body.model, stream: body.stream === true, includeUsage };
}
