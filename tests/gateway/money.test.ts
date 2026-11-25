// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { UPSTREAMS } from "../fixtures/catalog-upstreams";

import { grantCredits } from "@/lib/billing/ledger";
import { HOUR_MS, PLANS } from "@/lib/billing/plans";
import { reconcile } from "@/lib/billing/reconcile";
import { apiKeys, modelPacks, requests, subscriptions, upstreams, usageWindows, workspaces } from "@/lib/db/schema";
import { loadCatalogSnapshot } from "@/lib/gateway/catalog-snapshot";
import { HOLD_MESSAGES } from "@/lib/gateway/errors";
import { DEFAULT_MAX_OUTPUT_TOKENS, estimatePromptTokens, MIN_OUTPUT_TOKENS, sizeHold } from "@/lib/gateway/request-cost";
import { createSseParser } from "@/lib/gateway/sse";
import type { GatewayErrorCode } from "@/lib/gateway/types";

import { startGatewayHarness, type GatewayHarnessOptions } from "../helpers/gateway-harness";

type Harness = Awaited<ReturnType<typeof startGatewayHarness>>;
const harnesses: Harness[] = [];
const model = "qwen/qwen3.8-flash";
const basicBody = { model, messages: [{ role: "user", content: "hi" }] };

async function start(options?: GatewayHarnessOptions) {
  const harness = await startGatewayHarness(options);
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

function post(harness: Harness, body: unknown = basicBody, signal?: AbortSignal) {
  return fetch(`${harness.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${harness.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

async function failure(response: Response, status: number, code: GatewayErrorCode) {
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ error: { code } });
}

async function account(harness: Harness) {
  const [workspace] = await harness.db.select().from(workspaces).where(eq(workspaces.id, harness.workspaceId));
  const [key] = await harness.db.select().from(apiKeys).where(eq(apiKeys.id, harness.apiKeyId));
  return { balance: workspace.balanceMicroUsd, spent: key.spentMicroUsd };
}

const DAY_MS = 24 * HOUR_MS;

/** Lo que el gateway reserva para `body` sin límite de presupuesto, con el mismo catálogo que el harness. */
async function holdFor(harness: Harness, body: Record<string, unknown>): Promise<bigint> {
  const snapshot = await loadCatalogSnapshot(harness.db, {
    env: { UPSTREAM_MOCK_BASE_URL: harness.mock.baseUrl }, environment: "development", now: Date.now,
  });
  const gatewayModel = snapshot.getModel(String(body.model));
  if (!gatewayModel) throw new Error(`Unknown model ${String(body.model)}`);
  const size = sizeHold(gatewayModel, {
    promptTokens: estimatePromptTokens(JSON.stringify(body), body, gatewayModel.contextLength),
    requestedOutputTokens: typeof body.max_tokens === "number" ? body.max_tokens : null,
    choices: 1,
  }, null);
  if (!size.ok) throw new Error("An unlimited budget always fits");
  return size.amountMicroUsd;
}

async function expectReconciled(harness: Harness) {
  const report = await reconcile(harness.db);
  expect(report.balanceMismatches).toEqual([]);
  expect(report.keySpendMismatches).toEqual([]);
}

async function cancelHalfway(response: Response, abort: AbortController, chunks: number) {
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  if (!response.body) throw new Error("Expected a streaming body");
  const reader = response.body.getReader();
  const parser = createSseParser();
  let contentChunks = 0;
  try {
    while (contentChunks < chunks / 2) {
      const { done, value } = await reader.read();
      expect(done).toBe(false);
      if (done) throw new Error("Stream ended before cancellation");
      for (const event of parser.push(value)) {
        if (event.type !== "data") continue;
        expect(event.data).not.toBe("[DONE]");
        const payload = JSON.parse(event.data) as { choices: { delta: { content?: string } }[] };
        for (const choice of payload.choices) {
          if (choice.delta.content) contentChunks++;
        }
      }
    }
    // Una lectura puede traer varios deltas; la cancelación debe ocurrir antes del final.
    expect(contentChunks).toBeLessThan(chunks);
    abort.abort();
    await expect(reader.read()).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    reader.releaseLock();
  }
}

describe("gateway money under load", () => {
  it("charges 50 concurrent requests completely, including 10 cancelled halfway, without ledger differences", async () => {
    const harness = await start();
    const before = await account(harness);
    const chunks = 8;
    const results = await Promise.all(Array.from({ length: 50 }, async (_, index) => {
      const stream = index % 2 === 0;
      const cancelled = stream && index < 20;
      const abort = new AbortController();
      const response = await post(harness, {
        model: "anthropic/claude-haiku-4.5",
        messages: [{ role: "user", content: "load".repeat(1_000) }],
        stream,
        x_mock: { chunks, latencyMs: 200, chunkDelayMs: 40 },
      }, abort.signal);
      expect(response.status).toBe(200);
      const requestId = response.headers.get("x-request-id");
      expect(requestId).toBeTruthy();
      if (cancelled) await cancelHalfway(response, abort, chunks);
      else {
        const text = await response.text();
        if (stream) expect(text).toContain("data: [DONE]");
        else expect(JSON.parse(text)).toHaveProperty("usage.completion_tokens", 34);
      }
      return { requestId, stream, cancelled };
    }));
    await harness.flushAfter();

    const records = await harness.db.select().from(requests);
    expect(records).toHaveLength(50);
    expect(new Set(records.map((record) => record.id)).size).toBe(50);
    expect(results.filter((result) => result.cancelled)).toHaveLength(10);
    expect(records.filter((record) => record.status === "client_cancelled")).toHaveLength(10);
    expect(records.filter((record) => record.stream)).toHaveLength(25);
    const byRequestId = new Map(records.map((record) => [`req_${record.id.replaceAll("-", "")}`, record]));
    for (const result of results) {
      const record = byRequestId.get(result.requestId!);
      // El mock reporta 10 µUSD de costo: se cobra ceil(10 × 1.3) = 13 µUSD (ADR-0054).
      expect(record).toMatchObject({
        status: result.cancelled ? "client_cancelled" : "success",
        stream: result.stream, httpStatus: 200, attempts: 1, upstreamId: "mock",
        promptTokens: 1_000, completionTokens: 34, usageEstimated: false,
        costMicroUsd: BigInt(13), upstreamCostMicroUsd: BigInt(10),
      });
    }
    expect(harness.mock.requests).toHaveLength(50);
    expect(harness.mock.requests.every((request) => !request.clientAborted)).toBe(true);
    const total = records.reduce((sum, record) => sum + record.costMicroUsd, BigInt(0));
    const after = await account(harness);
    expect(total).toBe(BigInt(650));
    expect(before.balance - after.balance).toBe(total);
    expect(after.spent - before.spent).toBe(total);
    await expectReconciled(harness);
  });

  it.each([false, true])("rejects an exactly zero balance without charging or calling the upstream; stream=%s", async (stream) => {
    const harness = await start({ balanceUsd: "0" });
    const emptyAccount = { balance: BigInt(0), spent: BigInt(0) };
    expect(await account(harness)).toEqual(emptyAccount);

    await failure(await post(harness, { ...basicBody, stream }), 402, "insufficient_credits");
    await harness.flushAfter();
    expect(await account(harness)).toEqual(emptyAccount);
    expect(harness.mock.requests).toHaveLength(0);
    expect(await harness.db.select().from(requests)).toHaveLength(0);
    await expectReconciled(harness);
  });

  it("holds each request's worst case so concurrent requests never overdraw, and frees it after the charge", async () => {
    const harness = await start({ balanceUsd: "0" });
    const body = { ...basicBody, stream: true, max_tokens: MIN_OUTPUT_TOKENS, x_mock: { chunks: 8, latencyMs: 1500, chunkDelayMs: 30 } };
    const hold = await holdFor(harness, body);
    // Alcanza para tres reservas y media: el cuarto request ya no cabe aunque quede saldo.
    await grantCredits(harness.db, { workspaceId: harness.workspaceId, amountMicroUsd: hold * BigInt(7) / BigInt(2), note: "Three holds and a half" });
    const responses = await Promise.all(Array.from({ length: 12 }, () => post(harness, body)));
    const accepted = responses.filter((response) => response.status === 200);
    expect(accepted).toHaveLength(3);
    for (const response of responses.filter((candidate) => candidate.status !== 200)) {
      expect(response.status).toBe(402);
      expect(await response.json()).toMatchObject({ error: { code: "insufficient_credits", message: HOLD_MESSAGES.insufficient_credits } });
    }
    for (const response of accepted) expect(await response.text()).toContain("data: [DONE]");
    await harness.flushAfter();

    expect((await account(harness)).balance).toBeGreaterThanOrEqual(BigInt(0));
    expect(harness.mock.requests).toHaveLength(3);
    expect(await harness.db.select().from(requests)).toHaveLength(3);
    expect(harness.holds.held(harness.workspaceId, harness.apiKeyId, harness.holds.mark())).toEqual({ workspace: BigInt(0), key: BigInt(0) });
    await expectReconciled(harness);

    // Cobrados los tres, lo que no gastaron de su reserva vuelve a estar disponible.
    const next = await post(harness, { ...body, x_mock: { chunks: 2 } });
    expect(next.status).toBe(200);
    await next.text();
    await harness.flushAfter();
    expect(await harness.db.select().from(requests)).toHaveLength(4);
    await expectReconciled(harness);
  });

  it("never lets concurrent requests cross the plan limit of a plan-only key into absorbed usage", async () => {
    const harness = await start({ balanceUsd: "0" });
    const now = Date.now();
    const body = { ...basicBody, stream: true, max_tokens: MIN_OUTPUT_TOKENS, x_mock: { chunks: 8, latencyMs: 1500, chunkDelayMs: 30 } };
    const hold = await holdFor(harness, body);
    await harness.db.update(apiKeys).set({ billingSource: "plan_only" }).where(eq(apiKeys.id, harness.apiKeyId));
    await harness.db.insert(subscriptions).values({
      workspaceId: harness.workspaceId, planId: "plus", status: "active", paymentProvider: "dev",
      currentPeriodStart: new Date(now - DAY_MS), currentPeriodEnd: new Date(now + DAY_MS),
    });
    // A la ventana de 5 horas le quedan tres reservas y media.
    await harness.db.insert(usageWindows).values({
      workspaceId: harness.workspaceId, kind: "five_hour", startedAt: new Date(now - HOUR_MS), resetsAt: new Date(now + HOUR_MS),
      usedMicroUsd: PLANS.plus.fiveHourLimitMicroUsd - hold * BigInt(7) / BigInt(2),
    });

    const responses = await Promise.all(Array.from({ length: 12 }, () => post(harness, body)));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(3);
    for (const response of responses) {
      if (response.status === 200) {
        expect(await response.text()).toContain("data: [DONE]");
        continue;
      }
      expect(response.status).toBe(429);
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(3_000);
      expect(await response.json()).toMatchObject({ error: { code: "usage_limit_reached", message: HOLD_MESSAGES.usage_limit_reached } });
    }
    await harness.flushAfter();

    const rows = await harness.db.select().from(requests);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.absorbedMicroUsd).toBe(BigInt(0));
      expect(row.planMicroUsd).toBe(row.costMicroUsd);
    }
    const [window] = await harness.db.select().from(usageWindows)
      .where(and(eq(usageWindows.workspaceId, harness.workspaceId), eq(usageWindows.kind, "five_hour")));
    expect(window.usedMicroUsd).toBeLessThanOrEqual(PLANS.plus.fiveHourLimitMicroUsd);
  });

  it("lets concurrent requests reach the model pack when the plan only covers the first one", async () => {
    const harness = await start({ balanceUsd: "0" });
    const now = Date.now();
    const body = { ...basicBody, stream: true, max_tokens: MIN_OUTPUT_TOKENS, x_mock: { chunks: 8, latencyMs: 1500, chunkDelayMs: 30 } };
    const hold = await holdFor(harness, body);
    await harness.db.insert(subscriptions).values({
      workspaceId: harness.workspaceId, planId: "plus", status: "active", paymentProvider: "dev",
      currentPeriodStart: new Date(now - DAY_MS), currentPeriodEnd: new Date(now + DAY_MS),
    });
    // Al plan le queda reserva y media: solo, cubre un request. El paquete del modelo cubre los demás.
    await harness.db.insert(usageWindows).values({
      workspaceId: harness.workspaceId, kind: "five_hour", startedAt: new Date(now - HOUR_MS), resetsAt: new Date(now + HOUR_MS),
      usedMicroUsd: PLANS.plus.fiveHourLimitMicroUsd - hold * BigInt(3) / BigInt(2),
    });
    await harness.db.insert(modelPacks).values({
      workspaceId: harness.workspaceId, modelId: model, paidMicroUsd: hold * BigInt(10), grantedMicroUsd: hold * BigInt(10),
      balanceMicroUsd: hold * BigInt(10), expiresAt: new Date(now + DAY_MS),
    });

    const responses = await Promise.all(Array.from({ length: 6 }, () => post(harness, body)));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200]);
    for (const response of responses) expect(await response.text()).toContain("data: [DONE]");
    await harness.flushAfter();

    // Ninguno salió recortado: el upstream recibió la salida que pidió el cliente.
    for (const request of harness.mock.requests) expect((request.body as Record<string, unknown>).max_tokens).toBe(MIN_OUTPUT_TOKENS);
    const rows = await harness.db.select().from(requests);
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row.absorbedMicroUsd).toBe(BigInt(0));
    await expectReconciled(harness);
  });

  it("rejects a prompt that alone does not fit the balance without calling the upstream", async () => {
    const harness = await start({ balanceUsd: "0.001" });
    const before = await account(harness);
    const response = await post(harness, { ...basicBody, messages: [{ role: "user", content: "x".repeat(3_000_000) }] });
    await failure(response, 402, "insufficient_credits");
    await harness.flushAfter();
    expect(await account(harness)).toEqual(before);
    expect(harness.mock.requests).toHaveLength(0);
    expect(await harness.db.select().from(requests)).toHaveLength(0);
  });

  it("sends the reserved output cap upstream and leaves a max_tokens that fits untouched", async () => {
    const harness = await start({ balanceUsd: "0" });
    const fits = { ...basicBody, max_tokens: 4_096 };
    await grantCredits(harness.db, { workspaceId: harness.workspaceId, amountMicroUsd: await holdFor(harness, fits), note: "One hold" });

    for (const body of [fits, basicBody, { ...basicBody, max_completion_tokens: 64_000 }]) {
      const response = await post(harness, body);
      expect(response.status).toBe(200);
      await response.text();
      await harness.flushAfter();
    }
    const sent = harness.mock.requests.map((request) => request.body as Record<string, unknown>);
    // Lo que pidió el cliente y cabe pasa tal cual.
    expect(sent[0].max_tokens).toBe(4_096);
    // Sin salida fijada, el upstream recibe la que alcanza, nunca la por defecto completa.
    expect(sent[1].max_tokens).toBeGreaterThanOrEqual(MIN_OUTPUT_TOKENS);
    expect(sent[1].max_tokens).toBeLessThanOrEqual(4_096);
    // Con más de la que cabe, se recorta en el mismo campo que mandó el cliente.
    expect(sent[2].max_completion_tokens).toBeLessThanOrEqual(4_096);
    expect(sent[2]).not.toHaveProperty("max_tokens");
    await expectReconciled(harness);

    const rich = await start();
    const response = await post(rich);
    expect(response.status).toBe(200);
    await response.text();
    expect((rich.mock.requests[0].body as Record<string, unknown>).max_tokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });

  it("rejects the very next request after revocation without charging it", async () => {
    const harness = await start();
    const accepted = await post(harness);
    expect(accepted.status).toBe(200);
    await accepted.text();
    await harness.flushAfter();
    const before = await account(harness);
    await harness.db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, harness.apiKeyId));

    await failure(await post(harness), 401, "invalid_api_key");
    await harness.flushAfter();
    expect(await account(harness)).toEqual(before);
    expect(harness.mock.requests).toHaveLength(1);
    expect(await harness.db.select().from(requests)).toHaveLength(1);
    await expectReconciled(harness);
  });

  it("returns 403 when the spending limit left on the key does not cover the next request", async () => {
    const harness = await start();
    const body = { ...basicBody, max_tokens: MIN_OUTPUT_TOKENS };
    const hold = await holdFor(harness, body);
    await harness.db.update(apiKeys).set({ spendLimitMicroUsd: hold + BigInt(5) }).where(eq(apiKeys.id, harness.apiKeyId));
    const first = await post(harness, body);
    expect(first.status).toBe(200);
    await first.text();
    await harness.flushAfter();
    const before = await account(harness);
    expect(before.spent).toBeGreaterThan(BigInt(5));

    const response = await post(harness, body);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "key_limit_exceeded", message: HOLD_MESSAGES.key_limit_exceeded } });
    await harness.flushAfter();
    expect(await account(harness)).toEqual(before);
    expect(harness.mock.requests).toHaveLength(1);

    // Una salida que sí cabe en lo que queda pasa; con el límite alcanzado, ya nada.
    const small = await post(harness, { ...body, max_tokens: 16 });
    expect(small.status).toBe(200);
    await small.text();
    await harness.flushAfter();
    await harness.db.update(apiKeys).set({ spendLimitMicroUsd: (await account(harness)).spent }).where(eq(apiKeys.id, harness.apiKeyId));
    await failure(await post(harness, { ...body, max_tokens: 1 }), 403, "key_limit_exceeded");
    await harness.flushAfter();
    expect(harness.mock.requests).toHaveLength(2);
    expect(await harness.db.select().from(requests)).toHaveLength(2);
    await expectReconciled(harness);
  });

  it.each([false, true])("records exhausted upstream errors at zero cost; stream=%s", async (stream) => {
    const mock = UPSTREAMS.find((upstream) => upstream.id === "mock")!;
    const targets = ["mock", "mock-secondary", "mock-tertiary"].map((id, index) => ({
      ...mock, id, models: mock.models.map((mapping) => ({ ...mapping, priority: index + 1 })),
    }));
    const harness = await start({ upstreams: targets });
    // Los tres destinos usan el mismo servidor local, antes de cargar el primer snapshot.
    await harness.db.update(upstreams).set({ baseUrl: harness.mock.baseUrl });
    const before = await account(harness);
    await failure(await post(harness, { ...basicBody, stream, x_mock: { scenario: "error-500" } }), 503, "upstream_error");
    await harness.flushAfter();
    expect(harness.mock.requests).toHaveLength(3);
    for (const request of harness.mock.requests) expect(request.body).toHaveProperty("x_mock.scenario", "error-500");
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "upstream_error", httpStatus: 503, errorCode: "upstream_error", stream, attempts: 3,
      promptTokens: 0, completionTokens: 0, usageEstimated: false,
      costMicroUsd: BigInt(0), upstreamCostMicroUsd: BigInt(0), officialCostMicroUsd: BigInt(0),
    }]);
    expect(await harness.db.select().from(requests)).toHaveLength(1);
    expect(await account(harness)).toEqual(before);
    await expectReconciled(harness);
  });

  it.each([false, true])("charges cost plus margin (13 micro USD) for a minimal hi request; stream=%s", async (stream) => {
    const harness = await start();
    const before = await account(harness);
    const response = await post(harness, { ...basicBody, stream });
    expect(response.status).toBe(200);
    await response.text();
    await harness.flushAfter();
    const records = await harness.db.select().from(requests);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: "success", stream, promptTokens: 1, completionTokens: 14, usageEstimated: false,
      costMicroUsd: BigInt(13), officialCostMicroUsd: BigInt(7),
    });
    const after = await account(harness);
    expect(before.balance - after.balance).toBe(BigInt(13));
    expect(after.spent - before.spent).toBe(BigInt(13));
    await expectReconciled(harness);
  });

  it.each([false, true])("charges estimated usage when the upstream omits usage; stream=%s", async (stream) => {
    const harness = await start();
    const before = await account(harness);
    const response = await post(harness, {
      model, messages: [{ role: "user", content: "abcd".repeat(2_000) }], stream,
      x_mock: { scenario: "no-usage", chunks: 8 },
    });
    expect(response.status).toBe(200);
    await response.text();
    await harness.flushAfter();
    const records = await harness.db.select().from(requests);
    expect(records).toHaveLength(1);
    // 8000 caracteres de entrada y 89 de salida (incluido reasoning): 2000 y 23 tokens.
    // Qwen cobra ceil(54 + 1.863) = 56 µUSD, por encima del mínimo.
    expect(records[0]).toMatchObject({
      status: "success", stream, usageEstimated: true, promptTokens: 2_000, completionTokens: 23,
      costMicroUsd: BigInt(56), upstreamCostMicroUsd: BigInt(19), officialCostMicroUsd: BigInt(311),
    });
    expect(harness.mock.requests).toHaveLength(1);
    expect(harness.mock.requests[0].body).toHaveProperty("x_mock.scenario", "no-usage");
    const after = await account(harness);
    expect(before.balance - after.balance).toBe(BigInt(56));
    expect(after.spent - before.spent).toBe(BigInt(56));
    await expectReconciled(harness);
  });
});
