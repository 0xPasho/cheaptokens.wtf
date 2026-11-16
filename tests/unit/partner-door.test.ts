// @vitest-environment node
import { AsyncLocalStorage } from "node:async_hooks";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateKeyFormat } from "@/lib/api-keys";
import { chargeRequest } from "@/lib/billing/ledger";
import { activePlan } from "@/lib/billing/state";
import type { RequestRecord } from "@/lib/billing/types";
import { createApiKey, ensureDevWorkspace } from "@/lib/billing/workspaces";
import { apiKeys, models, partnerIdempotencyKeys, partnerPlans, partnerRuns, requests, subscriptions, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/db/uuid";
import {
  changePlanRoute, closePlanRoute, extraCapRoute, issueKeyRoute, openPlanRoute, type PartnerDeps, revokeKeyRoute, usageRoute,
} from "@/lib/partner/http";
import { fromPublicId } from "@/lib/partner/ids";
import { countRun, deskaRun } from "@/lib/partner/runs";
import { PLAN_GRACE_MS } from "@/lib/partner/service";
import { PARTNER_PLANS } from "@/lib/partner/tiers";

import { createTestDb } from "../helpers/db";

const SECRET = "partner-secret-for-tests-0123456789abcdef";
const ENV = { PARTNER_DESKA_SECRET: SECRET };
const ORIGIN = "http://door.test";
const NOW = Date.UTC(2026, 10, 16, 15);
const DAY = 24 * 60 * 60 * 1000;
const PAID_THROUGH = new Date(NOW + 30 * DAY).toISOString();
const REF = "deska:team:t1:user:u1";
const KEY_PATTERN = /wtf_[0-9A-Za-z]{8,}/;

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;
let clock = NOW;
let seq = 0;
const logs: string[] = [];
const deps = (env: Record<string, string> = ENV): PartnerDeps => ({
  db, env, now: () => clock, log: { info() {}, warn() {}, error: (event) => logs.push(event) },
});
/** Todas las respuestas de error que vieron las pruebas: ninguna puede llevar una key. */
const errorBodies: string[] = [];

type RouteFn = (request: Request, deps: PartnerDeps, id: string) => Promise<Response>;

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = {
    method,
    headers: {
      authorization: `Bearer ${SECRET}`,
      ...(method === "GET" ? {} : { "idempotency-key": `test-${++seq}`, "content-type": "application/json" }),
      ...headers,
    },
  };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${ORIGIN}/partner/v1${path}`, init);
}

async function read(response: Response) {
  const text = await response.text();
  if (response.status >= 400) errorBodies.push(text);
  return { status: response.status, body: text === "" ? null : JSON.parse(text), text, headers: response.headers };
}

async function open(input: { externalRef?: string; tier?: string; paidThrough?: string } = {}, headers?: Record<string, string>) {
  return read(await openPlanRoute(request("POST", "/plans", { externalRef: REF, tier: "plan-49", paidThrough: PAID_THROUGH, ...input }, headers), deps()));
}

async function on(route: RouteFn, method: string, path: string, id: string, body?: unknown, headers?: Record<string, string>, env?: Record<string, string>) {
  return read(await route(request(method, path, body, headers), deps(env), id));
}

const patch = (planId: string, body: unknown, headers?: Record<string, string>) => on(changePlanRoute, "PATCH", `/plans/${planId}`, planId, body, headers);
const close = (planId: string, headers?: Record<string, string>) => on(closePlanRoute, "POST", `/plans/${planId}/close`, planId, {}, headers);
const issue = (planId: string, expiresAt = new Date(NOW + 38 * DAY).toISOString(), headers?: Record<string, string>) =>
  on(issueKeyRoute, "POST", `/plans/${planId}/keys`, planId, { expiresAt }, headers);
const revoke = (keyId: string, headers?: Record<string, string>) => on(revokeKeyRoute, "POST", `/keys/${keyId}/revoke`, keyId, {}, headers);
const usage = (planId: string, query = "") => on(usageRoute, "GET", `/plans/${planId}/usage${query}`, planId);
const cap = (planId: string, capMicroUsd: unknown, headers?: Record<string, string>) =>
  on(extraCapRoute, "PUT", `/plans/${planId}/extra-cap`, planId, { capMicroUsd }, headers);

async function seedModels() {
  const base = {
    author: "test", description: { en: "Test" }, contextLength: 100_000,
    officialInputPriceMicroUsd: BigInt(1_000_000), officialOutputPriceMicroUsd: BigInt(2_000_000),
    officialPriceSourceUrl: "https://example.com/pricing", discountBps: 5000,
    inputPriceMicroUsd: BigInt(500_000), outputPriceMicroUsd: BigInt(1_000_000), tags: [],
  };
  await db.insert(models).values([
    { ...base, id: "test/model-b", name: "B", status: "active" },
    { ...base, id: "test/model-a", name: "A", status: "active" },
    { ...base, id: "test/hidden", name: "Hidden", status: "hidden" },
    { ...base, id: "test/old", name: "Old", status: "deprecated" },
  ]);
}

async function planRow(planId: string) {
  const [row] = await db.select().from(partnerPlans).where(eq(partnerPlans.id, fromPublicId("plan", planId)!));
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, row.workspaceId));
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, row.workspaceId));
  const keys = await db.select().from(apiKeys).where(eq(apiKeys.workspaceId, row.workspaceId));
  return { row, workspace, subscription, keys };
}

function charge(workspaceId: string, apiKeyId: string, cost: number): RequestRecord {
  return {
    id: uuidv7(), workspaceId, apiKeyId, modelId: "test/model-a", upstreamId: null, attempts: 1, stream: false,
    status: "success", httpStatus: 200, errorCode: null, promptTokens: 10, completionTokens: 10, cachedTokens: null,
    usageEstimated: false, costMicroUsd: BigInt(cost), upstreamCostMicroUsd: BigInt(1), officialCostMicroUsd: BigInt(cost * 2),
    ttfbMs: 10, latencyMs: 20,
  };
}

beforeEach(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  clock = NOW;
  logs.length = 0;
  await seedModels();
});

afterEach(async () => {
  await testDb?.close();
  // Ninguna prueba debe pasar por un 500.
  expect(logs).toEqual([]);
});

describe("auth", () => {
  it("refuses a missing, wrong, unconfigured or short partner secret on every route", async () => {
    const opened = await open();
    const planId = opened.body.planId;
    const key = await issue(planId);
    const routes: Array<[RouteFn, string, string, string, unknown]> = [
      [(r, d) => openPlanRoute(r, d), "POST", "/plans", "", { externalRef: REF, tier: "plan-9", paidThrough: PAID_THROUGH }],
      [changePlanRoute, "PATCH", `/plans/${planId}`, planId, { tier: "plan-9" }],
      [closePlanRoute, "POST", `/plans/${planId}/close`, planId, {}],
      [issueKeyRoute, "POST", `/plans/${planId}/keys`, planId, { expiresAt: new Date(NOW + DAY).toISOString() }],
      [revokeKeyRoute, "POST", `/keys/${key.body.keyId}/revoke`, key.body.keyId, {}],
      [usageRoute, "GET", `/plans/${planId}/usage`, planId, undefined],
      [extraCapRoute, "PUT", `/plans/${planId}/extra-cap`, planId, { capMicroUsd: 1 }],
    ];
    const attempts: Array<[Record<string, string>, Record<string, string>]> = [
      [{ authorization: "" }, ENV],
      [{ authorization: `Bearer ${SECRET}x` }, ENV],
      [{ authorization: SECRET }, ENV],
      [{}, {}],
      [{ authorization: "Bearer short" }, { PARTNER_DESKA_SECRET: "short" }],
    ];
    for (const [route, method, path, id, body] of routes) {
      for (const [headers, env] of attempts) {
        const answer = await on(route, method, path, id, body, headers, env);
        expect(answer.status, `${method} ${path}`).toBe(401);
        expect(answer.body).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
      }
    }
    // Nada cambió: el plan sigue abierto y la key viva.
    const state = await planRow(planId);
    expect(state.row.closedAt).toBeNull();
    expect(state.keys.every((row) => row.revokedAt === null)).toBe(true);
  });

  it("asks for an Idempotency-Key on every write", async () => {
    const answer = await read(await openPlanRoute(request("POST", "/plans", { externalRef: REF, tier: "plan-9", paidThrough: PAID_THROUGH }, { "idempotency-key": "" }), deps()));
    expect(answer.status).toBe(400);
  });
});

describe("POST /plans", () => {
  it("opens Deska Pro's plan-3 with public models and the Pro request rate", async () => {
    const answer = await open({ tier: "plan-3" });
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      tier: "plan-3",
      models: ["test/model-a", "test/model-b", "test/old"],
    });
    expect(PARTNER_PLANS["plan-3"]).toEqual({
      id: "plan-3",
      priceMicroUsd: BigInt(3_000_000),
      fiveHourLimitMicroUsd: BigInt(420_000),
      weekLimitMicroUsd: BigInt(1_800_000),
      rateLimitRpm: 120,
    });
    expect((await planRow(answer.body.planId)).subscription.planId).toBe("plan-3");
  });

  it("opens a plan on its own workspace with extra usage off", async () => {
    const answer = await open();
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(answer.body).toEqual({
      planId: expect.stringMatching(/^plan_[0-9a-f]{32}$/),
      tier: "plan-49",
      status: "open",
      models: ["test/model-a", "test/model-b", "test/old"],
      inferenceBaseUrl: `${ORIGIN}/v1`,
    });
    const { row, workspace, subscription } = await planRow(answer.body.planId);
    expect(row).toMatchObject({ partnerId: "deska", externalRef: REF, paidThrough: new Date(PAID_THROUGH), closedAt: null });
    expect(workspace).toMatchObject({ clerkUserId: `partner:deska:${row.id}`, overflowMode: "stop", overflowCredits: false, overflowPacks: false, balanceMicroUsd: BigInt(0) });
    expect(subscription).toMatchObject({
      planId: "plan-49", status: "active", paymentProvider: "partner:deska",
      currentPeriodEnd: new Date(Date.parse(PAID_THROUGH) + PLAN_GRACE_MS),
    });
  });

  it("answers the open plan with the same ref again, never a second one, and a new plan after closing", async () => {
    const first = await open();
    const again = await open({ paidThrough: new Date(NOW + 60 * DAY).toISOString() }, { "idempotency-key": `open:${REF}` });
    const retry = await open({ paidThrough: new Date(NOW + 60 * DAY).toISOString() }, { "idempotency-key": `open:${REF}` });
    expect(again.body.planId).toBe(first.body.planId);
    expect(retry.body).toEqual(again.body);
    expect(await db.select().from(partnerPlans)).toHaveLength(1);

    expect((await close(first.body.planId)).status).toBe(204);
    const reopened = await open({}, { "idempotency-key": `open:${REF}` });
    expect(reopened.body.planId).not.toBe(first.body.planId);
    expect(reopened.body.status).toBe("open");
  });

  it("uses the API host for the inference base when there is one", async () => {
    const answer = await read(await openPlanRoute(
      request("POST", "/plans", { externalRef: REF, tier: "plan-9", paidThrough: PAID_THROUGH }),
      { ...deps(), env: { ...ENV, API_HOST: "api.tokens.example" } },
    ));
    expect(answer.body.inferenceBaseUrl).toBe("https://api.tokens.example/v1");
  });

  it("refuses an unknown tier, a bad date, a missing ref and a body that is not JSON", async () => {
    expect((await open({ tier: "plan-20" })).status).toBe(400);
    expect((await open({ paidThrough: "next month" })).status).toBe(400);
    expect((await open({ externalRef: "" })).status).toBe(400);
    expect((await read(await openPlanRoute(request("POST", "/plans", "{nope"), deps()))).status).toBe(400);
    expect(await db.select().from(partnerPlans)).toHaveLength(0);
  });
});

describe("PATCH /plans/{id}", () => {
  it("changes the tier from the next request, both ways, and the paid period", async () => {
    const { body: plan } = await open({ tier: "plan-9" });
    const up = await patch(plan.planId, { tier: "plan-3" });
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ planId: plan.planId, tier: "plan-3", status: "open" });
    expect((await planRow(plan.planId)).subscription.planId).toBe("plan-3");

    const paidThrough = new Date(NOW + 61 * DAY).toISOString();
    const down = await patch(plan.planId, { tier: "plan-9", paidThrough });
    expect(down.body.tier).toBe("plan-9");
    const state = await planRow(plan.planId);
    expect(state.row.paidThrough).toEqual(new Date(paidThrough));
    expect(state.subscription.currentPeriodEnd).toEqual(new Date(Date.parse(paidThrough) + PLAN_GRACE_MS));
  });

  it("counts what was used against the new tier's limits", async () => {
    const { body: plan } = await open({ tier: "plan-9" });
    const { body: key } = await issue(plan.planId);
    const { row } = await planRow(plan.planId);
    await chargeRequest(db, charge(row.workspaceId, fromPublicId("key", key.keyId)!, Number(PARTNER_PLANS["plan-9"].fiveHourLimitMicroUsd)), NOW);
    expect((await usage(plan.planId)).body.window.remaining).toBe(0);

    await patch(plan.planId, { tier: "plan-99" });
    const after = (await usage(plan.planId)).body;
    const expected = 1 - Number(PARTNER_PLANS["plan-9"].fiveHourLimitMicroUsd) / Number(PARTNER_PLANS["plan-99"].fiveHourLimitMicroUsd);
    expect(after.window.remaining).toBeCloseTo(expected, 3);
  });

  it("answers 409 on a closed plan and 404 on an unknown or malformed id", async () => {
    const { body: plan } = await open();
    await close(plan.planId);
    expect((await patch(plan.planId, { tier: "plan-9" })).status).toBe(409);
    expect((await patch(`plan_${"0".repeat(32)}`, { tier: "plan-9" })).status).toBe(404);
    expect((await patch("plan_nope", { tier: "plan-9" })).status).toBe(404);
    expect((await patch(plan.planId.replace("plan_", "key_"), { tier: "plan-9" })).status).toBe(404);
  });
});

describe("Idempotency-Key", () => {
  it("answers the same key with the same body with the same result, and refuses it with another body", async () => {
    const { body: plan } = await open({ tier: "plan-9" });
    const headers = { "idempotency-key": "change-1" };
    const first = await patch(plan.planId, { tier: "plan-99" }, headers);
    await patch(plan.planId, { tier: "plan-49" });
    const replay = await patch(plan.planId, { tier: "plan-99" }, headers);
    expect(replay).toMatchObject({ status: 200, body: first.body });
    // La repetición no volvió a aplicar el cambio: sigue el último.
    expect((await planRow(plan.planId)).subscription.planId).toBe("plan-49");

    expect((await patch(plan.planId, { tier: "plan-9" }, headers)).status).toBe(422);
    expect((await on(closePlanRoute, "POST", `/plans/${plan.planId}/close`, plan.planId, {}, headers)).status).toBe(422);
  });

  it("gives a retried key issue the same key, issued once, and keeps it only sealed", async () => {
    const { body: plan } = await open();
    const headers = { "idempotency-key": "issue-1" };
    const expiresAt = new Date(NOW + 38 * DAY).toISOString();
    const first = await issue(plan.planId, expiresAt, headers);
    const replay = await issue(plan.planId, expiresAt, headers);
    expect(replay.body).toEqual(first.body);
    expect((await planRow(plan.planId)).keys).toHaveLength(1);
    const stored = await db.select().from(partnerIdempotencyKeys);
    expect(JSON.stringify(stored, (_, value) => typeof value === "bigint" ? String(value) : value)).not.toContain(first.body.key);
  });

  it("does not keep a failed write: the same key works once the request is valid", async () => {
    const { body: plan } = await open();
    const headers = { "idempotency-key": "issue-2" };
    expect((await on(issueKeyRoute, "POST", `/plans/${plan.planId}/keys`, plan.planId, { expiresAt: "soon" }, headers)).status).toBe(400);
    expect((await issue(plan.planId, undefined, headers)).status).toBe(200);
  });

  it("forgets keys after 24 hours", async () => {
    const { body: plan } = await open({ tier: "plan-9" });
    const headers = { "idempotency-key": "change-old" };
    await patch(plan.planId, { tier: "plan-99" }, headers);
    clock = NOW + DAY + 1;
    expect((await patch(plan.planId, { tier: "plan-49" }, headers)).body.tier).toBe("plan-49");
  });
});

describe("POST /plans/{id}/close", () => {
  it("closes the plan and revokes every key of it at once, idempotently", async () => {
    const { body: plan } = await open();
    await issue(plan.planId);
    await issue(plan.planId);
    clock = NOW + 1_000;
    expect((await close(plan.planId)).status).toBe(204);
    const state = await planRow(plan.planId);
    expect(state.row.closedAt).toEqual(new Date(NOW + 1_000));
    expect(state.subscription.status).toBe("canceled");
    expect(state.keys).toHaveLength(2);
    expect(state.keys.map((key) => key.revokedAt)).toEqual([new Date(NOW + 1_000), new Date(NOW + 1_000)]);

    clock = NOW + 2_000;
    expect((await close(plan.planId)).status).toBe(204);
    expect((await close(plan.planId, { "idempotency-key": `close:${plan.planId}` })).status).toBe(204);
    expect((await planRow(plan.planId)).row.closedAt).toEqual(new Date(NOW + 1_000));
    expect((await issue(plan.planId)).status).toBe(409);
    expect((await cap(plan.planId, 5)).status).toBe(409);
    expect((await close(`plan_${"0".repeat(32)}`)).status).toBe(404);
  });
});

describe("POST /plans/{id}/keys", () => {
  it("issues a key in clear, held to the plan, its models and its expiry", async () => {
    const { body: plan } = await open();
    const expiresAt = new Date(NOW + 38 * DAY).toISOString();
    const answer = await issue(plan.planId, expiresAt);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(answer.body).toEqual({ keyId: expect.stringMatching(/^key_[0-9a-f]{32}$/), key: expect.any(String), hint: expect.any(String), expiresAt });
    expect(validateKeyFormat(answer.body.key)).toBe(true);
    expect(answer.body.hint).toBe(`wtf_${answer.body.key.slice(4, 8)}…${answer.body.key.slice(-4)}`);

    const [key] = (await planRow(plan.planId)).keys;
    expect(key).toMatchObject({
      id: fromPublicId("key", answer.body.keyId), billingSource: "plan_only", allowedModels: ["test/model-a", "test/model-b", "test/old"],
      expiresAt: new Date(expiresAt), revokedAt: null, spendLimitMicroUsd: null,
    });
    expect(key.hash).not.toBe(answer.body.key);
  });

  it("refuses an expiry in the past or more than 400 days ahead", async () => {
    const { body: plan } = await open();
    expect((await issue(plan.planId, new Date(NOW - 1).toISOString())).status).toBe(400);
    expect((await issue(plan.planId, new Date(NOW + 401 * DAY).toISOString())).status).toBe(400);
    expect((await planRow(plan.planId)).keys).toHaveLength(0);
  });

  it("charges the plan and then extra usage once a cap is set", async () => {
    const { body: plan } = await open();
    await cap(plan.planId, 2_000_000);
    await issue(plan.planId);
    expect((await planRow(plan.planId)).keys[0].billingSource).toBe("plan_then_prepaid");
  });
});

describe("POST /keys/{id}/revoke", () => {
  it("revokes at once and idempotently", async () => {
    const { body: plan } = await open();
    const { body: key } = await issue(plan.planId);
    const { body: other } = await issue(plan.planId);
    clock = NOW + 5_000;
    expect((await revoke(key.keyId)).status).toBe(204);
    clock = NOW + 9_000;
    expect((await revoke(key.keyId, { "idempotency-key": `revoke:${key.keyId}` })).status).toBe(204);
    const keys = (await planRow(plan.planId)).keys;
    expect(keys.find((row) => row.id === fromPublicId("key", key.keyId))?.revokedAt).toEqual(new Date(NOW + 5_000));
    expect(keys.find((row) => row.id === fromPublicId("key", other.keyId))?.revokedAt).toBeNull();
  });

  it("answers 404 for an unknown key and for a key that is not on a partner plan", async () => {
    expect((await revoke(`key_${"0".repeat(32)}`)).status).toBe(404);
    const workspace = await ensureDevWorkspace(db, "someone");
    const own = await createApiKey(db, { workspaceId: workspace.id, name: "Own", spendLimitMicroUsd: null });
    const answer = await revoke(`key_${own.id.replaceAll("-", "")}`);
    expect(answer.status).toBe(404);
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, own.id));
    expect(row.revokedAt).toBeNull();
  });
});

describe("GET /plans/{id}/usage", () => {
  it("starts full, with no window open and extra usage off", async () => {
    const { body: plan } = await open();
    const answer = await usage(plan.planId);
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({
      planId: plan.planId,
      window: { remaining: 1, resetsAt: null },
      week: { remaining: 1, resetsAt: null },
      extra: { spentMicroUsd: 0, capMicroUsd: null, month: "2026-11" },
      monthMicroUsd: 0,
      requestsThisMonth: 0,
      runsThisMonth: 0,
    });
  });

  it("reads what is left of the window and the week and the month's use", async () => {
    const { body: plan } = await open({ tier: "plan-9" });
    const { body: key } = await issue(plan.planId);
    const { row } = await planRow(plan.planId);
    const apiKeyId = fromPublicId("key", key.keyId)!;
    await chargeRequest(db, charge(row.workspaceId, apiKeyId, 315_000), NOW);
    await chargeRequest(db, charge(row.workspaceId, apiKeyId, 315_000), NOW + 60_000);
    const answer = (await usage(plan.planId)).body;
    expect(answer.window).toEqual({ remaining: 0.5, resetsAt: new Date(NOW + 5 * 60 * 60 * 1000).toISOString() });
    expect(answer.week.remaining).toBeCloseTo(1 - 630_000 / 5_400_000, 3);
    expect(answer.week.resetsAt).toBe(new Date(NOW + 7 * DAY).toISOString());
    expect(answer).toMatchObject({ monthMicroUsd: 630_000, requestsThisMonth: 2 });
  });

  it("reads the current month by default and refuses a malformed month", async () => {
    const { body: plan } = await open();
    expect((await usage(plan.planId, "?month=2026-11")).body).toEqual((await usage(plan.planId)).body);
    for (const month of ["2026-13", "2026-1", "26-11", "2026-11-01", "", "nov"]) {
      expect((await usage(plan.planId, `?month=${month}`)).status, month).toBe(400);
    }
  });

  it("reads a past month's totals and cap, while the window and the week stay the current ones", async () => {
    const { body: plan } = await open({ tier: "plan-9" });
    const { body: key } = await issue(plan.planId);
    const { row } = await planRow(plan.planId);
    const apiKeyId = fromPublicId("key", key.keyId)!;
    const october = Date.UTC(2026, 9, 20, 12);
    // Octubre: el tope se prendió en $3 y hubo dos requests, una pagada por el excedente.
    clock = october;
    await cap(plan.planId, 3_000_000);
    await db.insert(requests).values([
      { ...charge(row.workspaceId, apiKeyId, 400_000), planMicroUsd: BigInt(400_000), createdAt: new Date(october) },
      { ...charge(row.workspaceId, apiKeyId, 250_000), creditsMicroUsd: BigInt(250_000), createdAt: new Date(october + 1_000) },
    ]);
    await countRun(db, row.workspaceId, "a".repeat(32), october);
    // Noviembre: otro tope y una request en la ventana actual.
    clock = NOW;
    await cap(plan.planId, 5_000_000);
    await chargeRequest(db, charge(row.workspaceId, apiKeyId, 630_000), NOW);
    await db.update(requests).set({ createdAt: new Date(NOW) }).where(eq(requests.costMicroUsd, BigInt(630_000)));

    const past = (await usage(plan.planId, "?month=2026-10")).body;
    const now = (await usage(plan.planId)).body;
    expect(past).toMatchObject({
      extra: { spentMicroUsd: 250_000, capMicroUsd: 3_000_000, month: "2026-10" },
      monthMicroUsd: 650_000, requestsThisMonth: 2, runsThisMonth: 1,
    });
    expect(now).toMatchObject({
      extra: { spentMicroUsd: 0, capMicroUsd: 5_000_000, month: "2026-11" },
      monthMicroUsd: 630_000, requestsThisMonth: 1, runsThisMonth: 0,
    });
    expect(past.window).toEqual(now.window);
    expect(past.week).toEqual(now.week);
    expect(now.window.remaining).toBe(0.5);
    // Antes del primer tope el excedente estaba apagado; un mes sin uso responde ceros.
    expect((await usage(plan.planId, "?month=2026-09")).body).toMatchObject({
      extra: { spentMicroUsd: 0, capMicroUsd: null, month: "2026-09" }, monthMicroUsd: 0, requestsThisMonth: 0, runsThisMonth: 0,
    });
    // Un plan cerrado sigue mostrando sus meses pasados.
    await close(plan.planId);
    expect((await usage(plan.planId, "?month=2026-10")).body).toMatchObject({ monthMicroUsd: 650_000, runsThisMonth: 1 });
  });

  it("answers 404 for a plan of nobody", async () => {
    expect((await usage(`plan_${"0".repeat(32)}`)).status).toBe(404);
  });
});

describe("PUT /plans/{id}/extra-cap", () => {
  it("turns extra usage on up to a cap and off with null", async () => {
    const { body: plan } = await open();
    await issue(plan.planId);
    expect((await cap(plan.planId, 3_500_000)).status).toBe(204);
    let state = await planRow(plan.planId);
    expect(state.workspace).toMatchObject({ overflowMode: "continue", overflowCredits: true, overflowPacks: false, overflowCapMicroUsd: BigInt(3_500_000) });
    expect(state.keys[0].billingSource).toBe("plan_then_prepaid");
    expect((await usage(plan.planId)).body.extra).toEqual({ spentMicroUsd: 0, capMicroUsd: 3_500_000, month: "2026-11" });

    expect((await cap(plan.planId, 0)).status).toBe(204);
    expect((await usage(plan.planId)).body.extra.capMicroUsd).toBe(0);

    expect((await cap(plan.planId, null)).status).toBe(204);
    state = await planRow(plan.planId);
    expect(state.workspace).toMatchObject({ overflowMode: "stop", overflowCredits: false });
    expect(state.keys[0].billingSource).toBe("plan_only");
    expect((await usage(plan.planId)).body.extra.capMicroUsd).toBeNull();
  });

  it("refuses a negative, fractional, missing or huge cap", async () => {
    const { body: plan } = await open();
    expect((await cap(plan.planId, -1)).status).toBe(400);
    expect((await cap(plan.planId, 1.5)).status).toBe(400);
    expect((await cap(plan.planId, "5")).status).toBe(400);
    expect((await cap(plan.planId, 1e15)).status).toBe(400);
    expect((await on(extraCapRoute, "PUT", `/plans/${plan.planId}/extra-cap`, plan.planId, {})).status).toBe(400);
  });
});

describe("runs (x-deska-run)", () => {
  it("reads only a 32-hex digest from the header", () => {
    const digest = "0123456789abcdef0123456789abcdef";
    expect(deskaRun(new Headers({ "x-deska-run": digest }))).toBe(digest);
    expect(deskaRun(new Headers({ "x-deska-run": ` ${digest.toUpperCase()} ` }))).toBe(digest);
    expect(deskaRun(new Headers())).toBeNull();
    for (const value of ["", "run-1", digest.slice(1), `${digest}0`, "g".repeat(32)]) {
      expect(deskaRun(new Headers({ "x-deska-run": value })), value).toBeNull();
    }
  });

  it("counts each run once per plan and month, and only on partner plans", async () => {
    const { body: plan } = await open();
    const { row } = await planRow(plan.planId);
    const [a, b] = ["a".repeat(32), "b".repeat(32)];
    await countRun(db, row.workspaceId, a, NOW);
    await countRun(db, row.workspaceId, a, NOW + 60_000);
    await countRun(db, row.workspaceId, b, NOW);
    await countRun(db, row.workspaceId, a, Date.UTC(2026, 11, 1));
    expect((await usage(plan.planId)).body.runsThisMonth).toBe(2);
    expect((await usage(plan.planId, "?month=2026-12")).body.runsThisMonth).toBe(1);

    const someone = await ensureDevWorkspace(db, "not-a-seat");
    await countRun(db, someone.id, a, NOW);
    const rows = await db.select().from(partnerRuns);
    expect(rows).toHaveLength(3);
    expect(rows.every((run) => run.planId === row.id)).toBe(true);
  });
});

describe("partner plans in the billing state", () => {
  it("resolve to their limits while the subscription is active", () => {
    const subscription = { planId: "plan-49", status: "active" as const, currentPeriodEnd: new Date(NOW + DAY) };
    expect(activePlan(subscription, NOW)).toMatchObject({ fiveHourLimitMicroUsd: BigInt(6_860_000), weekLimitMicroUsd: BigInt(29_400_000), rateLimitRpm: 120 });
    expect(activePlan({ ...subscription, status: "canceled" }, NOW)).toBeNull();
    expect(activePlan({ ...subscription, planId: "plan-20" }, NOW)).toBeNull();
  });
});

describe("the proxy", () => {
  it("leaves /partner/ alone, so the door is never redirected to a language", async () => {
    // El helper de Next lee AsyncLocalStorage del global, como en su runtime.
    (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
    const { unstable_doesMiddlewareMatch: matches } = await import("next/experimental/testing/server");
    const { config } = await import("@/proxy");
    expect(matches({ config, url: "/partner/v1/plans" })).toBe(false);
    expect(matches({ config, url: "/partner/v1/plans/plan_1/usage" })).toBe(false);
    expect(matches({ config, url: "/es/models" })).toBe(true);
    expect(matches({ config, url: "/partners" })).toBe(true);
  });
});

describe("error bodies", () => {
  it("never carry a key", async () => {
    const { body: plan } = await open();
    const headers = { "idempotency-key": "issue-leak" };
    const { body: key } = await issue(plan.planId, undefined, headers);
    // La misma key con otro body: el error no repite la respuesta guardada.
    const reused = await issue(plan.planId, new Date(NOW + 2 * DAY).toISOString(), headers);
    expect(reused.status).toBe(422);
    expect(reused.text).not.toContain(key.key);
    expect(errorBodies.length).toBeGreaterThan(0);
    for (const body of errorBodies) {
      expect(body).not.toMatch(KEY_PATTERN);
      expect(body.toLowerCase()).not.toMatch(/inferhub|openrouter|anthropic|openai/);
      expect(Object.keys(JSON.parse(body).error).sort()).toEqual(["code", "message"]);
    }
  });
});
