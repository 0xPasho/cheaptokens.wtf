// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ANTHROPIC_ERROR_TYPES, ANTHROPIC_ERRORS, anthropicErrorResponse, authorizationFromHeaders, countMessageTokens, createMessagesUsageAccumulator,
  estimateMessagesPromptTokens, modelCandidates, sanitizeMessage, sanitizeStreamEvent, validateMessagesRequest,
} from "@/lib/gateway/anthropic";
import { IMAGE_PROMPT_TOKENS } from "@/lib/gateway/request-cost";

describe("modelCandidates", () => {
  it.each([
    ["claude-sonnet-5-5", "anthropic/claude-sonnet-5.5"],
    ["claude-haiku-4-5-20251001", "anthropic/claude-haiku-4.5"],
    ["claude-opus-4-8[1m]", "anthropic/claude-opus-4.8"],
    ["Claude-Opus-4-1", "anthropic/claude-opus-4.1"],
    ["claude-3-5-haiku-latest", "anthropic/claude-3.5-haiku"],
    ["claude-opus-4", "anthropic/claude-opus-4"],
  ])("maps Anthropic's name %s to %s", (name, id) => {
    expect(modelCandidates(name)).toContain(id);
  });

  it("tries our own IDs first and leaves other labs untouched", () => {
    expect(modelCandidates("anthropic/claude-sonnet-5.5")[0]).toBe("anthropic/claude-sonnet-5.5");
    expect(modelCandidates("deepseek/deepseek-v4.1-flash")).toEqual(["deepseek/deepseek-v4.1-flash"]);
    expect(modelCandidates("  ")).toEqual([]);
  });
});

describe("validateMessagesRequest", () => {
  const valid = { model: "claude-sonnet-5-5", max_tokens: 32_000, messages: [{ role: "user", content: "hi" }] };

  it("accepts what Claude Code sends", () => {
    expect(validateMessagesRequest({ ...valid, stream: true })).toMatchObject({ ok: true, maxTokens: 32_000, stream: true });
  });

  it.each([
    [{ ...valid, max_tokens: undefined }, "max_tokens"],
    [{ ...valid, max_tokens: 0 }, "max_tokens"],
    [{ ...valid, messages: [] }, "messages"],
    [{ ...valid, model: "" }, "model"],
    [{ ...valid, stream: "yes" }, "stream"],
  ])("rejects %j", (body, field) => {
    const result = validateMessagesRequest(body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(field);
  });
});

describe("estimates", () => {
  const image = (bytes: number) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: "A".repeat(bytes) } });

  it("reserves a fixed amount per image instead of its base64 size, also inside tool results", () => {
    const body = {
      model: "x", max_tokens: 10,
      messages: [
        { role: "user", content: [image(900_000), { type: "text", text: "¿Qué ves?" }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: [image(600_000)] }] },
      ],
    };
    const raw = JSON.stringify(body);
    const tokens = estimateMessagesPromptTokens(raw, body, 1_000_000);
    expect(tokens).toBeGreaterThanOrEqual(2 * IMAGE_PROMPT_TOKENS);
    expect(tokens).toBeLessThan(2 * IMAGE_PROMPT_TOKENS + 1_000);
    expect(countMessageTokens(raw, body)).toBeLessThan(2 * IMAGE_PROMPT_TOKENS + 1_000);
  });

  it("never reserves more prompt than the model's context", () => {
    const body = { model: "x", max_tokens: 10, messages: [{ role: "user", content: "a".repeat(600_000) }] };
    expect(estimateMessagesPromptTokens(JSON.stringify(body), body, 100_000)).toBe(100_000);
  });
});

describe("createMessagesUsageAccumulator", () => {
  it("adds the cache to the prompt and keeps the final output count", () => {
    const usage = createMessagesUsageAccumulator();
    usage.observe({ type: "message_start", message: { usage: { input_tokens: 20, cache_creation_input_tokens: 1000, cache_read_input_tokens: 5000, output_tokens: 1 } } });
    usage.observe({ type: "message_delta", usage: { output_tokens: 300 } });
    usage.observe({ type: "inferhub_usage", usage: { cost: 0.0042 } });
    expect(usage.result()).toEqual({
      promptTokens: 6020, completionTokens: 300, cachedTokens: 5000, reasoningTokens: null,
      upstreamCostMicroUsd: BigInt(4200), estimated: false,
    });
  });

  it("returns null without any usage, so the handler estimates", () => {
    const usage = createMessagesUsageAccumulator();
    usage.observe({ type: "ping" });
    expect(usage.result()).toBeNull();
  });
});

describe("sanitizing", () => {
  const ctx = { id: "msg_ours", model: "claude-sonnet-5-5" };

  it("rewrites the id and model, drops the cost and keeps the content byte for byte", () => {
    const content = [{ type: "thinking", thinking: "…", signature: "abc+/=" }, { type: "text", text: "hola" }];
    expect(sanitizeMessage({
      id: "msg_vendor", type: "message", role: "assistant", model: "ant/claude-sonnet-5-5", provider: "x", request_id: "r",
      content, stop_reason: "pause_turn", stop_sequence: null, usage: { input_tokens: 3, output_tokens: 4, cost: 0.1, vendor: "y" },
    }, ctx)).toEqual({
      id: "msg_ours", type: "message", role: "assistant", model: "claude-sonnet-5-5", content,
      stop_reason: "pause_turn", stop_sequence: null, usage: { input_tokens: 3, output_tokens: 4 },
    });
  });

  it("passes Anthropic's events and drops the rest", () => {
    const delta = { type: "signature_delta", signature: "abc+/=" };
    expect(sanitizeStreamEvent({ type: "content_block_delta", index: 2, delta }, ctx)).toEqual({ type: "content_block_delta", index: 2, delta });
    expect(sanitizeStreamEvent({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9, cost: 1 } }, ctx))
      .toEqual({ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 9 } });
    expect(sanitizeStreamEvent({ type: "inferhub_usage", usage: { cost: 1 } }, ctx)).toBeNull();
  });
});

describe("errors and keys", () => {
  it("uses Anthropic's types, statuses and request-id", async () => {
    const response = anthropicErrorResponse("usage_limit_reached", { requestId: "req_1", retryAfterSeconds: 12.2 });
    expect(response.status).toBe(429);
    expect(response.headers.get("request-id")).toBe("req_1");
    expect(response.headers.get("retry-after")).toBe("13");
    expect(await response.json()).toMatchObject({ type: "error", error: { type: "rate_limit_error" } });
    expect(anthropicErrorResponse("insufficient_credits").status).toBe(402);
    // Detrás de Cloudflare, las fallas del upstream son 503 (ADR-0077); el `type` dice cuál fue.
    expect(anthropicErrorResponse("no_upstream_available").status).toBe(503);
    expect(anthropicErrorResponse("upstream_timeout").status).toBe(503);
  });

  it("lists every error type the gateway sends, in status order, for the docs table", () => {
    const sent = new Map(Object.values(ANTHROPIC_ERRORS).map(({ type, status }) => [type, status]));
    expect([...ANTHROPIC_ERROR_TYPES].sort()).toEqual([...sent.keys()].sort());
    const statuses = ANTHROPIC_ERROR_TYPES.map((type) => sent.get(type)!);
    expect(statuses).toEqual([...statuses].sort((a, b) => a - b));
  });

  it("reads x-api-key first and falls back to Authorization", () => {
    expect(authorizationFromHeaders(new Headers({ "x-api-key": "wtf_a", authorization: "Bearer wtf_b" }))).toBe("Bearer wtf_a");
    expect(authorizationFromHeaders(new Headers({ authorization: "Bearer wtf_b" }))).toBe("Bearer wtf_b");
    expect(authorizationFromHeaders(new Headers())).toBeNull();
  });
});
