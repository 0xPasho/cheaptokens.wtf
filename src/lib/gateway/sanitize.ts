import type { ResponseContext, Usage } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function copyStrings(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof source[key] === "string") result[key] = source[key];
  }
  return result;
}

function sanitizeToolCall(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  const result = copyStrings(value, ["id", "type"]);
  if (isCount(value.index)) result.index = value.index;
  if (isObject(value.function)) {
    const fn = copyStrings(value.function, ["name", "arguments"]);
    if (Object.keys(fn).length > 0) result.function = fn;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeMessage(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  const result = copyStrings(value, ["role", "reasoning_content"]);
  for (const key of ["content", "refusal"]) {
    if (typeof value[key] === "string" || value[key] === null) result[key] = value[key];
  }
  if (Array.isArray(value.tool_calls)) {
    result.tool_calls = value.tool_calls.map(sanitizeToolCall).filter((call) => call !== null);
  }
  return result;
}

function sanitizeTokenLogprob(value: unknown, includeTop: boolean): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  const result = copyStrings(value, ["token"]);
  if (typeof value.logprob === "number" && Number.isFinite(value.logprob)) result.logprob = value.logprob;
  if (value.bytes === null) result.bytes = null;
  else if (Array.isArray(value.bytes) && value.bytes.every((byte) => isCount(byte) && byte <= 255)) {
    result.bytes = [...value.bytes];
  }
  if (includeTop && Array.isArray(value.top_logprobs)) {
    result.top_logprobs = value.top_logprobs.map((token) => sanitizeTokenLogprob(token, false)).filter((token) => token !== null);
  }
  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeLogprobs(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  const result: Record<string, unknown> = {};
  for (const key of ["content", "refusal"]) {
    if (value[key] === null) result[key] = null;
    else if (Array.isArray(value[key])) {
      result[key] = value[key].map((token) => sanitizeTokenLogprob(token, true)).filter((token) => token !== null);
    }
  }
  return result;
}

function sanitizeChoices(upstream: unknown, field: "message" | "delta"): Record<string, unknown>[] {
  if (!isObject(upstream) || !Array.isArray(upstream.choices)) return [];
  const choices: Record<string, unknown>[] = [];
  for (const value of upstream.choices) {
    if (!isObject(value)) continue;
    const choice: Record<string, unknown> = {};
    if (isCount(value.index)) choice.index = value.index;
    if (typeof value.finish_reason === "string" || value.finish_reason === null) {
      choice.finish_reason = value.finish_reason;
    }
    const message = sanitizeMessage(value[field]);
    if (message !== null) choice[field] = message;
    const logprobs = sanitizeLogprobs(value.logprobs);
    if (value.logprobs === null || logprobs !== null) choice.logprobs = logprobs;
    // Un índice o metadatos nulos por sí solos no justifican un chunk.
    if ((message !== null && Object.keys(message).length > 0)
      || typeof choice.finish_reason === "string"
      || (logprobs !== null && Object.keys(logprobs).length > 0)) {
      choices.push(choice);
    }
  }
  return choices;
}

function responseFields(ctx: ResponseContext, object: string): Record<string, unknown> {
  return { id: ctx.id, object, created: ctx.created, model: ctx.model };
}

function sanitizeRawUsage(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    if (isCount(value[key])) result[key] = value[key];
  }
  for (const [field, tokenField] of [
    ["prompt_tokens_details", "cached_tokens"],
    ["completion_tokens_details", "reasoning_tokens"],
  ]) {
    const details = value[field];
    if (isObject(details) && isCount(details[tokenField])) result[field] = { [tokenField]: details[tokenField] };
  }
  return result;
}

export function sanitizeCompletion(upstream: unknown, ctx: ResponseContext): Record<string, unknown> {
  const result = {
    ...responseFields(ctx, "chat.completion"),
    choices: sanitizeChoices(upstream, "message"),
  };
  if (isObject(upstream) && isObject(upstream.usage)) {
    return { ...result, usage: sanitizeRawUsage(upstream.usage) };
  }
  return result;
}

export function sanitizeChunk(upstream: unknown, ctx: ResponseContext): Record<string, unknown> | null {
  const choices = sanitizeChoices(upstream, "delta");
  if (choices.length === 0) return null;
  // El handler emite el uso consolidado; nunca se reenvía el de un chunk ajeno.
  return { ...responseFields(ctx, "chat.completion.chunk"), choices };
}

export function sanitizeUsageObject(usage: Usage): Record<string, unknown> {
  return sanitizeRawUsage({
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.promptTokens + usage.completionTokens,
    prompt_tokens_details: { cached_tokens: usage.cachedTokens },
    completion_tokens_details: { reasoning_tokens: usage.reasoningTokens },
  });
}

export function buildUsageChunk(usage: Usage, ctx: ResponseContext): Record<string, unknown> {
  return {
    ...responseFields(ctx, "chat.completion.chunk"),
    choices: [],
    usage: sanitizeUsageObject(usage),
  };
}
