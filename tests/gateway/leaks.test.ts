// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CATALOG } from "@catalog/models";

import type { UpstreamDefinition } from "@/lib/catalog/types";
import { requests } from "@/lib/db/schema";

import { startGatewayHarness } from "../helpers/gateway-harness";

type Harness = Awaited<ReturnType<typeof startGatewayHarness>>;

interface Capture {
  status: number;
  headers: [string, string][];
  bytes: Uint8Array[];
}

interface Scenario {
  name: string;
  chunks?: number;
  chunkDelayMs?: number;
  latencyMs?: number;
}

const nativeFetch = globalThis.fetch;
const promptMarker = `privacy-prompt-${randomUUID()}`;
const markedPrompt = `privacy-content-probe-${randomUUID()}`;
const responseMarker = `privacy-answer-${randomUUID()}`;
const headerMarker = `privacy-header-${randomUUID()}`;
// Se incorporan escenarios nuevos (incluido tool-call) al integrar cambios del mock.
const mockSource = readFileSync(new URL("../helpers/mock-upstream.ts", import.meta.url), "utf8");
const discoveredScenarios = [...mockSource.matchAll(/(?<!typeof )\bscenario\s*(?:===|!==)\s*"([^"]+)"/g)].map((match) => match[1]);
const scenarios: Scenario[] = [
  { name: "ok" },
  { name: "no-usage" },
  { name: "slow-first-byte" },
  { name: "slow-first-byte:25" },
  { name: "reset" },
  { name: "hang" },
  { name: "error-402-bid" },
  { name: "empty-stream" },
  { name: "stream-error-200" },
  { name: "mid-stream-error" },
  { name: "cut", chunks: 2, chunkDelayMs: 5 },
  { name: "ok", chunks: 0 },
  { name: "ok", chunks: 5, chunkDelayMs: 5, latencyMs: 5 },
  // El mock admite cualquier error HTTP 4xx/5xx, además de sus errores con fixture.
  ...Array.from({ length: 200 }, (_, index) => ({ name: `error-${400 + index}` })),
];
for (const name of discoveredScenarios) {
  if (!scenarios.some((scenario) => scenario.name === name)) scenarios.push({ name });
}
const cases = scenarios.map((scenario, index) => ({ ...scenario, model: `leaks/case-${index}` }));
const captures: (Capture & { upstreamModel: string | undefined })[] = [];
let harness: Harness;

function bodyText(capture: Capture): string {
  return Buffer.concat(capture.bytes).toString("utf8");
}

async function captureClient(response: Response): Promise<Capture> {
  const capture: Capture = { status: response.status, headers: [...response.headers], bytes: [] };
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        capture.bytes.push(value.slice());
      }
    } finally {
      reader.releaseLock();
    }
  }
  return capture;
}

// La sonda agrega contenido único y un comentario que sí llega al handler.
function markContent(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let injectedComment = false;
  const marked = (text: string) => {
    let output = text.replaceAll("Hola 🌎. ", responseMarker);
    if (!injectedComment && /^data: /m.test(output)) {
      output = output.replace(/(^data: [^\n]*\n)\n/m, "$1\n: INFERHUB PROCESSING\n\n");
      injectedComment = true;
    }
    return encoder.encode(output);
  };
  return new TransformStream({
    transform(bytes, controller) {
      pending += decoder.decode(bytes, { stream: true });
      const end = pending.lastIndexOf("\n\n");
      if (end >= 0) {
        controller.enqueue(marked(pending.slice(0, end + 2)));
        pending = pending.slice(end + 2);
      }
    },
    flush(controller) {
      controller.enqueue(marked(pending + decoder.decode()));
    },
  });
}

const observeUpstream: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "127.0.0.1") throw new Error("Only loopback upstreams are allowed");
  const response = await nativeFetch(input, init);
  const capture = {
    status: response.status, headers: [...response.headers], bytes: [] as Uint8Array[],
    upstreamModel: /"model"\s*:\s*"([^"]+)"/.exec(String(init?.body ?? ""))?.[1],
  };
  captures.push(capture);
  let body = response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      capture.bytes.push(bytes.slice());
      controller.enqueue(bytes);
    },
  })) ?? null;
  const headers = new Headers(response.headers);
  if (body && typeof init?.body === "string" && init.body.includes(markedPrompt)) {
    body = body.pipeThrough(markContent());
    headers.delete("content-length");
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
};

function chat(model: string, stream: boolean, control: Record<string, unknown> = {}, prompt = promptMarker, includeUsage?: boolean, target = harness) {
  return nativeFetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${target.apiKey}`,
      "x-mock": headerMarker,
      "x-mock-scenario": headerMarker,
    },
    body: JSON.stringify({
      model, stream, messages: [{ role: "user", content: prompt }], x_mock: control,
      ...(includeUsage === undefined ? {} : { stream_options: { include_usage: includeUsage } }),
    }),
  }).then(captureClient);
}

const forbiddenKeys = new Set([
  "source", "request_id", "provider", "cost", "text_tokens", "image_tokens",
  "upstream_id", "upstreamid", "system_fingerprint", "x_mock",
]);

function assertJsonKeys(value: unknown, path = "body"): void {
  if (Array.isArray(value)) {
    value.forEach((item: unknown, index) => assertJsonKeys(item, `${path}[${index}]`));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      expect(forbiddenKeys.has(key.toLowerCase()), `${path}.${key}`).toBe(false);
      assertJsonKeys(child, `${path}.${key}`);
    }
  }
}

function payloads(capture: Capture): unknown[] {
  const text = bodyText(capture);
  if (!new Headers(capture.headers).get("content-type")?.includes("text/event-stream")) {
    return [JSON.parse(text) as unknown];
  }
  const result: unknown[] = [];
  for (const event of text.replaceAll("\r\n", "\n").split("\n\n")) {
    const data: string[] = [];
    for (const line of event.split("\n")) {
      if (line.startsWith(":")) expect(line).toBe(": keep-alive");
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      else expect(line).toBe("");
    }
    const json = data.join("\n");
    if (json && json !== "[DONE]") result.push(JSON.parse(json) as unknown);
  }
  expect(text).toContain("data: [DONE]\n\n");
  return result;
}

// Solo los IDs de completions son privados; los IDs de tool_calls deben pasar intactos.
function completionIds(capture: Capture): string[] {
  const text = bodyText(capture);
  const bodies = new Headers(capture.headers).get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).filter((line) => line !== "[DONE]")
    : [text];
  return bodies.flatMap((body) => {
    try {
      const value: unknown = JSON.parse(body);
      if (typeof value === "object" && value !== null && "id" in value && typeof value.id === "string") return [value.id];
      return [];
    } catch {
      // Un body cortado también puede haber expuesto el ID de la raíz.
      return [...body.matchAll(/"id"\s*:\s*"(chatcmpl-[^"]+)"/g)].map((match) => match[1]);
    }
  });
}

function assertNoLeaks(client: Capture, upstreams: Capture[], ownRateLimit = false): void {
  const wire = JSON.stringify({ status: client.status, headers: client.headers }) + bodyText(client);
  expect(wire).not.toMatch(/inferhub|qwencloud|alibaba|alicn|upstream[_-]?id|mock/i);
  expect(bodyText(client)).not.toMatch(/x-ratelimit|retry-after/i);
  for (const [name] of client.headers) {
    expect(name).not.toMatch(/^x-inferhub-/i);
    if (/^x-ratelimit(?:-|$)|^retry-after$/i.test(name)) {
      expect(ownRateLimit && client.status === 429, `Unexpected ${name}`).toBe(true);
    }
  }
  for (const upstream of upstreams) {
    const headers = new Headers(upstream.headers);
    for (const name of ["x-inferhub-publisher", "x-inferhub-backend", "x-inferhub-request-id"]) {
      const value = headers.get(name);
      expect(value, `Missing mock header ${name}`).toBeTruthy();
      expect(wire.toLowerCase()).not.toContain(value!.toLowerCase());
      if (name === "x-inferhub-publisher") expect(wire.toLowerCase()).not.toContain(value!.replaceAll("-", "").toLowerCase());
    }
    // También encuentra el ID en un JSON cortado antes de que pueda parsearse.
    for (const id of completionIds(upstream)) {
      const uuid = id.replace(/^chatcmpl-/, "");
      for (const identifier of [id, uuid, uuid.replaceAll("-", "")]) {
        expect(wire.toLowerCase()).not.toContain(identifier.toLowerCase());
      }
    }
  }
  const values = payloads(client);
  expect(values.length).toBeGreaterThan(0);
  values.forEach((value) => assertJsonKeys(value));
}

function expectedStatus(name: string, stream: boolean): number {
  if (name === "hang") return 504;
  if (name === "error-400" || name === "error-422") return 400;
  if (name === "tool-call" || name === "ok" || name === "no-usage" || name.startsWith("slow-first-byte")) return 200;
  if (stream && (name === "cut" || name === "mid-stream-error")) return 200;
  return 502;
}

async function createHarness(rateLimitRpm = "10000"): Promise<Harness> {
  const template = CATALOG[0];
  const upstream: UpstreamDefinition = {
    id: "mock", name: "Private test upstream", baseUrl: "http://127.0.0.1:4010/v1",
    apiKeyEnv: null, sendsPriceCap: true, environments: ["development"],
    models: cases.map(({ model, name }) => ({
      model, upstreamModel: `mock/${name}`, costInputPer1M: 1000, costOutputPer1M: 2000, priority: 1,
    })),
  };
  // El harness captura la función inyectada; el cliente sigue usando fetch real.
  vi.stubGlobal("fetch", observeUpstream);
  try {
    return await startGatewayHarness({
      models: cases.map(({ model }) => ({ ...template, id: model, author: "leaks" })),
      upstreams: [upstream], env: { GATEWAY_RATE_LIMIT_RPM: rateLimitRpm },
    });
  } finally {
    vi.unstubAllGlobals();
  }
}

beforeAll(async () => { harness = await createHarness(); });

afterAll(async () => { await harness?.close(); });

describe("upstream leaks over HTTP", () => {
  for (const stream of [false, true]) {
    describe(`stream=${stream}`, () => {
      for (const scenario of cases) {
        it(`${scenario.name} (${scenario.model}) hides every upstream identifier`, async () => {
          const firstCapture = captures.length;
          const firstRequest = harness.mock.requests.length;
          const client = await chat(scenario.model, stream, {
            chunks: scenario.chunks, chunkDelayMs: scenario.chunkDelayMs, latencyMs: scenario.latencyMs,
          }, promptMarker, true);
          await harness.flushAfter();
          expect(client.status).toBe(expectedStatus(scenario.name, stream));
          const upstreamModel = `mock/${scenario.name}`;
          // fetch oculta el 407 y puede reintentar el 421 incluso después de cerrar su promesa.
          const matchingRequests = harness.mock.requests.slice(firstRequest).filter((request) =>
            typeof request.body === "object" && request.body !== null
            && "model" in request.body && request.body.model === upstreamModel,
          );
          expect(matchingRequests.length).toBeGreaterThan(0);
          for (const request of matchingRequests) {
            expect(request.body).toMatchObject({ model: upstreamModel, stream, messages: [{ content: promptMarker }] });
          }
          const upstreams = captures.slice(firstCapture).filter((capture) => capture.upstreamModel === upstreamModel);
          const noFetchResponse = ["reset", "hang", "error-407", "error-421"].includes(scenario.name);
          expect(upstreams).toHaveLength(noFetchResponse ? 0 : 1);
          assertNoLeaks(client, upstreams);
          // El timeout sin stream es de 60 s; se prueba el plazo real del gateway.
        }, scenario.name === "hang" ? 70_000 : 30_000);
      }
    });
  }

  it.each([undefined, false])("sanitizes SSE when include_usage=%s", async (includeUsage) => {
    const firstCapture = captures.length;
    const client = await chat(cases[0].model, true, {}, promptMarker, includeUsage);
    await harness.flushAfter();
    expect(client.status).toBe(200);
    assertNoLeaks(client, captures.slice(firstCapture));
    for (const value of payloads(client)) expect(value).not.toHaveProperty("usage");
  });

  it.each([false, true])("delivers the unique output marker without logging it (stream=%s)", async (stream) => {
    const firstCapture = captures.length;
    const client = await chat(cases[0].model, stream, {}, markedPrompt, true);
    await harness.flushAfter();
    expect(client.status).toBe(200);
    expect(bodyText(client)).toContain(responseMarker);
    if (stream) expect(bodyText(client)).toContain(": keep-alive\n\n");
    assertNoLeaks(client, captures.slice(firstCapture));
  });

  it.each([false, true])("only our 429 may expose retry headers (stream=%s)", async (stream) => {
    const isolated = await createHarness("1");
    try {
      const first = await chat(cases[0].model, stream, {}, promptMarker, true, isolated);
      expect(first.status).toBe(200);
      const before = isolated.mock.requests.length;
      const client = await chat(cases[0].model, stream, {}, promptMarker, true, isolated);
      expect(client.status).toBe(429);
      expect(isolated.mock.requests).toHaveLength(before);
      expect(new Headers(client.headers).get("retry-after")).toMatch(/^[1-9]\d*$/);
      expect(payloads(client)).toMatchObject([{ error: { code: "rate_limit_exceeded" } }]);
      assertNoLeaks(client, [], true);
    } finally {
      await isolated.close();
    }
  });

  it("keeps credentials, headers, prompts and generated text out of all logs", async () => {
    const client = await chat(cases[0].model, true, {}, markedPrompt, true);
    await harness.flushAfter();
    expect(bodyText(client)).toContain(responseMarker);
    assertNoLeaks(client, captures.slice(-1));
    expect(harness.logs.length).toBeGreaterThan(0);
    const logs = harness.logs.join("\n").toLowerCase();
    for (const secret of [harness.apiKey, promptMarker, markedPrompt, responseMarker, headerMarker, "Hola 🌎.", "We need answer in Spanish."]) {
      expect(logs).not.toContain(secret.toLowerCase());
    }
    expect(logs).not.toMatch(/authorization|x[-_]mock/i);
    for (const line of harness.logs) expect(() => JSON.parse(line) as unknown).not.toThrow();
    expect(captures.some((capture) => bodyText(capture).includes(": INFERHUB PROCESSING"))).toBe(true);
  });

  it("stores metadata without content in every requests column (ADR-0014)", async () => {
    const isolated = await createHarness();
    try {
      for (const stream of [false, true]) {
        const client = await chat(cases[0].model, stream, {}, markedPrompt, true, isolated);
        expect(client.status).toBe(200);
        expect(bodyText(client)).toContain(responseMarker);
      }
      await isolated.flushAfter();
      const rows = await isolated.db.select().from(requests);
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.upstreamId === "mock")).toBe(true);
      // SELECT * también cubre columnas nuevas que aún no estén en el esquema de Drizzle.
      const stored = JSON.stringify(await isolated.db.execute(sql`select * from requests`), (_, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      );
      for (const content of [promptMarker, markedPrompt, responseMarker, "Hola 🌎.", "We need answer in Spanish."]) {
        expect(stored.toLowerCase()).not.toContain(content.toLowerCase());
      }
    } finally {
      await isolated.close();
    }
  });
});
