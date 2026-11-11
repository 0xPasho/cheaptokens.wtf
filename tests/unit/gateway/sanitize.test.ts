// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildUsageChunk, sanitizeChunk, sanitizeCompletion, sanitizeUsageObject } from "@/lib/gateway/sanitize";
import { createSseParser } from "@/lib/gateway/sse";
import type { ResponseContext, Usage } from "@/lib/gateway/types";

const ctx: ResponseContext = { id: "chatcmpl-req_local", model: "author/public-model", created: 1234 };
const usage: Usage = {
  promptTokens: 36, completionTokens: 28, cachedTokens: 0, reasoningTokens: 24,
  upstreamCostMicroUsd: BigInt(10), estimated: false,
};
const safeUsage = {
  prompt_tokens: 36, completion_tokens: 28, total_tokens: 64,
  prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 24 },
};

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/inferhub/${name}`, import.meta.url), "utf8");
}

describe("real completion fixtures", () => {
  it("keeps reasoning_content, finish_reason and standard usage details", () => {
    const upstream = JSON.parse(fixture("chat-reasoning-length.json"));
    expect(sanitizeCompletion(upstream, ctx)).toEqual({
      ...ctx, object: "chat.completion",
      choices: [{ index: 0, finish_reason: "length", message: {
        content: "", role: "assistant", reasoning_content: upstream.choices[0].message.reasoning_content,
      } }],
      usage: { prompt_tokens: 36, completion_tokens: 20, total_tokens: 56,
        prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 20 } },
    });
  });

  it("sanitizes estimated usage without exposing its cost or original identity", () => {
    expect(sanitizeCompletion(JSON.parse(fixture("chat-estimated-usage.json")), ctx)).toEqual({
      ...ctx, object: "chat.completion",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Hola" } }],
      usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
    });
  });
});

describe("real stream fixtures", () => {
  it.each(["chat-stream-double-usage.sse", "chat-stream-without-stream-options.sse"])("drops both usage chunks from %s", (name) => {
    const parser = createSseParser();
    const events = [...parser.push(new TextEncoder().encode(fixture(name))), ...parser.flush()];
    let usageChunks = 0;
    let reasoningChunks = 0;
    const output: Record<string, unknown>[] = [];
    for (const event of events) {
      if (event.type !== "data" || event.data === "[DONE]") continue;
      const payload = JSON.parse(event.data);
      const chunk = sanitizeChunk(payload, ctx);
      if (payload.choices.length === 0) {
        usageChunks++;
        expect(chunk).toBeNull();
      } else {
        expect(chunk).toMatchObject({ ...ctx, object: "chat.completion.chunk" });
        expect(chunk).not.toHaveProperty("usage");
        if (typeof payload.choices[0].delta.reasoning_content === "string") {
          reasoningChunks++;
          expect(chunk).toHaveProperty("choices.0.delta.reasoning_content", payload.choices[0].delta.reasoning_content);
        }
        if (chunk) output.push(chunk);
      }
    }
    expect(usageChunks).toBe(2);
    expect(reasoningChunks).toBeGreaterThan(0);
    output.push(buildUsageChunk(usage, ctx));
    expect(output.filter((chunk) => "usage" in chunk)).toHaveLength(1);
    expect(JSON.stringify(output)).not.toMatch(/inferhub|alicn|request_id|system_fingerprint|"cost"/i);
  });
});

describe("response whitelist", () => {
  const headers = Object.fromEntries(fixture("response-headers.txt").trim().split("\n").map((line) => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon), line.slice(colon + 1).trim()];
  }));
  const extras = { ...headers, provider: "InFeRhUb", request_id: "internal", system_fingerprint: "secret", service_tier: "private", reasoning: "private", thinking: "private" };

  it.each(["message", "delta"] as const)("restricts roles and tool types in %s to OpenAI values", (field) => {
    for (const role of ["assistant", "tool", "function", "inferhub-assistant", "user", "system", "developer", "", null, 7]) {
      for (const type of ["function", "inferhub-tool", "custom", null, 7]) {
        const payload = { choices: [{ [field]: { role, tool_calls: [{ type, function: { name: "weather", arguments: "{}" } }] } }] };
        const result = field === "message" ? sanitizeCompletion(payload, ctx) : sanitizeChunk(payload, ctx);
        expect(result).toHaveProperty(`choices.0.${field}`, {
          role: role === "tool" || role === "function" ? role : "assistant",
          tool_calls: [{ type: "function", function: { name: "weather", arguments: "{}" } }],
        });
      }
    }
  });

  it.each(["message", "delta"] as const)("normalizes finish_reason in %s without exposing upstream values", (field) => {
    const reasons: [unknown, string | null][] = [
      ["stop", "stop"], ["length", "length"], ["tool_calls", "tool_calls"],
      ["content_filter", "content_filter"], ["function_call", "function_call"], [null, null],
      ["end_turn", "stop"], ["stop_sequence", "stop"], ["max_tokens", "length"], ["tool_use", "tool_calls"],
      ["SAFETY", "content_filter"], ["RECITATION", "content_filter"], ["BLOCKLIST", "content_filter"],
      ["PROHIBITED_CONTENT", "content_filter"], ["MAX_TOKENS", "length"], ["ToOl_UsE", "tool_calls"],
      ["inferhub-finish", "stop"], ["", "stop"], [42, null], [{ source: "inferhub" }, null],
      [{}, null], [0, null], [false, null], [undefined, null],
    ];
    const variants = reasons.flatMap(([reason, expected]) => typeof reason === "string"
      ? [[reason, expected], [reason.toLowerCase(), expected], [reason.toUpperCase(), expected]]
      : [[reason, expected]]);
    for (const [finish_reason, expected] of variants) {
      const payload = { choices: [{ [field]: { content: "Hola" }, finish_reason }] };
      const result = field === "message" ? sanitizeCompletion(payload, ctx) : sanitizeChunk(payload, ctx);
      expect(result).toHaveProperty("choices.0.finish_reason", expected);
    }
  });

  it.each([{}, 0, false])("does not emit a finish-only chunk for malformed finish_reason %j", (finish_reason) => {
    expect(sanitizeChunk({ choices: [{ delta: {}, finish_reason }] }, ctx)).toBeNull();
  });

  it.each(["message", "delta"] as const)("assigns missing choice indices by their original array position in %s", (field) => {
    const payload = { choices: [
      { [field]: { content: "First" } }, null,
      { index: 7, [field]: { content: "Explicit" } },
      { [field]: { content: "Last" } },
      { index: -1, [field]: { content: "Invalid index" } },
    ] };
    const result = field === "message" ? sanitizeCompletion(payload, ctx) : sanitizeChunk(payload, ctx);
    expect(result).toHaveProperty("choices", [
      { index: 0, [field]: { content: "First" } },
      { index: 7, [field]: { content: "Explicit" } },
      { index: 3, [field]: { content: "Last" } },
      { index: 4, [field]: { content: "Invalid index" } },
    ]);
  });

  it.each(["message", "delta"] as const)("assigns free indices around explicit choices in %s", (field) => {
    for (const [indices, expected] of [
      [[1, undefined], [1, 2]],
      [[undefined, 0], [1, 0]],
      [[2, undefined, undefined], [2, 1, 3]],
      [[undefined, undefined, 0, 1], [2, 3, 0, 1]],
      [[1, 1, undefined], [1, 2, 3]],
    ]) {
      const payload = { choices: indices.map((index) => ({ index, [field]: { content: "Hola" } })) };
      const result = field === "message" ? sanitizeCompletion(payload, ctx) : sanitizeChunk(payload, ctx);
      expect(result).toHaveProperty("choices", expected.map((index) => ({ index, [field]: { content: "Hola" } })));
    }
  });

  it.each(["message", "delta"] as const)("sanitizes nested %s, tools and logprobs", (field) => {
    const upstream = {
      ...extras, id: "chatcmpl-upstream", model: "internal/model", object: "private", created: 999,
      choices: [{ ...extras, index: 0, finish_reason: "tool_calls", [field]: {
        ...extras, role: "assistant", content: null, refusal: null, reasoning_content: "Let me think.",
        tool_calls: [{ ...extras, index: 0, id: "call_1", type: "function", function: { ...extras, name: "weather", arguments: '{"city":"México"}' } }],
      }, logprobs: { ...extras, content: [{ ...extras, token: "Hola", logprob: -0.1, bytes: [72], top_logprobs: [{ ...extras, token: "Hola", logprob: -0.2, bytes: null }] }], refusal: null } }],
      usage: { ...extras, prompt_tokens: 36, completion_tokens: 28, total_tokens: 64, cost: 0.00001,
        prompt_tokens_details: { ...extras, cached_tokens: 0, text_tokens: 36, image_tokens: 0 },
        completion_tokens_details: { ...extras, reasoning_tokens: 24, text_tokens: 4 } },
    };
    const result = field === "message" ? sanitizeCompletion(upstream, ctx) : sanitizeChunk(upstream, ctx);
    expect(result).toEqual({
      ...ctx, object: field === "message" ? "chat.completion" : "chat.completion.chunk",
      choices: [{ index: 0, finish_reason: "tool_calls", [field]: {
        role: "assistant", content: null, refusal: null, reasoning_content: "Let me think.",
        tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "weather", arguments: '{"city":"México"}' } }],
      }, logprobs: { content: [{ token: "Hola", logprob: -0.1, bytes: [72], top_logprobs: [{ token: "Hola", logprob: -0.2, bytes: null }] }], refusal: null } }],
      ...(field === "message" ? { usage: safeUsage } : {}),
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/inferhub|request_id|provider|system_fingerprint|service_tier|"cost"|text_tokens|image_tokens|"reasoning"|"thinking"/i);
    for (const [key, value] of Object.entries(headers)) {
      expect(serialized).not.toContain(key);
      expect(serialized).not.toContain(JSON.stringify(value));
    }
  });

  it.each(["message", "delta"] as const)("only allows string reasoning_content in %s", (field) => {
    for (const reasoning_content of [null, 42, { source: "inferhub" }, ["private"]]) {
      const payload = { choices: [{ index: 0, [field]: { content: "Hola", reasoning_content, reasoning: "private", thinking: "private" } }] };
      const result = field === "message" ? sanitizeCompletion(payload, ctx) : sanitizeChunk(payload, ctx);
      expect(result).toHaveProperty(`choices.0.${field}`, { content: "Hola" });
    }
  });

  it("preserves model-generated text even when it mentions a provider (ADR-0031)", () => {
    expect(sanitizeChunk({ choices: [{ delta: { content: "InferHub", reasoning_content: "OpenRouter" } }] }, ctx))
      .toHaveProperty("choices.0.delta", { content: "InferHub", reasoning_content: "OpenRouter" });
  });

  it.each([null, undefined, "invalid", [], {}, { choices: null }, { choices: [] }, { choices: [null, [], {}, { index: 0, delta: {}, finish_reason: null }] }, { choices: [{ delta: { provider: "inferhub" } }] }])("handles empty or malformed upstream payload %j", (payload) => {
    expect(sanitizeChunk(payload, ctx)).toBeNull();
    expect(sanitizeCompletion(payload, ctx)).toMatchObject({ ...ctx, object: "chat.completion", choices: [] });
  });

  it("keeps a finish-only chunk and tool argument fragments", () => {
    expect(sanitizeChunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }, ctx))
      .toHaveProperty("choices", [{ index: 0, delta: {}, finish_reason: "stop" }]);
    expect(sanitizeChunk({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "}" } }] } }] }, ctx))
      .toHaveProperty("choices.0.delta.tool_calls", [{ index: 0, function: { arguments: "}" } }]);
  });

  it("does not mutate the upstream payload", () => {
    const payload = JSON.parse(fixture("chat-reasoning-length.json"));
    const original = structuredClone(payload);
    sanitizeCompletion(payload, ctx);
    sanitizeChunk(payload, ctx);
    expect(payload).toEqual(original);
  });
});

describe("usage output", () => {
  it("builds the sole usage chunk with public metadata and no cost", () => {
    expect(sanitizeUsageObject(usage)).toEqual(safeUsage);
    expect(buildUsageChunk(usage, ctx)).toEqual({ ...ctx, object: "chat.completion.chunk", choices: [], usage: safeUsage });
  });

  it("omits missing details and retains explicit zeroes", () => {
    expect(sanitizeUsageObject({ ...usage, cachedTokens: null, reasoningTokens: null })).toEqual({ prompt_tokens: 36, completion_tokens: 28, total_tokens: 64 });
    expect(sanitizeUsageObject({ ...usage, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 })).toEqual({
      prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
      prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 },
    });
  });

  it("discards malformed token fields instead of passing arbitrary objects through", () => {
    expect(sanitizeCompletion({ usage: { prompt_tokens: { provider: "inferhub" }, completion_tokens: -1, total_tokens: Infinity, prompt_tokens_details: { cached_tokens: "inferhub" } } }, ctx))
      .toHaveProperty("usage", {});
  });
});
