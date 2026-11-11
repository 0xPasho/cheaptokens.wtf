// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CATALOG } from "@catalog/models";
import { UPSTREAMS } from "@catalog/upstreams";

import { generateKey } from "@/lib/api-keys";
import { reconcile } from "@/lib/billing/reconcile";
import { apiKeys, requests, workspaces } from "@/lib/db/schema";
import { uuidv7 } from "@/lib/db/uuid";
import { createCatalogSource, loadCatalogSnapshot } from "@/lib/gateway/catalog-snapshot";
import { handleChatCompletion } from "@/lib/gateway/handler";
import { createJsonLogger } from "@/lib/gateway/logger";
import * as sanitizers from "@/lib/gateway/sanitize";
import { createSseParser } from "@/lib/gateway/sse";
import type { GatewayDeps, GatewayErrorCode } from "@/lib/gateway/types";
import { createMemoryRateLimiter } from "@/lib/rate-limit/memory";

import { startGatewayHarness, type GatewayHarnessOptions } from "../../helpers/gateway-harness";

type Harness = Awaited<ReturnType<typeof startGatewayHarness>>;
const harnesses: Harness[] = [];
const model = "qwen/qwen3.8-flash";
function scenarioUpstreams(scenario: string) {
  return UPSTREAMS.map((upstream) => upstream.id !== "mock" ? upstream : {
    ...upstream, models: upstream.models.map((mapping) => ({ ...mapping, upstreamModel: `mock/${scenario}` })),
  });
}

const basicBody = { model, messages: [{ role: "user", content: "Hola" }] };

async function start(options?: GatewayHarnessOptions) {
  const harness = await startGatewayHarness(options);
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

function post(harness: Harness, body: unknown = basicBody, headers: Record<string, string> = {}) {
  return fetch(`${harness.baseUrl}/chat/completions`, {
    method: "POST", headers: { authorization: `Bearer ${harness.apiKey}`, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function failure(response: Response, status: number, code: GatewayErrorCode) {
  expect(response.status).toBe(status);
  expect(response.headers.get("x-request-id")).toMatch(/^req_[a-f0-9]{12}7[a-f0-9]{19}$/);
  expect(await response.json()).toEqual({ error: { message: expect.any(String), type: code, code } });
  expect([...response.headers.keys()].some((key) => key.startsWith("x-inferhub-"))).toBe(false);
}

function chunks(text: string): Record<string, unknown>[] {
  const parser = createSseParser();
  return parser.push(new TextEncoder().encode(text)).flatMap((event) =>
    event.type === "data" && event.data !== "[DONE]" ? [JSON.parse(event.data) as Record<string, unknown>] : []);
}

function directDeps(harness: Harness, overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    db: harness.db,
    catalog: createCatalogSource(() => loadCatalogSnapshot(harness.db, {
      env: { UPSTREAM_MOCK_BASE_URL: harness.mock.baseUrl }, environment: "development", now: Date.now,
    })),
    rateLimiter: createMemoryRateLimiter(), fetch, now: Date.now, newId: uuidv7,
    log: createJsonLogger((line) => harness.logs.push(line)), env: { apiHost: null, rateLimitRpm: 60, isProduction: false },
    after: () => {}, ...overrides,
  };
}

function directRequest(harness: Harness, body: BodyInit = JSON.stringify(basicBody), extra: RequestInit = {}) {
  return new Request(`${harness.baseUrl}/chat/completions`, {
    method: "POST", headers: { authorization: `Bearer ${harness.apiKey}` }, body, ...extra,
  });
}

describe("gateway handler", () => {
  it("serves a hidden model, rewrites identity, strips extras and charges all three costs", async () => {
    const harness = await start();
    const response = await post(harness);
    expect(response.status).toBe(200);
    const payload = await response.json();
    const requestId = response.headers.get("x-request-id");
    expect(payload).toEqual({
      id: `chatcmpl-${requestId}`, object: "chat.completion", created: expect.any(Number), model,
      choices: [{ index: 0, message: { role: "assistant", content: "Hola 🌎. ".repeat(3), reasoning_content: "We need answer in Spanish." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 14, total_tokens: 15, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 2 } },
    });
    expect([...response.headers.keys()].some((name) => name.startsWith("x-inferhub-") || name.startsWith("x-ratelimit-"))).toBe(false);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    await harness.flushAfter();
    const [record] = await harness.db.select().from(requests);
    expect(record).toMatchObject({
      id: requestId?.slice(4).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5"),
      status: "success", httpStatus: 200, upstreamId: "mock", attempts: 1, stream: false,
      costMicroUsd: BigInt(10), upstreamCostMicroUsd: BigInt(10), officialCostMicroUsd: BigInt(7), usageEstimated: false,
    });
    const [workspace] = await harness.db.select().from(workspaces);
    const [key] = await harness.db.select().from(apiKeys);
    expect(workspace.balanceMicroUsd).toBe(BigInt(4_999_990));
    expect(key.spentMicroUsd).toBe(BigInt(10));
    expect(key.lastUsedAt).not.toBeNull();
    expect(await reconcile(harness.db)).toMatchObject({ balanceMismatches: [], keySpendMismatches: [] });
    const completed = harness.logs.map((line) => JSON.parse(line)).filter((line) => line.event === "request_completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ requestId, workspaceId: harness.workspaceId, apiKeyId: harness.apiKeyId, modelId: model, upstreamId: "mock", status: "success", httpStatus: 200, promptTokens: 1, completionTokens: 14, ttfbMs: expect.any(Number), latencyMs: expect.any(Number) });
    expect(harness.logs.join("\n")).not.toMatch(/Hola|reasoning_content|Authorization|Bearer|wtf_/);
  });

  it.each([false, true])("streams sanitized chunks; include_usage=%s", async (includeUsage) => {
    const harness = await start();
    const response = await post(harness, { ...basicBody, stream: true, stream_options: { include_usage: includeUsage } });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    expect([...response.headers.keys()].some((name) => name.startsWith("x-inferhub-"))).toBe(false);
    const text = await response.text();
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
    expect(text).not.toMatch(/inferhub|request_id|"cost"|"provider"/i);
    const payloads = chunks(text);
    for (const payload of payloads) {
      expect(payload.id).toBe(`chatcmpl-${response.headers.get("x-request-id")}`);
      expect(payload.model).toBe(model);
      expect(Object.keys(payload).sort()).toEqual(("usage" in payload ? ["id", "object", "created", "model", "choices", "usage"] : ["id", "object", "created", "model", "choices"]).sort());
    }
    const usages = payloads.filter((payload) => "usage" in payload);
    expect(usages).toHaveLength(includeUsage ? 1 : 0);
    if (includeUsage) expect(usages[0].usage).toMatchObject({ prompt_tokens: 1, completion_tokens: 14, total_tokens: 15 });
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toMatchObject([{ status: "success", stream: true, completionTokens: 14, costMicroUsd: BigInt(10), upstreamCostMicroUsd: BigInt(10) }]);
    // El catálogo mapea el mock con el mismo ID del modelo (catalog/upstreams.ts), así `x_mock` elige el escenario.
    expect(harness.mock.requests[0].body).toMatchObject({ stream_options: { include_usage: true }, model: "qwen/qwen3.8-flash" });
  });

  it.each([false, true])("estimates missing usage including content and reasoning; stream=%s", async (stream) => {
    const harness = await start({ upstreams: scenarioUpstreams("no-usage") });
    const response = await post(harness, { ...basicBody, messages: [{ role: "user", content: [{ type: "text", text: "Hola 🌎" }] }, { role: "system", content: "abc" }], stream, x_mock: { scenario: "no-usage" } });
    await response.text();
    await harness.flushAfter();
    const [record] = await harness.db.select().from(requests);
    expect(record).toMatchObject({ status: "success", usageEstimated: true, promptTokens: 3, completionTokens: 13, costMicroUsd: BigInt(10), upstreamCostMicroUsd: BigInt(1) });
  });

  it("checks host before size and authentication", async () => {
    const harness = await start({ env: { API_HOST: "api.cheaptokens.wtf" } });
    const response = await post(harness, "garbage", { authorization: "invalid" });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { message: "Not found.", type: "invalid_request", code: "invalid_request" } });
    expect(response.headers.get("x-request-id")).toMatch(/^req_/);
    const declared = directRequest(harness, "x", { headers: { "content-length": "4500001" } });
    expect((await handleChatCompletion(declared, directDeps(harness, { env: { apiHost: "other", rateLimitRpm: 60, isProduction: false } }))).status).toBe(404);
    expect(harness.mock.requests).toHaveLength(0);
    expect(await harness.db.select().from(requests)).toHaveLength(0);
  });

  it.each(["api.cheaptokens.wtf", "API.CHEAPTOKENS.WTF", "web.cheaptokens.wtf"])("uses the Host header when Next builds a localhost URL: %s", async (host) => {
    const harness = await start();
    const request = new Request("http://localhost:3000/v1/chat/completions", {
      method: "POST", headers: { host, authorization: `Bearer ${harness.apiKey}` }, body: JSON.stringify(basicBody),
    });
    const response = await handleChatCompletion(request, directDeps(harness, {
      env: { apiHost: "API.CheapTokens.wtf", rateLimitRpm: 60, isProduction: false },
    }));
    expect(response.status).toBe(host === "web.cheaptokens.wtf" ? 404 : 200);
    await response.text();
    expect(harness.mock.requests).toHaveLength(host === "web.cheaptokens.wtf" ? 0 : 1);
  });

  it("rejects oversized declared and streamed bodies before authentication", async () => {
    const harness = await start();
    const deps = directDeps(harness);
    const select = vi.spyOn(harness.db, "select");
    await failure(await handleChatCompletion(directRequest(harness, "x", { headers: { "content-length": "4500001" } }), deps), 413, "request_too_large");
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(1_000_000)); },
      cancel() { cancelled = true; },
    });
    const init: RequestInit & { duplex: "half" } = { method: "POST", body, duplex: "half", headers: { "content-length": "1" } };
    await failure(await handleChatCompletion(new Request(harness.baseUrl, init), deps), 413, "request_too_large");
    expect(cancelled).toBe(true);
    expect(select).not.toHaveBeenCalled();
    select.mockRestore();
    await failure(await post(harness, "x".repeat(4_500_001)), 413, "request_too_large");
    expect(harness.mock.requests).toHaveLength(0);
  });

  it.each(["", "Bearer wrong", `Bearer ${generateKey().key}`])("authenticates before parsing JSON (%s)", async (authorization) => {
    const harness = await start();
    await failure(await post(harness, "{", { authorization }), 401, "invalid_api_key");
    expect(harness.mock.requests).toHaveLength(0);
    expect(await harness.db.select().from(requests)).toHaveLength(0);
  });

  it("rejects revoked keys", async () => {
    const harness = await start();
    await harness.db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, harness.apiKeyId));
    await failure(await post(harness), 401, "invalid_api_key");
  });

  it("applies workspace rate limits before body validation with retry-after", async () => {
    const harness = await start({ env: { GATEWAY_RATE_LIMIT_RPM: "5" } });
    await harness.db.update(workspaces).set({ rateLimitRpm: 1 }).where(eq(workspaces.id, harness.workspaceId));
    await failure(await post(harness, "{"), 400, "invalid_request");
    const limited = await post(harness, "{");
    expect(limited.headers.get("retry-after")).toBe("60");
    await failure(limited, 429, "rate_limit_exceeded");
    expect(await harness.db.select().from(requests)).toHaveLength(0);
  });

  it("uses the global rate limit when the workspace has no override", async () => {
    const harness = await start({ env: { GATEWAY_RATE_LIMIT_RPM: "1" } });
    await failure(await post(harness, "{"), 400, "invalid_request");
    await failure(await post(harness), 429, "rate_limit_exceeded");
  });

  it.each(["{", {}, { model }, { ...basicBody, stream: "yes" }, { ...basicBody, stream_options: { include_usage: 1 } }])("validates JSON and body before model and balance (%j)", async (body) => {
    const harness = await start({ balanceUsd: 0 });
    await failure(await post(harness, body), 400, "invalid_request");
    expect(await harness.db.select().from(requests)).toHaveLength(0);
  });

  it("checks model existence and retirement before account balance", async () => {
    const harness = await start({ balanceUsd: 0, models: CATALOG.map((entry) => entry.id === model ? { ...entry, status: "retired", retiresOn: "2026-11-10" } : entry) });
    await failure(await post(harness, { ...basicBody, model: "unknown/model" }), 404, "model_not_found");
    await failure(await post(harness), 410, "model_retired");
    expect(await harness.db.select().from(requests)).toHaveLength(0);
  });

  it.each(["active", "deprecated"] as const)("allows %s models", async (status) => {
    const harness = await start({ models: CATALOG.map((entry) => entry.id === model ? { ...entry, status, retiresOn: "2026-12-10" } : entry) });
    expect((await post(harness)).status).toBe(200);
  });

  it.each([
    ["insufficient_credits", 402], ["account_suspended", 403], ["key_limit_exceeded", 403],
  ] as const)("checks account: %s", async (code, status) => {
    const harness = await start({ balanceUsd: code === "insufficient_credits" ? 0 : 5 });
    if (code === "account_suspended") await harness.db.update(workspaces).set({ suspendedAt: new Date() });
    if (code === "key_limit_exceeded") await harness.db.update(apiKeys).set({ spendLimitMicroUsd: BigInt(0) });
    await failure(await post(harness), status, code);
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toHaveLength(0);
    expect(harness.logs).toHaveLength(0);
    expect(harness.mock.requests).toHaveLength(0);
  });

  it.each(["error-400", "error-500"])("records failed upstream calls at zero cost: %s", async (scenario) => {
    const harness = await start({ upstreams: scenarioUpstreams(scenario) });
    const response = await post(harness, { ...basicBody, x_mock: { scenario } });
    await failure(response, scenario === "error-400" ? 400 : 502, scenario === "error-400" ? "invalid_request" : "upstream_error");
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: scenario === "error-400" ? "invalid_request" : "upstream_error", costMicroUsd: BigInt(0), upstreamCostMicroUsd: BigInt(0), officialCostMicroUsd: BigInt(0),
    }]);
    expect(harness.logs.filter((line) => line.includes('"request_completed"'))).toHaveLength(1);
  });

  it("records a model with no enabled upstream at zero cost", async () => {
    const harness = await start({ upstreams: UPSTREAMS.map((upstream) => ({ ...upstream, models: upstream.models.map((mapping) => ({ ...mapping, enabled: false })) })) });
    await failure(await post(harness), 503, "no_upstream_available");
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toMatchObject([{ upstreamId: null, attempts: 0, costMicroUsd: BigInt(0) }]);
  });

  it.each([
    ["mid-stream-error", false], ["mid-stream-error", true], ["cut", false], ["cut", true],
  ] as const)("finishes a broken stream with usage before the public error: %s, include_usage=%s", async (scenario, includeUsage) => {
    const harness = await start({ upstreams: scenarioUpstreams(scenario) });
    const response = await post(harness, { ...basicBody, stream: true, stream_options: { include_usage: includeUsage }, x_mock: { scenario, chunkDelayMs: 5 } });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toMatch(/inferhub|provider|source/i);
    const payloads = chunks(text);
    expect(payloads.at(-1)).toMatchObject({ error: { type: "upstream_error", code: "upstream_error" }, choices: [{ index: 0, delta: {}, finish_reason: "error" }] });
    const order = createSseParser().push(new TextEncoder().encode(text)).flatMap((event) => {
      if (event.type !== "data") return [];
      if (event.data === "[DONE]") return ["done"];
      const payload = JSON.parse(event.data) as Record<string, unknown>;
      return ["error" in payload ? "error" : "usage" in payload ? "usage" : "content"];
    });
    expect(order).toEqual([
      ...Array.from({ length: payloads.length - (includeUsage ? 2 : 1) }, () => "content"),
      ...(includeUsage ? ["usage"] : []), "error", "done",
    ]);
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toMatchObject([{ status: "upstream_error", usageEstimated: true, completionTokens: 13, costMicroUsd: BigInt(10) }]);
  });

  it("drains the upstream and charges its full usage after a real HTTP client disconnect", async () => {
    const harness = await start();
    const response = await post(harness, { ...basicBody, stream: true, x_mock: { chunks: 12, chunkDelayMs: 15 } });
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    await harness.flushAfter();
    const [record] = await harness.db.select().from(requests);
    expect(record).toMatchObject({ status: "client_cancelled", completionTokens: 50, usageEstimated: false, costMicroUsd: BigInt(10), upstreamCostMicroUsd: BigInt(10) });
    expect(harness.mock.requests).toHaveLength(1);
    expect(harness.mock.requests[0].clientAborted).toBe(false);
    expect(harness.logs.filter((line) => line.includes('"request_completed"'))).toHaveLength(1);
  });

  it.each(["flushAfter", "close"] as const)("%s waits for a handler cancelled before it registers after()", async (method) => {
    const harness = await start();
    const abort = new AbortController();
    const pending = fetch(`${harness.baseUrl}/chat/completions`, {
      method: "POST", headers: { authorization: `Bearer ${harness.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ ...basicBody, stream: true, x_mock: { latencyMs: 300 } }), signal: abort.signal,
    });
    const timer = setTimeout(() => abort.abort(), 100);
    try {
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      clearTimeout(timer);
    }
    expect(harness.mock.requests).toHaveLength(1);
    await harness[method]();
    if (method === "flushAfter") {
      expect(await harness.db.select().from(requests)).toMatchObject([{
        status: "client_cancelled", completionTokens: 14, usageEstimated: false,
      }]);
    }
    expect(harness.logs.filter((line) => line.includes('"request_completed"'))).toHaveLength(1);
    expect(harness.logs.some((line) => line.includes('"charge_failed"'))).toBe(false);
  });

  it("keeps the upstream error code after a client cancels a failing stream", async () => {
    const harness = await start({ upstreams: scenarioUpstreams("mid-stream-error") });
    const response = await post(harness, { ...basicBody, stream: true, x_mock: { scenario: "mid-stream-error", chunks: 12, chunkDelayMs: 15 } });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "client_cancelled", errorCode: "upstream_error", usageEstimated: true,
    }]);
  });

  it("sanitizes comments received after the first data event", async () => {
    const harness = await start();
    const deps = directDeps(harness, { fetch: async () => new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n: INFERHUB\n\ndata: [DONE]\n\n') });
    const response = await handleChatCompletion(directRequest(harness, JSON.stringify({ ...basicBody, stream: true })), deps);
    const text = await response.text();
    expect(text).toContain(": keep-alive\n\n");
    expect(text).not.toContain("INFERHUB");
  });

  it.each([[false, false], [true, true], [true, false]])("honors the total deadline; streaming=%s, reported usage=%s", async (stream, reportedUsage) => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    const originalTimeout = globalThis.setTimeout;
    const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) =>
      originalTimeout(callback, delay === 790_000 ? 25 : delay, ...args));
    const deps = directDeps(harness, {
      now: () => 1_800_000_000_000,
      after: (task) => tasks.push(task),
      fetch: async (_input, init) => {
        const signal = init?.signal;
        if (!stream) return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("Timeout")), { once: true });
        });
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            const payload = {
              choices: [{ delta: { content: "abcdefgh" } }],
              ...(reportedUsage ? { usage: { prompt_tokens: 100, completion_tokens: 100 } } : {}),
            };
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
            signal?.addEventListener("abort", () => controller.error(new Error("Timeout")), { once: true });
          },
        }));
      },
    });
    const response = await handleChatCompletion(directRequest(harness, JSON.stringify({ ...basicBody, stream })), deps);
    if (stream) {
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(chunks(text).at(-1)).toHaveProperty("error");
      expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
    } else await failure(response, 504, "upstream_timeout");
    await tasks[0]();
    timer.mockRestore();
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "upstream_timeout", httpStatus: stream ? 200 : 504,
      completionTokens: stream ? reportedUsage ? 100 : 2 : 0, promptTokens: stream ? reportedUsage ? 100 : 1 : 0,
      usageEstimated: stream && !reportedUsage, costMicroUsd: BigInt(stream ? 10 : 0),
    }]);
  });

  it("preserves reported usage when the upstream ends cleanly without DONE", async () => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    const deps = directDeps(harness, {
      after: (task) => tasks.push(task),
      fetch: async () => new Response('data: {"choices":[{"delta":{"content":"ok"}}],"usage":{"prompt_tokens":40,"completion_tokens":80,"cost":"0.00002"}}\n\n'),
    });
    const response = await handleChatCompletion(directRequest(harness, JSON.stringify({ ...basicBody, stream: true })), deps);
    const text = await response.text();
    expect(chunks(text).at(-1)).toHaveProperty("error");
    await tasks[0]();
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "upstream_error", promptTokens: 40, completionTokens: 80, usageEstimated: false, upstreamCostMicroUsd: BigInt(20),
    }]);
  });

  it.each([false, true])("estimates tool names and arguments, including fragmented calls; stream=%s", async (stream) => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    const tool = (name: string, args: string, index = 0) => ({ index, type: "function", function: { name, arguments: args } });
    const payloads = [
      { choices: [{ delta: { tool_calls: [tool("abcd", "123456")] } }] },
      { choices: [{ delta: { tool_calls: [tool("efgh", "789012"), tool("tool", "args", 1)] } }] },
    ];
    const deps = directDeps(harness, {
      after: (task) => tasks.push(task),
      fetch: async () => stream
        ? new Response(payloads.map((payload) => `data: ${JSON.stringify(payload)}\n\n`).join("") + "data: [DONE]\n\n")
        : Response.json({ choices: [{ message: { tool_calls: [tool("abcdefgh", "123456789012"), tool("tool", "args", 1)] } }] }),
    });
    const response = await handleChatCompletion(directRequest(harness, JSON.stringify({ ...basicBody, stream })), deps);
    const text = await response.text();
    expect(text).toContain("tool_calls");
    expect(text).not.toContain('"error"');
    await tasks[0]();
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "success", usageEstimated: true, promptTokens: 1, completionTokens: 7, costMicroUsd: BigInt(10),
    }]);
  });

  it.each([
    { label: "role only", payload: { choices: [{ delta: { role: "assistant", content: "", reasoning_content: "", tool_calls: [] } }] }, status: "upstream_error" },
    { label: "finish only", payload: { choices: [{ delta: {}, finish_reason: "stop" }] }, status: "upstream_error" },
    { label: "usage only", payload: { choices: [], usage: { prompt_tokens: 1, completion_tokens: 0 } }, status: "success" },
    { label: "reasoning only", payload: { choices: [{ delta: { reasoning_content: "ok" } }] }, status: "success" },
    { label: "tool start only", payload: { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_one", type: "function" }] } }] }, status: "success" },
  ])("classifies streams without text correctly: $label", async ({ payload, status }) => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    const response = await handleChatCompletion(directRequest(harness, JSON.stringify({ ...basicBody, stream: true })), directDeps(harness, {
      after: (task) => tasks.push(task),
      fetch: async () => new Response(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`),
    }));
    const text = await response.text();
    expect(chunks(text).some((chunk) => "error" in chunk)).toBe(status === "upstream_error");
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
    await tasks[0]();
    expect(await harness.db.select().from(requests)).toMatchObject([{ status }]);
  });

  it("records the attempted upstream by index when targets share a URL", async () => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    const deps = directDeps(harness, { after: (task) => tasks.push(task), now: () => 1_800_000_000_000 });
    const snapshot = await deps.catalog();
    const entry = snapshot.getModel(model)!;
    const target = entry.upstreams[0];
    deps.catalog = async () => ({
      loadedAt: snapshot.loadedAt,
      getModel: () => ({ ...entry, upstreams: [{ ...target, upstreamId: "inferhub" }, target] }),
    });
    const originalTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay, ...args) =>
      originalTimeout(callback, delay === 790_000 ? 25 : delay, ...args));
    let attempts = 0;
    deps.fetch = async (_input, init) => {
      if (++attempts === 1) return new Response(null, { status: 502 });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("Timeout")), { once: true });
      });
    };
    await failure(await handleChatCompletion(directRequest(harness), deps), 504, "upstream_timeout");
    await tasks[0]();
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "upstream_timeout", attempts: 2, upstreamId: "mock", costMicroUsd: BigInt(0),
    }]);
  });

  it("closes and charges the stream when building the final usage chunk throws", async () => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    vi.spyOn(sanitizers, "buildUsageChunk").mockImplementationOnce(() => { throw new Error("secret upstream content"); });
    const response = await handleChatCompletion(directRequest(harness, JSON.stringify({
      ...basicBody, stream: true, stream_options: { include_usage: true },
    })), directDeps(harness, { after: (task) => tasks.push(task) }));
    expect(await response.text()).toContain('"content"');
    await tasks[0]();
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "upstream_error", errorCode: "upstream_error", completionTokens: 14, usageEstimated: false, costMicroUsd: BigInt(10),
    }]);
    expect(harness.logs.filter((line) => line.includes('"request_completed"'))).toHaveLength(1);
    expect(harness.logs.join("\n")).not.toContain("secret");
  });

  it("measures stream latency at completion even when after() runs later", async () => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    let now = 1_800_000_000_000;
    const response = await handleChatCompletion(directRequest(harness, JSON.stringify({ ...basicBody, stream: true })), directDeps(harness, {
      now: () => now, after: (task) => tasks.push(task),
    }));
    await response.text();
    now += 5_000;
    await tasks[0]();
    expect(await harness.db.select().from(requests)).toMatchObject([{ latencyMs: 0 }]);
  });

  it("returns 502 and records upstream_error when sanitizing a completion throws", async () => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    vi.spyOn(sanitizers, "sanitizeCompletion").mockImplementationOnce(() => { throw new Error("secret upstream content"); });
    const response = await handleChatCompletion(directRequest(harness), directDeps(harness, { after: (task) => tasks.push(task) }));
    await failure(response, 502, "upstream_error");
    await tasks[0]();
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "upstream_error", httpStatus: 502, errorCode: "upstream_error", completionTokens: 14, usageEstimated: false,
    }]);
    expect(harness.logs.filter((line) => line.includes('"request_completed"'))).toHaveLength(1);
    expect(harness.logs.join("\n")).not.toContain("secret");
  });

  it("writes one valid JSON line for each logger level", () => {
    const lines: string[] = [];
    const log = createJsonLogger((line) => lines.push(line));
    log.info("first", { requestId: "req_one", count: 1 });
    log.warn("second", { available: false });
    log.error("third", { upstreamId: null });
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { ts: expect.any(String), level: "info", event: "first", requestId: "req_one", count: 1 },
      { ts: expect.any(String), level: "warn", event: "second", available: false },
      { ts: expect.any(String), level: "error", event: "third", upstreamId: null },
    ]);
  });

  it("logs charge failures without leaking the exception or dropping request_completed", async () => {
    const harness = await start();
    const tasks: (() => Promise<void>)[] = [];
    const response = await handleChatCompletion(directRequest(harness), directDeps(harness, { after: (task) => tasks.push(task) }));
    await response.text();
    const transaction = vi.spyOn(harness.db, "transaction").mockRejectedValueOnce(new Error("secret body Authorization"));
    await tasks[0]();
    transaction.mockRestore();
    expect(harness.logs.map((line) => JSON.parse(line).event)).toEqual(["charge_failed", "request_completed"]);
    expect(harness.logs.join("\n")).not.toContain("secret");
    expect(await harness.db.select().from(requests)).toHaveLength(0);
  });
});
