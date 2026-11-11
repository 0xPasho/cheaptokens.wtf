// @vitest-environment node
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import type { CompletionUsage } from "openai/resources/completions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { requests } from "@/lib/db/schema";
import { usdToMicroUsdCeil } from "@/lib/gateway/metering";
import { createSseParser } from "@/lib/gateway/sse";

import { startGatewayHarness } from "../helpers/gateway-harness";

type Harness = Awaited<ReturnType<typeof startGatewayHarness>>;
type CapturedResponse = { headers: Headers; body: Promise<string | null> };

const liveEnabled = process.env.INFERHUB_LIVE === "1" && Boolean(process.env.UPSTREAM_INFERHUB_API_KEY);
const budgetMicroUsd = BigInt(50_000);
const minimumMicroUsd = BigInt(10);
const qwenModel = "qwen/qwen3.8-flash";
const deepseekModel = "deepseek/deepseek-v4.1-flash";
const messages = [{ role: "user", content: "Reply with only: OK" }] as const;
const upstreamUsageSchema = z.looseObject({
  id: z.string().optional(),
  usage: z.looseObject({ cost: z.union([z.number(), z.string()]).optional() }).nullish(),
});

function responsePayloads(body: string, stream: boolean): unknown[] {
  return stream
    ? createSseParser().push(new TextEncoder().encode(body)).flatMap((event) =>
      event.type === "data" && event.data !== "[DONE]" ? [JSON.parse(event.data) as unknown] : [])
    : [JSON.parse(body) as unknown];
}

function reportedUpstreamCost(body: string, stream: boolean): bigint {
  let cost: bigint | undefined;
  for (const payload of responsePayloads(body, stream)) {
    const value = upstreamUsageSchema.parse(payload).usage?.cost;
    if (value !== undefined) cost = usdToMicroUsdCeil(value);
  }
  if (cost === undefined) throw new Error("InferHub did not report usage.cost");
  return cost;
}

describe.skipIf(!liveEnabled)("InferHub live", { concurrent: false, retry: 0 }, () => {
  let harness: Harness | undefined;
  let client: OpenAI;
  let upstreamResponses: CapturedResponse[];
  let clientResponses: CapturedResponse[];
  let totalUpstreamCost = BigInt(0);
  let totalChargedCost = BigInt(0);

  beforeEach(async () => {
    expect(totalUpstreamCost).toBeLessThan(budgetMicroUsd);
    upstreamResponses = [];
    clientResponses = [];
    const nativeFetch = globalThis.fetch;
    // Clonar las respuestas permite comparar el costo original sin cambiar el harness.
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const response = await nativeFetch(input, init);
      const host = new URL(input instanceof Request ? input.url : String(input)).hostname;
      const capture = {
        headers: new Headers(response.headers),
        body: response.clone().text().catch(() => null),
      };
      if (host === "api.inferhub.dev") upstreamResponses.push(capture);
      else if (host === "127.0.0.1") clientResponses.push(capture);
      return response;
    });
    harness = await startGatewayHarness({
      env: { UPSTREAM_INFERHUB_API_KEY: process.env.UPSTREAM_INFERHUB_API_KEY },
    });
    // Tres llamadas pequeñas, sin reintentos del SDK ni de Vitest, limitan el gasto.
    client = new OpenAI({
      baseURL: harness.baseUrl, apiKey: harness.apiKey,
      fetch: globalThis.fetch, maxRetries: 0, timeout: 90_000,
    });
  }, 30_000);

  afterEach(async () => {
    try {
      await harness?.close();
    } finally {
      harness = undefined;
      vi.restoreAllMocks();
    }
  }, 30_000);

  async function verifyRequest(label: string, model: string, stream: boolean, usage: CompletionUsage | undefined | null) {
    if (!harness) throw new Error("Gateway harness is not running");
    await harness.flushAfter();
    expect(clientResponses).toHaveLength(1);
    expect(upstreamResponses).toHaveLength(1);
    const response = clientResponses[0];
    const body = await response.body;
    const upstreamBody = await upstreamResponses[0].body;
    if (body === null || upstreamBody === null) throw new Error("Could not read the captured response");

    const headers = JSON.stringify([...response.headers]);
    const wire = `${headers}\n${body}`;
    expect(wire).not.toMatch(/inferhub|x-inferhub|request_id|"(?:source|provider|system_fingerprint|cost|text_tokens|image_tokens)"|alicn\/|Qwencloud|Alibaba CN/i);
    // Los IDs de tool_calls sí pasan: solo buscamos el ID original de la respuesta.
    for (const payload of responsePayloads(upstreamBody, stream)) {
      const upstreamId = upstreamUsageSchema.parse(payload).id;
      if (upstreamId) expect(wire).not.toContain(upstreamId);
    }
    expect([...response.headers.keys()].some((name) => name.startsWith("x-ratelimit-"))).toBe(false);
    for (const [name, value] of upstreamResponses[0].headers) {
      if (name.startsWith("x-inferhub-")) {
        expect(response.headers.has(name)).toBe(false);
        if (value.length > 8) expect(wire).not.toContain(value);
      }
    }
    expect(usage?.prompt_tokens).toBeGreaterThan(0);
    expect(usage?.completion_tokens).toBeGreaterThan(0);

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^req_[a-f0-9]{32}$/);
    const id = requestId?.slice(4).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
    if (!id) throw new Error("Missing gateway request ID");
    const records = await harness.db.select().from(requests).where(eq(requests.id, id));
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record).toMatchObject({
      workspaceId: harness.workspaceId, apiKeyId: harness.apiKeyId, modelId: model,
      upstreamId: "inferhub", attempts: 1, stream, status: "success", httpStatus: 200,
      usageEstimated: false, promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
    });
    expect(record.upstreamCostMicroUsd).toBeGreaterThan(BigInt(0));
    expect(record.upstreamCostMicroUsd).toBeGreaterThanOrEqual(minimumMicroUsd);
    expect(record.upstreamCostMicroUsd).toBe(reportedUpstreamCost(upstreamBody, stream));
    expect(record.costMicroUsd).toBeGreaterThanOrEqual(minimumMicroUsd);
    expect(harness.mock.requests).toHaveLength(0);

    totalUpstreamCost += record.upstreamCostMicroUsd;
    totalChargedCost += record.costMicroUsd;
    process.stdout.write(JSON.stringify({
      case: label, model, promptTokens: record.promptTokens, completionTokens: record.completionTokens,
      chargedMicroUsd: record.costMicroUsd.toString(), upstreamMicroUsd: record.upstreamCostMicroUsd.toString(),
      latencyMs: record.latencyMs, ttfbMs: record.ttfbMs,
      totalUpstreamMicroUsd: totalUpstreamCost.toString(), totalChargedMicroUsd: totalChargedCost.toString(),
    }) + "\n");
    expect(totalUpstreamCost).toBeLessThan(budgetMicroUsd);
    expect(totalChargedCost).toBeLessThan(budgetMicroUsd);
  }

  it("returns a completion and bills InferHub's reported cost", async () => {
    const completion = await client.chat.completions.create({
      model: qwenModel, messages: [...messages], reasoning_effort: "none", max_tokens: 16,
    });
    expect(completion.model).toBe(qwenModel);
    expect(completion.id).toMatch(/^chatcmpl-req_[a-f0-9]{32}$/);
    expect(completion.choices[0]?.message.content?.trim()).toMatch(/^OK[.!]?$/i);
    expect(completion.choices[0]?.finish_reason).toBe("stop");
    await verifyRequest("non-stream", qwenModel, false, completion.usage);
  });

  it("streams content and exactly one consolidated usage", async () => {
    const stream = await client.chat.completions.create({
      model: qwenModel, messages: [...messages], reasoning_effort: "none", max_tokens: 16,
      stream: true, stream_options: { include_usage: true },
    });
    let content = "";
    let finishReason: string | null = null;
    const usages: CompletionUsage[] = [];
    for await (const chunk of stream) {
      expect(chunk.model).toBe(qwenModel);
      expect(chunk.id).toMatch(/^chatcmpl-req_[a-f0-9]{32}$/);
      for (const choice of chunk.choices) {
        content += choice.delta.content ?? "";
        finishReason = choice.finish_reason ?? finishReason;
      }
      if (chunk.usage) {
        expect(chunk.choices).toEqual([]);
        usages.push(chunk.usage);
      }
    }
    expect(content.trim()).toMatch(/^OK[.!]?$/i);
    expect(finishReason).toBe("stop");
    expect(usages).toHaveLength(1);
    expect(await clientResponses[0].body).toMatch(/data: \[DONE\]\s*$/);
    await verifyRequest("stream", qwenModel, true, usages[0]);
  });

  it("returns a DeepSeek tool call with valid arguments", async () => {
    const completion = await client.chat.completions.create({
      model: deepseekModel, reasoning_effort: "low", max_tokens: 300,
      messages: [{ role: "user", content: "Call get_weather for Paris." }],
      tools: [{
        type: "function",
        function: {
          name: "get_weather", description: "Get the weather for a city.",
          parameters: {
            type: "object", properties: { city: { type: "string" } },
            required: ["city"], additionalProperties: false,
          },
        },
      }],
      tool_choice: "auto",
    });
    expect(completion.model).toBe(deepseekModel);
    expect(completion.id).toMatch(/^chatcmpl-req_[a-f0-9]{32}$/);
    const choice = completion.choices[0];
    expect(choice?.finish_reason).toBe("tool_calls");
    expect(choice?.message.tool_calls).toHaveLength(1);
    const call = choice?.message.tool_calls?.[0];
    if (call?.type !== "function") throw new Error("Expected a function tool call");
    expect(call.id).not.toBe("");
    expect(call.function.name).toBe("get_weather");
    expect(JSON.parse(call.function.arguments)).toEqual({ city: "Paris" });
    await verifyRequest("tools", deepseekModel, false, completion.usage);
  });
});
