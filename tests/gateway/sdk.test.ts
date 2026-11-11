// @vitest-environment node
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { afterEach, describe, expect, it } from "vitest";

import { UPSTREAMS } from "@catalog/upstreams";

import { apiKeys, requests, workspaces } from "@/lib/db/schema";

import { startGatewayHarness } from "../helpers/gateway-harness";

type GatewayHarness = Awaited<ReturnType<typeof startGatewayHarness>>;

const harnesses: GatewayHarness[] = [];
const model = "anthropic/claude-haiku-4.5";
const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: "user", content: "Hola" }];
const expectedContent = "Hola 🌎. ".repeat(3);
const expectedUsage = {
  prompt_tokens: 1, completion_tokens: 14, total_tokens: 15,
  prompt_tokens_details: { cached_tokens: 0 },
  completion_tokens_details: { reasoning_tokens: 2 },
};
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [{
  type: "function",
  function: {
    name: "get_weather",
    parameters: {
      type: "object",
      properties: { location: { type: "string" }, unit: { type: "string", enum: ["celsius"] } },
      required: ["location", "unit"],
    },
  },
}];
const toolChoice = { type: "function", function: { name: "get_weather" } } as const;
const expectedToolCalls = [{
  id: "call_mock_weather", type: "function",
  function: { name: "get_weather", arguments: '{"location":"Ciudad de México","unit":"celsius"}' },
}];

async function start(options?: Parameters<typeof startGatewayHarness>[0]) {
  const harness = await startGatewayHarness(options);
  harnesses.push(harness);
  const client = new OpenAI({ baseURL: harness.baseUrl, apiKey: harness.apiKey, maxRetries: 0 });
  return { harness, client };
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

describe("contrato del gateway con el SDK oficial de OpenAI", () => {
  it("devuelve contenido, identidad pública y usage sin campos extra sin stream", async () => {
    const { client } = await start();
    const { data, response } = await client.chat.completions.create({ model, messages }).withResponse();

    expect(data.object).toBe("chat.completion");
    expect(data.id).toMatch(/^chatcmpl-req_[a-f0-9]{32}$/);
    expect(data.id).toBe(`chatcmpl-${response.headers.get("x-request-id")}`);
    expect(data.model).toBe(model);
    expect(data.choices).toEqual([{
      index: 0, finish_reason: "stop",
      message: { role: "assistant", content: expectedContent, reasoning_content: "We need answer in Spanish." },
    }]);
    expect(data.usage).toEqual(expectedUsage);
  });

  it.each([undefined, { include_usage: false }, { include_usage: true }])(
    "arma texto y razonamiento con stream_options=%j y respeta el usage solicitado",
    async (streamOptions) => {
      const { client, harness } = await start();
      const { data: stream, response } = await client.chat.completions.create({
        model, messages, stream: true,
        ...(streamOptions === undefined ? {} : { stream_options: streamOptions }),
      }).withResponse();
      const chunks: OpenAI.Chat.Completions.ChatCompletionChunk[] = [];
      let content = "";
      let reasoning = "";
      for await (const chunk of stream) {
        chunks.push(chunk);
        expect(chunk.id).toBe(`chatcmpl-${response.headers.get("x-request-id")}`);
        expect(chunk.id).toMatch(/^chatcmpl-req_[a-f0-9]{32}$/);
        expect(chunk.model).toBe(model);
        const delta = chunk.choices[0]?.delta;
        content += delta?.content ?? "";
        // El SDK conserva la extensión aunque no forme parte de sus tipos.
        if (delta && "reasoning_content" in delta && typeof delta.reasoning_content === "string") {
          reasoning += delta.reasoning_content;
        }
      }
      expect(content).toBe(expectedContent);
      expect(reasoning).toBe("We need answer in Spanish.");
      const usageChunks = chunks.filter((chunk) => chunk.usage != null);
      if (streamOptions?.include_usage) {
        expect(usageChunks).toHaveLength(1);
        expect(chunks.at(-1)).toBe(usageChunks[0]);
        expect(usageChunks[0].choices).toEqual([]);
        expect(usageChunks[0].usage).toEqual(expectedUsage);
      } else {
        expect(usageChunks).toHaveLength(0);
      }
      expect(chunks.filter((chunk) => chunk.choices[0]?.finish_reason === "stop")).toHaveLength(1);
      // El gateway pide uso al upstream incluso cuando el cliente no lo solicita.
      expect(harness.mock.requests).toHaveLength(1);
      expect(harness.mock.requests[0].body).toMatchObject({ stream_options: { include_usage: true } });
    },
  );

  it.each([false, true])("el SDK recibe y arma tool_calls (stream=%s)", async (stream) => {
    const toolModel = "deepseek/deepseek-v4.1-flash";
    const { client, harness } = await start({
      upstreams: UPSTREAMS.filter((upstream) => upstream.id === "mock").map((upstream) => ({
        ...upstream,
        models: upstream.models.map((mapping) => ({ ...mapping, upstreamModel: "mock/tool-call" })),
      })),
    });
    const body = { model: toolModel, messages, tools, tool_choice: toolChoice };
    let completion: OpenAI.Chat.Completions.ChatCompletion;
    if (stream) {
      const runner = client.chat.completions.stream(body);
      const chunks: OpenAI.Chat.Completions.ChatCompletionChunk[] = [];
      for await (const chunk of runner) chunks.push(chunk);
      expect(chunks.filter((chunk) => chunk.choices[0]?.delta.tool_calls)).toHaveLength(4);
      completion = await runner.finalChatCompletion();
    } else {
      completion = await client.chat.completions.create({ ...body, stream: false });
    }
    expect(completion.model).toBe(toolModel);
    expect(completion.id).toMatch(/^chatcmpl-req_[a-f0-9]{32}$/);
    expect(completion.choices[0].finish_reason).toBe("tool_calls");
    expect(completion.choices[0].message.content).toBeNull();
    expect(completion.choices[0].message.tool_calls).toEqual(expectedToolCalls);
    expect(harness.mock.requests).toHaveLength(1);
    expect(harness.mock.requests[0].body).toMatchObject({
      model: "mock/tool-call", tools, tool_choice: toolChoice, stream,
    });
  });

  it.each([
    { status: 401, code: "invalid_api_key" },
    { status: 404, code: "model_not_found" },
    { status: 402, code: "insufficient_credits" },
    { status: 429, code: "rate_limit_exceeded" },
  ])("expone $status $code como APIError con x-request-id", async ({ status, code }) => {
    const { harness, client } = await start({
      ...(status === 402 ? { balanceUsd: "0" } : {}),
      ...(status === 429 ? { env: { GATEWAY_RATE_LIMIT_RPM: "1" } } : {}),
    });
    if (status === 401) client.apiKey = "wtf_invalid";
    if (status === 429) await client.chat.completions.create({ model, messages });

    expect(client.maxRetries).toBe(0);
    const result = client.chat.completions.create({ model: status === 404 ? "unknown/model" : model, messages });
    const error: unknown = await result.catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(OpenAI.APIError);
    if (!(error instanceof OpenAI.APIError)) throw new Error("Expected SDK APIError");
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.type).toBe(code);
    expect(error.headers?.get("x-request-id")).toMatch(/^req_[a-f0-9]{32}$/);
    expect(error.requestID).toBe(error.headers?.get("x-request-id"));
    if (status === 429) expect(error.headers?.get("retry-after")).toMatch(/^[1-9]\d*$/);
    expect(harness.mock.requests).toHaveLength(status === 429 ? 1 : 0);
  });

  it("cobra el stream completo tras abortarlo desde el SDK y sigue atendiendo requests", async () => {
    const { harness, client } = await start();
    const [workspaceBefore] = await harness.db.select().from(workspaces).where(eq(workspaces.id, harness.workspaceId));
    const controller = new AbortController();
    const body = { model, messages, stream: true as const, x_mock: { chunks: 6, chunkDelayMs: 50 } };
    const { data: stream, response } = await client.chat.completions.create(body, { signal: controller.signal }).withResponse();
    let content = "";
    const consume = async () => {
      for await (const chunk of stream) {
        content += chunk.choices[0]?.delta.content ?? "";
        if (content === expectedContent) controller.abort();
      }
    };
    await consume();
    expect(controller.signal.aborted).toBe(true);
    expect(content).toBe(expectedContent);

    await harness.flushAfter();
    const records = await harness.db.select().from(requests);
    expect(records).toHaveLength(1);
    const [record] = records;
    expect(`req_${record.id.replaceAll("-", "")}`).toBe(response.headers.get("x-request-id"));
    expect(record).toMatchObject({
      workspaceId: harness.workspaceId, apiKeyId: harness.apiKeyId, modelId: model,
      status: "client_cancelled", stream: true, usageEstimated: false,
      promptTokens: 1, completionTokens: 26,
    });
    // ceil((1 × 220000 + 26 × 1100000) / 1000000) = 29 µUSD, por encima del mínimo.
    expect(record.costMicroUsd).toBe(BigInt(29));
    expect(record.upstreamCostMicroUsd).toBe(BigInt(10));
    const [workspaceAfter] = await harness.db.select().from(workspaces).where(eq(workspaces.id, harness.workspaceId));
    const [keyAfter] = await harness.db.select().from(apiKeys).where(eq(apiKeys.id, harness.apiKeyId));
    expect(workspaceBefore.balanceMicroUsd - workspaceAfter.balanceMicroUsd).toBe(record.costMicroUsd);
    expect(keyAfter.spentMicroUsd).toBe(record.costMicroUsd);
    expect(harness.mock.requests[0].clientAborted).toBe(false);

    const next = await client.chat.completions.create({ model, messages });
    expect(next.choices[0].message.content).toBe(expectedContent);
    expect(harness.mock.requests).toHaveLength(2);
  });
});
