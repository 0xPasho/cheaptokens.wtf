// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { reconcile } from "@/lib/billing/reconcile";
import { partnerPlans, partnerRuns, requests, usageWindows, workspaces } from "@/lib/db/schema";
import {
  changePlanRoute, closePlanRoute, extraCapRoute, issueKeyRoute, openPlanRoute, type PartnerDeps, revokeKeyRoute, usageRoute,
} from "@/lib/partner/http";
import { fromPublicId } from "@/lib/partner/ids";
import { PARTNER_PLANS, type PartnerTier } from "@/lib/partner/tiers";

import { startGatewayHarness } from "../helpers/gateway-harness";

type Harness = Awaited<ReturnType<typeof startGatewayHarness>>;
const harnesses: Harness[] = [];
const SECRET = "partner-secret-for-gateway-tests-0123456789";
const DAY = 24 * 60 * 60 * 1000;
/** Activo en el catálogo de pruebas y servido por el upstream simulado. */
const model = "anthropic/claude-haiku-4.5";
let seq = 0;

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
});

async function setup(tier: PartnerTier = "plan-9") {
  const harness = await startGatewayHarness();
  harnesses.push(harness);
  const deps: PartnerDeps = { db: harness.db, now: Date.now, env: { PARTNER_DESKA_SECRET: SECRET } };
  const call = async (method: string, path: string, body?: unknown) => {
    const request = new Request(`http://door.test/partner/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json", ...(method === "GET" ? {} : { "idempotency-key": `gw-${++seq}` }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const [, , id, action] = path.split("?")[0].split("/");
    const response = path === "/plans" ? await openPlanRoute(request, deps)
      : path.startsWith("/keys/") ? await revokeKeyRoute(request, deps, path.split("/")[2])
        : action === "close" ? await closePlanRoute(request, deps, id)
          : action === "keys" ? await issueKeyRoute(request, deps, id)
            : action === "usage" ? await usageRoute(request, deps, id)
              : action === "extra-cap" ? await extraCapRoute(request, deps, id)
                : await changePlanRoute(request, deps, id);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const plan = (await call("POST", "/plans", {
    externalRef: `deska:team:t:user:${++seq}`, tier, paidThrough: new Date(Date.now() + 30 * DAY).toISOString(),
  })).body;
  const issue = async () => (await call("POST", `/plans/${plan.planId}/keys`, { expiresAt: new Date(Date.now() + 38 * DAY).toISOString() })).body;
  const [row] = await harness.db.select().from(partnerPlans).where(eq(partnerPlans.id, fromPublicId("plan", plan.planId)!));
  return { harness, call, plan, issue, workspaceId: row.workspaceId };
}

/** Llama al gateway real con la key del plan. */
async function complete(harness: Harness, key: string, headers: Record<string, string> = {}) {
  const response = await fetch(`${harness.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...headers },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }] }),
  });
  const body = await response.json() as { error?: { code: string } };
  await harness.flushAfter();
  return { status: response.status, code: body.error?.code ?? null, headers: response.headers };
}

/** Deja la ventana de 5 horas del plan en su límite, como si ya se hubiera usado. */
async function exhaustWindow(harness: Harness, workspaceId: string, tier: PartnerTier) {
  const now = Date.now();
  const used = PARTNER_PLANS[tier].fiveHourLimitMicroUsd;
  for (const kind of ["five_hour", "week"] as const) {
    const resetsAt = new Date(now + (kind === "five_hour" ? 5 * 60 * 60 * 1000 : 7 * DAY));
    await harness.db.insert(usageWindows).values({ workspaceId, kind, startedAt: new Date(now), resetsAt, usedMicroUsd: used })
      .onConflictDoUpdate({ target: [usageWindows.workspaceId, usageWindows.kind], set: { usedMicroUsd: used, resetsAt } });
  }
}

describe("a partner plan through the gateway", () => {
  it("answers with the plan's usage headers and charges the plan, not a balance", async () => {
    const { harness, issue, workspaceId } = await setup();
    const key = await issue();
    const answer = await complete(harness, key.key);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("x-usage-window-remaining")).toBe("1");
    expect(answer.headers.get("x-usage-week-remaining")).toBe("1");
    const [request] = await harness.db.select().from(requests).where(eq(requests.workspaceId, workspaceId));
    expect(request.planMicroUsd).toBe(request.costMicroUsd);
    expect(request.creditsMicroUsd).toBe(BigInt(0));
  });

  it("refuses a revoked key with 401 invalid_api_key on the very next request", async () => {
    const { harness, call, issue } = await setup();
    const key = await issue();
    const next = await issue();
    expect((await complete(harness, key.key)).status).toBe(200);
    expect((await call("POST", `/keys/${key.keyId}/revoke`, {})).status).toBe(204);
    expect(await complete(harness, key.key)).toMatchObject({ status: 401, code: "invalid_api_key" });
    expect((await complete(harness, next.key)).status).toBe(200);
  });

  it("refuses every key of a closed plan with 401 invalid_api_key", async () => {
    const { harness, call, plan, issue } = await setup();
    const first = await issue();
    const second = await issue();
    expect((await call("POST", `/plans/${plan.planId}/close`, {})).status).toBe(204);
    expect(await complete(harness, first.key)).toMatchObject({ status: 401, code: "invalid_api_key" });
    expect(await complete(harness, second.key)).toMatchObject({ status: 401, code: "invalid_api_key" });
  });

  it("answers 429 usage_limit_reached at the limit while extra usage is off, and goes on with a cap billed to the partner", async () => {
    const { harness, call, plan, issue, workspaceId } = await setup("plan-9");
    const key = await issue();
    await exhaustWindow(harness, workspaceId, "plan-9");
    const limited = await complete(harness, key.key);
    expect(limited).toMatchObject({ status: 429, code: "usage_limit_reached" });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    expect((await call("PUT", `/plans/${plan.planId}/extra-cap`, { capMicroUsd: 1_000_000 })).status).toBe(204);
    expect((await complete(harness, key.key)).status).toBe(200);
    const [request] = await harness.db.select().from(requests).where(eq(requests.workspaceId, workspaceId));
    expect(request.creditsMicroUsd).toBe(request.costMicroUsd);
    expect(request.creditsMicroUsd).toBeGreaterThan(BigInt(0));
    // Pospago: el saldo del asiento baja de cero; es lo que debe el socio. La conciliación sigue cuadrando.
    const [workspace] = await harness.db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(workspace.balanceMicroUsd).toBe(-request.creditsMicroUsd);
    expect((await reconcile(harness.db)).balanceMismatches).toEqual([]);
    const usage = (await call("GET", `/plans/${plan.planId}/usage`)).body;
    expect(usage.extra.spentMicroUsd).toBe(Number(request.creditsMicroUsd));
    expect(usage.window.remaining).toBe(0);

    // Un tope por debajo de lo gastado queda alcanzado; null vuelve a apagarlo.
    expect((await call("PUT", `/plans/${plan.planId}/extra-cap`, { capMicroUsd: 1 })).status).toBe(204);
    expect(await complete(harness, key.key)).toMatchObject({ status: 429, code: "usage_limit_reached" });
    expect((await call("PUT", `/plans/${plan.planId}/extra-cap`, { capMicroUsd: null })).status).toBe(204);
    expect(await complete(harness, key.key)).toMatchObject({ status: 429, code: "usage_limit_reached" });
  });

  it("applies a tier change from the next request", async () => {
    const { harness, call, plan, issue, workspaceId } = await setup("plan-9");
    const key = await issue();
    await exhaustWindow(harness, workspaceId, "plan-9");
    expect((await complete(harness, key.key)).status).toBe(429);
    expect((await call("PATCH", `/plans/${plan.planId}`, { tier: "plan-99" })).body.tier).toBe("plan-99");
    expect((await complete(harness, key.key)).status).toBe(200);
    expect((await call("PATCH", `/plans/${plan.planId}`, { tier: "plan-9" })).status).toBe(200);
    expect((await complete(harness, key.key)).status).toBe(429);
  });

  it("counts distinct x-deska-run digests per plan and month, and nothing without the header", async () => {
    const { harness, call, plan, issue } = await setup();
    const key = await issue();
    const [a, b] = ["0123456789abcdef0123456789abcdef", "fedcba9876543210fedcba9876543210"];
    const calls: Record<string, string>[] = [{ "x-deska-run": a }, { "x-deska-run": a }, { "x-deska-run": b }, {}, { "x-deska-run": "not-a-digest" }];
    for (const headers of calls) {
      expect((await complete(harness, key.key, headers)).status).toBe(200);
    }
    const usage = (await call("GET", `/plans/${plan.planId}/usage`)).body;
    expect(usage).toMatchObject({ requestsThisMonth: 5, runsThisMonth: 2 });
    expect((await call("GET", `/plans/${plan.planId}/usage?month=2026-01`)).body.runsThisMonth).toBe(0);
    // El digest se guarda, nunca se loguea.
    expect(harness.logs.join("\n")).not.toContain(a);
  });

  it("does not count runs on a key that is not on a partner plan", async () => {
    const { harness } = await setup();
    expect((await complete(harness, harness.apiKey, { "x-deska-run": "a".repeat(32) })).status).toBe(200);
    expect(await harness.db.select().from(partnerRuns)).toEqual([]);
  });

  it("holds a key to the plan's models: a hidden model works in the API but not on a plan", async () => {
    const { harness, plan, issue } = await setup();
    expect(plan.models).toContain(model);
    expect(plan.models).not.toContain("qwen/qwen3.8-flash");
    const key = await issue();
    const response = await fetch(`${harness.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${key.key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "qwen/qwen3.8-flash", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "model_not_allowed_for_key" } });
  });
});
