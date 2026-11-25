// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { requests, workspaces } from "@/lib/db/schema";
import { chargeForUpstreamCost } from "@/lib/gateway/metering";
import { createSseParser } from "@/lib/gateway/sse";

import { startGatewayHarness, type GatewayHarnessOptions } from "../helpers/gateway-harness";
import { MOCK_THINKING_SIGNATURE } from "../helpers/mock-upstream";

type Harness = Awaited<ReturnType<typeof startGatewayHarness>>;
const harnesses: Harness[] = [];

async function start(options?: GatewayHarnessOptions) {
  const harness = await startGatewayHarness(options);
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

/** Lo que manda Claude Code: su nombre de modelo, `max_tokens` grande y la key en `x-api-key`. */
const body = (extra: Record<string, unknown> = {}) => ({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 4096,
  system: [{ type: "text", text: "You are a careful coding agent.", cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: [{ type: "text", text: "Lee el archivo y dime qué hace." }] }],
  ...extra,
});

function post(harness: Harness, payload: unknown, headers: Record<string, string> = {}, path = "/v1/messages") {
  return fetch(`${harness.anthropicBaseUrl}${path}`, {
    method: "POST",
    headers: { "x-api-key": harness.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

async function events(response: Response) {
  const parser = createSseParser();
  const text = await response.text();
  const parsed = [...parser.push(new TextEncoder().encode(text)), ...parser.flush()];
  return {
    text,
    names: [...text.matchAll(/^event: (.+)$/gm)].map((match) => match[1]),
    payloads: parsed.flatMap((event) => event.type === "data" ? [JSON.parse(event.data) as Record<string, unknown>] : []),
  };
}

async function balance(harness: Harness) {
  const [workspace] = await harness.db.select().from(workspaces).where(eq(workspaces.id, harness.workspaceId));
  return workspace.balanceMicroUsd;
}

describe("POST /anthropic/v1/messages", () => {
  it("answers in Anthropic's format, keeps the thinking signature and hides the upstream", async () => {
    const harness = await start();
    const response = await post(harness, body({ x_mock: { cacheRead: 1200, cacheWrite: 300 } }), { "anthropic-beta": "interleaved-thinking-2025-05-14,future-beta-2099" });
    expect(response.status).toBe(200);
    const requestId = response.headers.get("request-id");
    expect(requestId).toMatch(/^req_[0-9a-f]{32}$/);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect([...response.headers.keys()].some((name) => name.startsWith("x-inferhub"))).toBe(false);

    const message = await response.json() as Record<string, unknown>;
    expect(message).toMatchObject({
      id: `msg_${requestId!.slice(4)}`, type: "message", role: "assistant", model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn", stop_sequence: null,
    });
    expect(message).not.toHaveProperty("provider");
    expect(message).not.toHaveProperty("request_id");
    expect((message.content as Record<string, unknown>[])[0]).toEqual({ type: "thinking", thinking: "We need answer in Spanish.", signature: MOCK_THINKING_SIGNATURE });
    expect(message.usage).toEqual({ input_tokens: expect.any(Number), output_tokens: expect.any(Number), cache_creation_input_tokens: 300, cache_read_input_tokens: 1200 });

    // Al upstream: su modelo, el path de Anthropic, los headers del formato y nunca la key del cliente.
    const [upstream] = harness.mock.requests;
    expect(upstream.path).toBe("/v1/messages");
    expect(upstream.headers["anthropic-version"]).toBe("2023-06-01");
    expect(upstream.headers["anthropic-beta"]).toBe("interleaved-thinking-2025-05-14,future-beta-2099");
    expect(upstream.headers["x-api-key"]).toBeUndefined();
    expect(JSON.stringify(upstream.headers)).not.toContain(harness.apiKey);
    expect(upstream.body).toMatchObject({ model: "anthropic/claude-haiku-4.5", max_tokens: 4096 });
  });

  it("charges what the upstream reported, cache included, and releases the hold", async () => {
    const harness = await start();
    const before = await balance(harness);
    const response = await post(harness, body({ x_mock: { cacheRead: 5000, cacheWrite: 1000 } }));
    const message = await response.json() as { usage: Record<string, number> };
    await harness.flushAfter();

    const [record] = await harness.db.select().from(requests);
    const usage = message.usage;
    expect(record).toMatchObject({
      status: "success", stream: false, usageEstimated: false, cachedTokens: 5000,
      promptTokens: usage.input_tokens + 1000 + 5000, completionTokens: usage.output_tokens,
    });
    // El costo de InferHub (`usage.cost`) con el margen, como en `/v1/chat/completions` (ADR-0054).
    expect(record.costMicroUsd).toBe(chargeForUpstreamCost(record.upstreamCostMicroUsd, record.completionTokens));
    expect(await balance(harness)).toBe(before - record.costMicroUsd);
    expect(harness.holds.held(harness.workspaceId, harness.apiKeyId, harness.holds.mark())).toEqual({ workspace: BigInt(0), key: BigInt(0) });
  });

  it("accepts the key as Authorization: Bearer and resolves our model IDs too", async () => {
    const harness = await start();
    const response = await fetch(`${harness.anthropicBaseUrl}/v1/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${harness.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body({ model: "anthropic/claude-haiku-4.5" })),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ model: "anthropic/claude-haiku-4.5" });
    // Sin `anthropic-version`, va el único que publica Anthropic.
    expect(harness.mock.requests[0].headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("streams Anthropic's named events in order, with the signature untouched", async () => {
    const harness = await start();
    const response = await post(harness, body({ stream: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const { names, payloads, text } = await events(response);
    expect(names).toEqual([
      "message_start", "ping",
      "content_block_start", "content_block_delta", "content_block_delta", "content_block_delta", "content_block_stop",
      "content_block_start", "content_block_delta", "content_block_delta", "content_block_delta", "content_block_stop",
      "message_delta", "message_stop",
    ]);
    expect(payloads.map((payload) => payload.type)).toEqual(names);
    expect(payloads[0]).toMatchObject({ message: { id: expect.stringMatching(/^msg_/), model: "claude-haiku-4-5-20251001", content: [] } });
    expect(payloads).toContainEqual({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: MOCK_THINKING_SIGNATURE } });
    expect(payloads.at(-2)).toEqual({ type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: expect.any(Number) } });
    // Nada del upstream: ni su comentario, ni `provider`, ni el `cost`.
    expect(text).not.toMatch(/inferhub|"cost"|provider/i);
    await harness.flushAfter();
    const [record] = await harness.db.select().from(requests);
    expect(record).toMatchObject({ status: "success", stream: true, usageEstimated: false });
    expect(record.upstreamCostMicroUsd).toBeGreaterThan(BigInt(0));
  });

  it("streams tool use as input_json_delta", async () => {
    const harness = await start();
    const { payloads } = await events(await post(harness, body({ stream: true, x_mock: { scenario: "tool-use" } })));
    const partial = payloads.filter((payload) => (payload.delta as Record<string, unknown> | undefined)?.type === "input_json_delta")
      .map((payload) => (payload.delta as { partial_json: string }).partial_json).join("");
    expect(JSON.parse(partial)).toEqual({ location: "Ciudad de México", unit: "celsius" });
    expect(payloads).toContainEqual(expect.objectContaining({ type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null } }));
  });

  it("bills a cost that arrives after message_stop without sending it to the client", async () => {
    const harness = await start();
    const { names, text } = await events(await post(harness, body({ stream: true, x_mock: { scenario: "late-cost" } })));
    expect(names.at(-1)).toBe("message_stop");
    expect(text).not.toContain("inferhub_usage");
    await harness.flushAfter();
    const [record] = await harness.db.select().from(requests);
    expect(record.upstreamCostMicroUsd).toBeGreaterThan(BigInt(0));
    expect(record.costMicroUsd).toBe(chargeForUpstreamCost(record.upstreamCostMicroUsd, record.completionTokens));
  });

  it("turns a mid-stream failure into an error event and charges what was generated", async () => {
    const harness = await start();
    const { names, payloads } = await events(await post(harness, body({ stream: true, x_mock: { scenario: "mid-stream-error" } })));
    expect(names.at(-1)).toBe("error");
    expect(payloads.at(-1)).toEqual({ type: "error", error: { type: "api_error", message: "The model failed while generating the response." } });
    await harness.flushAfter();
    const [record] = await harness.db.select().from(requests);
    expect(record).toMatchObject({ status: "upstream_error", errorCode: "upstream_error", usageEstimated: true });
    // `message_start` dice 1 token de salida; lo que llegó antes del error son 3 trozos de texto más el thinking.
    const generated = payloads.flatMap((payload) => {
      const delta = payload.delta as Record<string, unknown> | undefined;
      return typeof delta?.text === "string" ? [delta.text] : typeof delta?.thinking === "string" ? [delta.thinking] : [];
    }).join("");
    expect(record.completionTokens).toBe(Math.ceil([...generated].length / 4));
    expect(record.completionTokens).toBeGreaterThan(1);
  });

  it("refuses with a clear billing error instead of cutting a large max_tokens short", async () => {
    const harness = await start({ balanceUsd: "0.01" });
    const response = await post(harness, body({ max_tokens: 64_000 }));
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      type: "error",
      error: { type: "billing_error", message: expect.stringContaining("Your credits do not cover this request") },
    });
    // Nunca llegó al modelo: no hay respuesta cortada ni cobro.
    expect(harness.mock.requests).toHaveLength(0);
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toHaveLength(0);
  });

  it("answers errors with Anthropic's types and statuses", async () => {
    const harness = await start();
    const unauthorized = await fetch(`${harness.anthropicBaseUrl}/v1/messages`, {
      method: "POST", headers: { "x-api-key": "wtf_nope", "content-type": "application/json" }, body: JSON.stringify(body()),
    });
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({ type: "error", error: { type: "authentication_error" } });

    const missing = await post(harness, { model: "claude-haiku-4-5", messages: [{ role: "user", content: "hi" }] });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ type: "error", error: { type: "invalid_request_error", message: expect.stringContaining("max_tokens") } });

    const unknown = await post(harness, body({ model: "claude-nonexistent-9" }));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ type: "error", error: { type: "not_found_error" } });

    const rejected = await post(harness, body({ x_mock: { scenario: "error-400" } }));
    expect(rejected.status).toBe(400);
    const rejectedBody = await rejected.json() as { error: { message: string } };
    expect(rejectedBody).toMatchObject({ type: "error", error: { type: "invalid_request_error" } });
    expect(rejectedBody.error.message).not.toMatch(/qwencloud|alibaba|inferhub/i);

    const failed = await post(harness, body({ x_mock: { scenario: "error-500" } }));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ type: "error", error: { type: "api_error" } });
    expect(failed.headers.get("request-id")).toMatch(/^req_/);
  });
});

describe("POST /anthropic/v1/messages/count_tokens", () => {
  it("estimates locally, without calling the model or charging", async () => {
    const harness = await start();
    const before = await balance(harness);
    const response = await post(harness, { model: "claude-haiku-4-5", messages: [{ role: "user", content: "Cuenta los tokens de este mensaje." }] }, {}, "/v1/messages/count_tokens");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ input_tokens: expect.any(Number) });
    expect(harness.mock.requests).toHaveLength(0);
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toHaveLength(0);
    expect(await balance(harness)).toBe(before);

    const unknown = await post(harness, { model: "claude-nonexistent-9", messages: [{ role: "user", content: "hi" }] }, {}, "/v1/messages/count_tokens");
    expect(unknown.status).toBe(404);
  });
});
