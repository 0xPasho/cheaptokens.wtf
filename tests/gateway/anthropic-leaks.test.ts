// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { UpstreamDefinition } from "@/lib/catalog/types";

import { CATALOG } from "../fixtures/catalog-models";
import { startGatewayHarness } from "../helpers/gateway-harness";

type Harness = Awaited<ReturnType<typeof startGatewayHarness>>;
type Capture = { status: number; headers: [string, string][]; text: string };

/**
 * Lo mismo que `leaks.test.ts` para `/anthropic/v1/messages` (ADR-0078): ni headers, ni IDs, ni `cost`, ni el nombre
 * del upstream llegan al cliente, con respuesta, con error y con el stream cortado.
 */
const SCENARIOS = [
  "ok", "no-usage", "tool-use", "late-cost", "slow-first-byte", "mid-stream-error", "stream-error-200", "cut",
  "empty-stream", "error-400", "error-402-bid", "error-422", "error-429", "error-500", "error-503",
];
const cases = SCENARIOS.map((name, index) => ({ name, model: `leaks/anthropic-${index}` }));
const nativeFetch = globalThis.fetch;
const upstreamCaptures: Capture[] = [];
let harness: Harness;

const observeUpstream: typeof fetch = async (input, init) => {
  const response = await nativeFetch(input, init);
  const capture: Capture = { status: response.status, headers: [...response.headers], text: "" };
  upstreamCaptures.push(capture);
  const decoder = new TextDecoder();
  const body = response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      capture.text += decoder.decode(bytes, { stream: true });
      controller.enqueue(bytes);
    },
  })) ?? null;
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
};

beforeAll(async () => {
  const upstream: UpstreamDefinition = {
    id: "mock", name: "Private test upstream", baseUrl: "http://127.0.0.1:4010/v1",
    apiKeyEnv: null, sendsPriceCap: true, environments: ["development"],
    models: cases.map(({ model, name }) => ({ model, upstreamModel: `mock/${name}`, costInputPer1M: 1000, costOutputPer1M: 2000, priority: 1 })),
  };
  vi.stubGlobal("fetch", observeUpstream);
  try {
    harness = await startGatewayHarness({
      models: cases.map(({ model }) => ({ ...CATALOG[0], id: model, author: "leaks" })),
      upstreams: [upstream], env: { GATEWAY_RATE_LIMIT_RPM: "10000" },
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

afterAll(async () => { await harness?.close(); });

const FORBIDDEN_KEYS = new Set(["provider", "request_id", "cost", "upstream_id", "x_mock", "service_tier"]);

function assertJsonKeys(value: unknown, path = "body"): void {
  if (Array.isArray(value)) value.forEach((item, index) => assertJsonKeys(item, `${path}[${index}]`));
  else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      expect(FORBIDDEN_KEYS.has(key), `${path}.${key}`).toBe(false);
      assertJsonKeys(child, `${path}.${key}`);
    }
  }
}

function jsonPayloads(capture: Capture): unknown[] {
  if (!new Headers(capture.headers).get("content-type")?.includes("text/event-stream")) return [JSON.parse(capture.text)];
  const values: unknown[] = [];
  for (const block of capture.text.split("\n\n")) {
    for (const line of block.split("\n")) {
      if (line.startsWith("data: ")) values.push(JSON.parse(line.slice(6)));
      // Solo eventos con nombre y datos: ni comentarios del upstream ni líneas sueltas.
      else expect(line === "" || line.startsWith("event: "), line).toBe(true);
    }
  }
  return values;
}

describe("upstream leaks over /anthropic/v1/messages", () => {
  for (const stream of [false, true]) {
    for (const { name, model } of cases) {
      it(`${name} (stream=${stream}) hides every upstream identifier`, async () => {
        const firstUpstream = upstreamCaptures.length;
        const response = await nativeFetch(`${harness.anthropicBaseUrl}/v1/messages`, {
          method: "POST",
          headers: { "x-api-key": harness.apiKey, "content-type": "application/json", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model, max_tokens: 1024, stream, messages: [{ role: "user", content: "hola" }] }),
        });
        const client: Capture = { status: response.status, headers: [...response.headers], text: await response.text() };
        await harness.flushAfter();

        const wire = JSON.stringify(client.headers) + client.text;
        expect(wire).not.toMatch(/inferhub|qwencloud|alibaba|alicn|upstream[_-]?id|mock|msg_upstream/i);
        for (const [header] of client.headers) expect(header).not.toMatch(/^x-inferhub-|^x-ratelimit/i);
        // Los headers que identifican al upstream y al request de su lado: ninguno puede aparecer en lo que ve el cliente.
        for (const upstream of upstreamCaptures.slice(firstUpstream)) {
          const headers = new Headers(upstream.headers);
          for (const name of ["x-inferhub-publisher", "x-inferhub-backend", "x-inferhub-request-id"]) {
            const value = headers.get(name);
            if (value) expect(wire.toLowerCase(), name).not.toContain(value.toLowerCase());
          }
          for (const [, id] of upstream.text.matchAll(/"id"\s*:\s*"(msg_upstream_[^"]+)"/g)) expect(wire).not.toContain(id);
        }
        const values = jsonPayloads(client);
        expect(values.length).toBeGreaterThan(0);
        values.forEach((value) => assertJsonKeys(value));
      });
    }
  }
});
