// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { UPSTREAMS } from "../fixtures/catalog-upstreams";

import { grantCredits } from "@/lib/billing/ledger";
import { reconcile } from "@/lib/billing/reconcile";
import { apiKeys, creditTransactions, requests, upstreams, workspaces } from "@/lib/db/schema";
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
      // 1000 tokens de entrada y 34 de salida a precios Haiku: ceil(220 + 37.4) = 258 µUSD.
      expect(record).toMatchObject({
        status: result.cancelled ? "client_cancelled" : "success",
        stream: result.stream, httpStatus: 200, attempts: 1, upstreamId: "mock",
        promptTokens: 1_000, completionTokens: 34, usageEstimated: false,
        costMicroUsd: BigInt(258), upstreamCostMicroUsd: BigInt(10),
      });
    }
    expect(harness.mock.requests).toHaveLength(50);
    expect(harness.mock.requests.every((request) => !request.clientAborted)).toBe(true);
    const total = records.reduce((sum, record) => sum + record.costMicroUsd, BigInt(0));
    const after = await account(harness);
    expect(total).toBe(BigInt(12_900));
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

  it("allows a small concurrent overdraft, rejects later requests with 402 and resumes after a credit grant", async () => {
    const harness = await start({ balanceUsd: "0.0001" });
    expect(await account(harness)).toEqual({ balance: BigInt(100), spent: BigInt(0) });
    await Promise.all(Array.from({ length: 12 }, async () => {
      const response = await post(harness, {
        ...basicBody, stream: true, x_mock: { chunks: 8, latencyMs: 100, chunkDelayMs: 30 },
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("data: [DONE]");
    }));
    await harness.flushAfter();
    const overdrawn = { balance: BigInt(-20), spent: BigInt(120) };
    expect(await account(harness)).toEqual(overdrawn);
    expect(await harness.db.select().from(requests)).toHaveLength(12);
    await expectReconciled(harness);

    for (const stream of [false, true, false]) {
      await failure(await post(harness, { ...basicBody, stream }), 402, "insufficient_credits");
    }
    await harness.flushAfter();
    expect(await account(harness)).toEqual(overdrawn);
    expect(harness.mock.requests).toHaveLength(12);
    expect(await harness.db.select().from(requests)).toHaveLength(12);

    await grantCredits(harness.db, {
      workspaceId: harness.workspaceId, amountMicroUsd: BigInt(100), note: "Cover overdraft and restore access",
    });
    expect(await account(harness)).toEqual({ balance: BigInt(80), spent: BigInt(120) });
    const response = await post(harness);
    expect(response.status).toBe(200);
    await response.text();
    await harness.flushAfter();
    expect(await account(harness)).toEqual({ balance: BigInt(70), spent: BigInt(130) });
    expect(await harness.db.select().from(requests)).toHaveLength(13);
    const credits = await harness.db.select().from(creditTransactions);
    expect(credits).toHaveLength(2);
    expect(credits.reduce((sum, credit) => sum + credit.amountMicroUsd, BigInt(0))).toBe(BigInt(200));
    await expectReconciled(harness);
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

  it("returns 403 as soon as actual charges reach the key spending limit", async () => {
    const harness = await start();
    await harness.db.update(apiKeys).set({ spendLimitMicroUsd: BigInt(20) }).where(eq(apiKeys.id, harness.apiKeyId));
    for (const spent of [BigInt(10), BigInt(20)]) {
      const response = await post(harness);
      expect(response.status).toBe(200);
      await response.text();
      await harness.flushAfter();
      expect((await account(harness)).spent).toBe(spent);
    }
    const before = await account(harness);
    expect(before.balance).toBeGreaterThan(BigInt(0));
    await failure(await post(harness), 403, "key_limit_exceeded");
    await harness.flushAfter();
    expect(await account(harness)).toEqual(before);
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
    await failure(await post(harness, { ...basicBody, stream, x_mock: { scenario: "error-500" } }), 502, "upstream_error");
    await harness.flushAfter();
    expect(harness.mock.requests).toHaveLength(3);
    for (const request of harness.mock.requests) expect(request.body).toHaveProperty("x_mock.scenario", "error-500");
    expect(await harness.db.select().from(requests)).toMatchObject([{
      status: "upstream_error", httpStatus: 502, errorCode: "upstream_error", stream, attempts: 3,
      promptTokens: 0, completionTokens: 0, usageEstimated: false,
      costMicroUsd: BigInt(0), upstreamCostMicroUsd: BigInt(0), officialCostMicroUsd: BigInt(0),
    }]);
    expect(await harness.db.select().from(requests)).toHaveLength(1);
    expect(await account(harness)).toEqual(before);
    await expectReconciled(harness);
  });

  it.each([false, true])("charges exactly 10 micro USD for a minimal hi request; stream=%s", async (stream) => {
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
      costMicroUsd: BigInt(10), officialCostMicroUsd: BigInt(7),
    });
    const after = await account(harness);
    expect(before.balance - after.balance).toBe(BigInt(10));
    expect(after.spent - before.spent).toBe(BigInt(10));
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
    // Qwen cobra ceil(45 + 1.5525) = 47 µUSD, por encima del mínimo.
    expect(records[0]).toMatchObject({
      status: "success", stream, usageEstimated: true, promptTokens: 2_000, completionTokens: 23,
      costMicroUsd: BigInt(47), upstreamCostMicroUsd: BigInt(19), officialCostMicroUsd: BigInt(311),
    });
    expect(harness.mock.requests).toHaveLength(1);
    expect(harness.mock.requests[0].body).toHaveProperty("x_mock.scenario", "no-usage");
    const after = await account(harness);
    expect(before.balance - after.balance).toBe(BigInt(47));
    expect(after.spent - before.spent).toBe(BigInt(47));
    await expectReconciled(harness);
  });
});
