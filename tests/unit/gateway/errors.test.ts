// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { errorBody, errorResponse, sanitizeUpstreamClientMessage, streamErrorChunk, upstreamErrorCode } from "@/lib/gateway/errors";
import { GATEWAY_ERROR_STATUS } from "@/lib/gateway/types";
import type { GatewayErrorCode } from "@/lib/gateway/types";

const fixtures = JSON.parse(readFileSync(new URL("../../fixtures/inferhub/errors.json", import.meta.url), "utf8"));
const codes = Object.keys(GATEWAY_ERROR_STATUS) as GatewayErrorCode[];
const generic = "The model rejected the request parameters.";

describe("gateway errors", () => {
  it.each(codes)("returns an OpenAI error and the correct status for %s", async (code) => {
    const body = errorBody(code);
    expect(body).toEqual({ error: { message: expect.any(String), type: code, code } });
    expect(body.error.message).not.toMatch(/inferhub|openrouter|qwencloud/i);
    const response = errorResponse(code);
    expect(response.status).toBe(GATEWAY_ERROR_STATUS[code]);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.has("x-request-id")).toBe(false);
    expect(response.headers.has("retry-after")).toBe(false);
    expect(await response.json()).toEqual(body);
  });

  it("uses the documented insufficient credits message", () => {
    expect(errorBody("insufficient_credits").error.message).toBe("Insufficient credits. Top up at https://cheaptokens.wtf/dashboard/credits");
  });

  it("includes supplied request and retry headers, including zero", async () => {
    const response = errorResponse("rate_limit_exceeded", { message: "Please try again later.", requestId: "req_public", retryAfterSeconds: 0 });
    expect(Object.fromEntries(response.headers)).toEqual({ "content-type": "application/json; charset=utf-8", "x-request-id": "req_public", "retry-after": "0" });
    expect(await response.json()).toEqual(errorBody("rate_limit_exceeded", "Please try again later."));
  });

  it("builds the documented stream error with public metadata", () => {
    const ctx = { id: "chatcmpl-req_public", model: "author/model", created: 123 };
    expect(streamErrorChunk(ctx)).toEqual({ ...ctx, object: "chat.completion.chunk",
      error: { message: "The model failed while generating the response.", type: "upstream_error", code: "upstream_error" },
      choices: [{ index: 0, delta: {}, finish_reason: "error" }],
    });
  });
});

describe("upstream error code", () => {
  it("extracts no_provider_under_bid and falls back to type", () => {
    expect(upstreamErrorCode(fixtures.no_provider_under_bid_402)).toBe("no_provider_under_bid");
    expect(upstreamErrorCode(fixtures.publisher_400)).toBe("invalid_parameter_error");
    expect(upstreamErrorCode(fixtures.model_not_found_404)).toBe("model_not_found");
    expect(upstreamErrorCode({ error: { code: "preferred", type: "ignored" } })).toBe("preferred");
    expect(upstreamErrorCode({ error: { code: 123, type: "fallback" } })).toBe("fallback");
    expect(upstreamErrorCode({ error: { code: "", type: "fallback" } })).toBe("fallback");
  });

  it.each([null, undefined, "error", [], {}, { error: null }, { error: [] }, { error: "error" }, { error: {} }, { error: { code: 1, type: false } }])("handles malformed body %j", (body) => {
    expect(upstreamErrorCode(body)).toBeNull();
    expect(sanitizeUpstreamClientMessage(body)).toBe(generic);
  });
});

describe("upstream client messages", () => {
  it("preserves the useful publisher_400 message without its metadata", async () => {
    const upstream = fixtures.publisher_400;
    const message = sanitizeUpstreamClientMessage(upstream);
    expect(message).toBe(upstream.error.message);
    const response = errorResponse("invalid_request", { message });
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toMatch(/qwencloud|alibaba|inferhub|request_id|source/i);
    expect(serialized).not.toContain(upstream.id);
    expect(serialized).not.toContain(upstream.request_id);
  });

  it("does not copy response headers through any public error output", async () => {
    const lines = readFileSync(new URL("../../fixtures/inferhub/response-headers.txt", import.meta.url), "utf8").trim().split("\n");
    const headers = Object.fromEntries(lines.map((line) => { const colon = line.indexOf(":"); return [line.slice(0, colon), line.slice(colon + 1).trim()]; }));
    const body = { ...headers, error: { ...headers, message: "Invalid temperature.", source: "InferHub" } };
    const message = sanitizeUpstreamClientMessage(body);
    const response = errorResponse("invalid_request", { message });
    expect(Object.fromEntries(response.headers)).toEqual({ "content-type": "application/json; charset=utf-8" });
    const output = JSON.stringify([errorBody("invalid_request", message), await response.json(), streamErrorChunk({ id: "chatcmpl-req_local", model: "author/model", created: 0 })]);
    expect(output).not.toMatch(/inferhub/i);
    for (const key of Object.keys(headers)) expect(output).not.toContain(key);
  });

  it.each([
    "InferHub rejected the request.", "INFERHUB rejected the request.", "infer-hub rejected the request.",
    "OpenRouter", "Qwencloud/Alibaba CN", "Aliyun DashScope", "Anthropic", "OpenAI", "Google Vertex",
    "Bedrock", "Azure", "DeepSeek", "Zhipu", "Moonshot", "MiniMax", "Kiro", "Codex", "Groq",
    "See https://internal.example/path", "See http://internal.example", "See www.example.com", "See api.example.dev/docs",
    "See ftp://internal/path", "See //internal/path",
    "Internal dca0748a-8885-909d-ad85-06b118210e33", "Internal dbe38640c4a8082b", "Internal 0xabcdef0123456789",
    "Failed req_dca0748a-8885-909d-ad85-06b118210e33", "Failed req_dbe38640c4a8082b_suffix",
    "request_id: internal", "private\nmetadata", "In\u200bferHub", "x".repeat(301), "", "  ",
  ])("replaces unsafe message %j", (message) => {
    expect(sanitizeUpstreamClientMessage({ error: { message } })).toBe(generic);
    expect(errorBody("invalid_request", message)).toEqual(errorBody("invalid_request"));
  });

  it("allows messages of exactly 300 characters", () => {
    expect(sanitizeUpstreamClientMessage({ error: { message: "x".repeat(300) } })).toBe("x".repeat(300));
  });

  it("appends a safe param, even when the message must be replaced", () => {
    expect(sanitizeUpstreamClientMessage({ error: { message: "Invalid role.", param: "messages[0].role" } })).toBe("Invalid role. (param: messages[0].role)");
    expect(sanitizeUpstreamClientMessage({ error: { message: "InferHub internal error", param: "max_tokens" } })).toBe(`${generic} (param: max_tokens)`);
  });

  it.each([null, 12, { provider: "inferhub" }, "InferHub", "https://api.example.dev", "request_id", "dca0748a-8885-909d-ad85-06b118210e33", "dbe38640c4a8082b", "safe\nInferHub", "x".repeat(301)])("does not append unsafe param %j", (param) => {
    expect(sanitizeUpstreamClientMessage({ error: { message: "Invalid role.", param } })).toBe("Invalid role.");
  });

  it("keeps the combined message and parameter within 300 characters", () => {
    const message = sanitizeUpstreamClientMessage({ error: { message: "x".repeat(300), param: "temperature" } });
    expect(message).toBe(`${generic} (param: temperature)`);
    expect(message.length).toBeLessThanOrEqual(300);
  });
});
