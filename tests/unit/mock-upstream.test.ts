// @vitest-environment node
import { createServer } from "node:http";
import { performance } from "node:perf_hooks";

import { afterEach, describe, expect, it } from "vitest";

import errors from "../fixtures/inferhub/errors.json";
import { startMockUpstream } from "../helpers/mock-upstream";

type MockUpstream = Awaited<ReturnType<typeof startMockUpstream>>;

interface Payload {
  id?: string;
  model?: string;
  created?: number;
  object?: string;
  request_id?: string;
  provider?: string;
  error?: { source: string; code?: string; message?: string };
  choices: {
    delta?: { role?: string; content?: string; reasoning_content?: string };
    message?: { role: string; content: string; reasoning_content: string };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost?: number;
    prompt_tokens_details?: { text_tokens: number; cached_tokens: number };
  } | null;
}

const upstreams: MockUpstream[] = [];

async function start(options?: Parameters<typeof startMockUpstream>[0]): Promise<MockUpstream> {
  const upstream = await startMockUpstream(options);
  upstreams.push(upstream);
  return upstream;
}

function chat(upstream: MockUpstream, body: Record<string, unknown> = {}, headers?: HeadersInit, signal?: AbortSignal): Promise<Response> {
  return fetch(`${upstream.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ model: "alicn/qwen3.8-flash", messages: [{ role: "user", content: "Hola mundo" }], ...body }),
    signal,
  });
}

function streamPayloads(text: string): Payload[] {
  return text.split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => JSON.parse(line.slice(6)) as Payload);
}

afterEach(async () => {
  await Promise.all(upstreams.splice(0).map((upstream) => upstream.close()));
});

describe("mock upstream: respuestas InferHub", () => {
  it("responde JSON con IDs del vendedor, headers y uso determinista", async () => {
    const upstream = await start();
    expect(upstream.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    const response = await chat(upstream, {
      messages: [
        { role: "system", content: "abc" },
        { role: "user", content: [{ type: "text", text: "12345" }, { type: "image_url", image_url: { url: "unused" } }] },
        { role: "assistant", content: null },
        { role: "user", content: "x" },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("x-inferhub-request-id")).toBeTruthy();
    expect(response.headers.get("x-inferhub-publisher")).toMatch(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/);
    expect(response.headers.get("x-inferhub-model")).toBe("alicn/qwen3.8-flash");
    expect(response.headers.get("x-ratelimit-limit")).toBe("1000");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("996");
    const body = await response.json() as Payload;
    expect(body).toMatchObject({
      object: "chat.completion", provider: "inferhub", model: "alicn/qwen3.8-flash",
      request_id: response.headers.get("x-inferhub-request-id"),
      choices: [{ message: { role: "assistant", content: expect.any(String), reasoning_content: expect.any(String) }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 3, completion_tokens: 12, total_tokens: 15, cost: 0.00001,
        prompt_tokens_details: { text_tokens: 3, cached_tokens: 0 },
      },
    });
    expect(body.id).toMatch(/^chatcmpl-/);
    expect(body.id).not.toContain(body.request_id);
  });

  it.each([undefined, { include_usage: true }, { include_usage: false }])("manda ambos usage aunque stream_options sea %j", async (streamOptions) => {
    const upstream = await start();
    const response = await chat(upstream, { stream: true, stream_options: streamOptions });
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    const text = await response.text();
    expect(text.startsWith(": INFERHUB PROCESSING\n\n")).toBe(true);
    expect(text.endsWith("data: [DONE]\n\n")).toBe(true);
    const payloads = streamPayloads(text);
    const reasonIndex = payloads.findIndex((payload) => payload.choices[0]?.delta?.reasoning_content);
    const contentIndex = payloads.findIndex((payload) => payload.choices[0]?.delta?.content);
    expect(reasonIndex).toBeGreaterThan(0);
    expect(contentIndex).toBeGreaterThan(reasonIndex);
    expect(payloads.filter((payload) => payload.choices[0]?.delta?.content)).toHaveLength(3);
    expect(payloads.at(-3)?.choices[0]?.finish_reason).toBe("stop");
    const usages = payloads.filter((payload) => payload.usage);
    expect(usages).toHaveLength(2);
    expect(usages[0]).toMatchObject({
      id: payloads[0].id, model: "alicn/qwen3.8-flash", created: expect.any(Number),
      usage: { prompt_tokens: 3, completion_tokens: 12, total_tokens: 15, prompt_tokens_details: { text_tokens: 3 } },
    });
    expect(usages[0].usage).not.toHaveProperty("cost");
    expect(usages[1]).toMatchObject({ choices: [], object: "chat.completion.chunk", usage: { cost: 0.00001, prompt_tokens: 3, completion_tokens: 12 } });
    for (const field of ["id", "model", "created"]) expect(usages[1]).not.toHaveProperty(field);
  });

  it("calcula el costo por encima del mínimo con asks configurables y fracciones exactas", async () => {
    const upstream = await start({ askInputPer1M: 0.01755, askOutputPer1M: 0.05499 });
    const response = await chat(upstream, { messages: [{ content: "x".repeat(4000) }], x_mock: { chunks: 2 } });
    const body = await response.json() as Payload;
    expect(body.usage).toMatchObject({ prompt_tokens: 1000, completion_tokens: 8, cost: 0.00001798992 });
  });

  it("aplica los asks predeterminados también en streaming", async () => {
    const upstream = await start();
    const response = await chat(upstream, { stream: true, messages: [{ content: "x".repeat(8000) }], x_mock: { chunks: 2 } });
    const payloads = streamPayloads(await response.text());
    expect(payloads.at(-1)?.usage).toMatchObject({ prompt_tokens: 2000, completion_tokens: 8, cost: 0.00002016 });
  });

  it("admite asks en notación científica y cero chunks", async () => {
    const upstream = await start({ askInputPer1M: 1e-7, askOutputPer1M: 1e7 });
    const response = await chat(upstream, { messages: [], x_mock: { chunks: 1 } });
    expect((await response.json() as Payload).usage?.cost).toBe(40);
    const emptyResponse = await chat(upstream, { stream: true, x_mock: { chunks: 0 } });
    const payloads = streamPayloads(await emptyResponse.text());
    expect(payloads.filter((payload) => payload.choices[0]?.delta?.content)).toHaveLength(0);
    expect(payloads.at(-1)?.usage?.completion_tokens).toBe(0);
  });

  it.each([NaN, Infinity, -0.01])("rechaza un ask inválido: %s", async (ask) => {
    await expect(startMockUpstream({ askInputPer1M: ask })).rejects.toThrow(RangeError);
    await expect(startMockUpstream({ askOutputPer1M: ask })).rejects.toThrow(RangeError);
  });
});

describe("mock upstream: errores y control de escenarios", () => {
  it.each([400, 401, 402, 404, 429, 500, 503])("reproduce error-%i", async (status) => {
    const upstream = await start();
    const response = await chat(upstream, { stream: true, model: `mock/error-${status}` });
    expect(response.status).toBe(status);
    expect(response.headers.get("content-type")).toBe("application/json");
    const body = await response.json() as Payload;
    expect(body.error?.source).toBe(status === 400 ? "Qwencloud/Alibaba CN" : "inferhub");
    expect(body).not.toHaveProperty("usage");
    if (status === 400) {
      expect(body.error).toEqual(errors.publisher_400.error);
      expect(body.request_id).toBe(response.headers.get("x-inferhub-request-id"));
    }
    if (status === 401) expect(body).toEqual(errors.invalid_api_key_401);
    if (status === 404) expect(body).toEqual(errors.model_not_found_404);
    if (status === 402) expect(body.error?.code).not.toBe("no_provider_under_bid");
  });

  it("reproduce 402 no_provider_under_bid con los campos del fixture", async () => {
    const upstream = await start({ askInputPer1M: 0.00015, askOutputPer1M: 0.00047 });
    const response = await chat(upstream, { x_mock: { scenario: "error-402-bid" } });
    expect(response.status).toBe(402);
    expect(await response.json()).toEqual(errors.no_provider_under_bid_402);
  });

  it("prioriza header, modelo mock/ y x_mock; los modelos ajenos usan ok", async () => {
    const upstream = await start();
    const byHeader = await chat(upstream, { model: "mock/error-503", x_mock: { scenario: "error-429" } }, { "x-mock-scenario": "error-401" });
    expect(byHeader.status).toBe(401);
    await byHeader.text();
    const byModel = await chat(upstream, { model: "mock/error-503", x_mock: { scenario: "error-429" } });
    expect(byModel.status).toBe(503);
    await byModel.text();
    const byBody = await chat(upstream, { model: "different/model", x_mock: { scenario: "error-429" } });
    expect(byBody.status).toBe(429);
    await byBody.text();
    for (const model of ["unknown/model", "mock/unknown", "mock/toString"]) {
      const response = await chat(upstream, { model });
      expect(response.status).toBe(200);
      await response.text();
    }
    const overridden = await chat(upstream, { model: "mock/error-500", x_mock: { scenario: "error-429" } }, { "x-mock-scenario": "ok" });
    expect(overridden.status).toBe(200);
    await overridden.text();
  });

  it.each(["x-max-input-price", "x-max-output-price"])("rechaza un tope %s por debajo del ask", async (header) => {
    const upstream = await start();
    const response = await chat(upstream, {}, { [header]: "0.009999999" });
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: { code: "no_provider_under_bid", source: "inferhub", min_input_per_mtok: "0.01", min_output_per_mtok: "0.02" } });
  });

  it("acepta topes iguales o mayores y compara notación científica", async () => {
    const upstream = await start();
    for (const headers of [
      { "x-max-input-price": "0.01", "x-max-output-price": "2e-2" },
      { "x-max-input-price": "0.02", "x-max-output-price": "0.03" },
    ]) {
      const response = await chat(upstream, {}, headers);
      expect(response.status).toBe(200);
      await response.text();
    }
    for (const bid of ["0", "-0.001"]) {
      const rejected = await chat(upstream, {}, { "x-max-input-price": bid });
      expect(rejected.status).toBe(402);
      await rejected.text();
    }
  });

  it("envía un error como primer evento de datos con HTTP 200", async () => {
    const upstream = await start();
    const response = await chat(upstream, { stream: true, model: "mock/stream-error-200" });
    expect(response.status).toBe(200);
    const payloads = streamPayloads(await response.text());
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ error: { source: "inferhub" }, choices: [{ finish_reason: "error" }] });
    expect(payloads[0].usage).toBeFalsy();
  });

  it("envía contenido antes del error intermedio, sin usage final", async () => {
    const upstream = await start();
    const response = await chat(upstream, { stream: true, model: "mock/mid-stream-error", x_mock: { chunks: 2 } });
    const payloads = streamPayloads(await response.text());
    expect(payloads.filter((payload) => payload.choices[0]?.delta?.content)).toHaveLength(2);
    expect(payloads.at(-1)).toMatchObject({ error: { source: "inferhub" }, choices: [{ finish_reason: "error" }] });
    expect(payloads.some((payload) => payload.usage)).toBe(false);
  });

  it("corta la conexión después de contenido sin DONE ni usage", async () => {
    const upstream = await start();
    const response = await chat(upstream, { stream: true, model: "mock/cut", x_mock: { chunks: 2, chunkDelayMs: 20 } });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    await expect((async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
    })()).rejects.toThrow();
    const payloads = streamPayloads(text);
    expect(payloads.filter((payload) => payload.choices[0]?.delta?.content)).toHaveLength(2);
    expect(payloads.some((payload) => payload.usage)).toBe(false);
    expect(text).not.toContain("[DONE]");
    expect(upstream.requests[0].clientAborted).toBe(false);
  });

  it.each([false, true])("omite todos los campos usage en no-usage (stream=%s)", async (stream) => {
    const upstream = await start();
    const response = await chat(upstream, { stream, model: "mock/no-usage" });
    const text = await response.text();
    const payloads = stream ? streamPayloads(text) : [JSON.parse(text) as Payload];
    for (const payload of payloads) expect(payload).not.toHaveProperty("usage");
    expect(text).toContain("Hola");
  });

  it("envía únicamente DONE en empty-stream", async () => {
    const upstream = await start();
    const response = await chat(upstream, { stream: true, x_mock: { scenario: "empty-stream" } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("data: [DONE]\n\n");
  });
});

describe("mock upstream: tiempos, registro y cierre", () => {
  it("registra todos los requests en orden con headers normalizados, body y fecha", async () => {
    const upstream = await start();
    const before = Date.now();
    const response = await chat(upstream, { x_mock: { chunks: 1 } }, { Authorization: "Bearer test-only", "X-Max-Input-Price": "0.01", "X-Custom": "test" });
    await response.text();
    const unknown = await fetch(`${upstream.baseUrl}/models`);
    expect(unknown.status).toBe(404);
    await unknown.text();
    expect(upstream.requests).toHaveLength(2);
    expect(upstream.requests[0]).toMatchObject({
      method: "POST", path: "/v1/chat/completions", clientAborted: false,
      headers: { authorization: "Bearer test-only", "x-max-input-price": "0.01", "x-custom": "test" },
      body: { model: "alicn/qwen3.8-flash", messages: [{ role: "user", content: "Hola mundo" }], x_mock: { chunks: 1 } },
    });
    expect(upstream.requests[0].receivedAt).toBeGreaterThanOrEqual(before);
    expect(upstream.requests[0].receivedAt).toBeLessThanOrEqual(Date.now());
    expect(upstream.requests[1]).toMatchObject({ method: "GET", path: "/v1/models", body: null, clientAborted: false });
  });

  it.each([
    { method: "GET", path: "/v1/chat/completions" },
    { method: "POST", path: "/chat/completions" },
    { method: "POST", path: "/v1/other" },
  ])("responde 404 a $method $path", async ({ method, path }) => {
    const upstream = await start();
    const response = await fetch(`${upstream.baseUrl.slice(0, -3)}${path}`, { method });
    expect(response.status).toBe(404);
    await response.text();
    expect(upstream.requests[0]).toMatchObject({ method, path, body: null });
  });

  it("registra JSON inválido como null y mantiene vivo el servidor", async () => {
    const upstream = await start();
    const invalid = await fetch(`${upstream.baseUrl}/chat/completions`, { method: "POST", body: "{" });
    expect(invalid.status).toBe(400);
    await invalid.text();
    expect(upstream.requests[0].body).toBeNull();
    const response = await chat(upstream);
    expect(response.status).toBe(200);
    await response.text();
  });

  it.each([false, true])("retrasa el primer byte y permite configurar los chunks (stream=%s)", async (stream) => {
    const upstream = await start();
    const before = performance.now();
    const response = await chat(upstream, { stream, model: "mock/slow-first-byte", x_mock: { latencyMs: 80, chunks: 2, chunkDelayMs: 40 } });
    expect(performance.now() - before).toBeGreaterThanOrEqual(70);
    const text = await response.text();
    if (stream) {
      expect(performance.now() - before).toBeGreaterThanOrEqual(110);
      expect(streamPayloads(text).filter((payload) => payload.choices[0]?.delta?.content)).toHaveLength(2);
    } else expect((JSON.parse(text) as Payload).usage?.completion_tokens).toBe(8);
  });

  it("slow-first-byte espera 2000 ms por defecto", async () => {
    const upstream = await start();
    const before = performance.now();
    const response = await chat(upstream, { model: "mock/slow-first-byte" });
    expect(performance.now() - before).toBeGreaterThanOrEqual(1950);
    await response.text();
  });

  it("hang acepta la petición sin enviar siquiera los headers hasta el aborto", async () => {
    const upstream = await start();
    const controller = new AbortController();
    let settled = false;
    const response = chat(upstream, { model: "mock/hang" }, undefined, controller.signal);
    void response.then(() => { settled = true; }, () => { settled = true; });
    await expect.poll(() => upstream.requests[0]?.body).toMatchObject({ model: "mock/hang" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
    controller.abort();
    await expect(response).rejects.toMatchObject({ name: "AbortError" });
    await expect.poll(() => upstream.requests[0].clientAborted).toBe(true);
  });

  it("detecta la desconexión durante el stream y cancela la espera pendiente", async () => {
    const upstream = await start();
    const controller = new AbortController();
    const response = await chat(upstream, { stream: true, x_mock: { chunks: 100, chunkDelayMs: 60_000 } }, undefined, controller.signal);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes('"content":"Hola')) {
      const { done, value } = await reader.read();
      expect(done).toBe(false);
      text += decoder.decode(value, { stream: true });
    }
    controller.abort();
    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
    await expect.poll(() => upstream.requests[0].clientAborted).toBe(true);
    await upstream.close();
  });

  it("close interrumpe hang y una latencia larga, es idempotente y libera el puerto", async () => {
    const upstream = await start();
    const requests = [
      chat(upstream, { model: "mock/hang" }),
      chat(upstream, { model: "mock/slow-first-byte", x_mock: { latencyMs: 60_000 } }),
    ];
    const results = Promise.allSettled(requests);
    await expect.poll(() => upstream.requests.filter((request) => request.body !== null).length).toBe(2);
    await upstream.close();
    await upstream.close();
    expect((await results).every((result) => result.status === "rejected")).toBe(true);
    const port = parseInt(new URL(upstream.baseUrl).port, 10);
    const replacement = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        replacement.once("error", reject);
        replacement.listen(port, "127.0.0.1", resolve);
      });
    } finally {
      await new Promise<void>((resolve, reject) => replacement.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("permite iniciar en un puerto concreto y reporta EADDRINUSE", async () => {
    const upstream = await start();
    const port = parseInt(new URL(upstream.baseUrl).port, 10);
    await expect(startMockUpstream({ port })).rejects.toMatchObject({ code: "EADDRINUSE" });
    await upstream.close();
    const replacement = await start({ port });
    expect(replacement.baseUrl).toBe(upstream.baseUrl);
  });
});
