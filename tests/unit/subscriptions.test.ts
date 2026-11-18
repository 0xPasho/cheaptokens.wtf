// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { chargeRequest, grantCredits } from "@/lib/billing/ledger";
import { FIVE_HOUR_MS, PACK_VALIDITY_MS, PLANS } from "@/lib/billing/plans";
import {
  activateSubscription, recordPackPurchase, recordTopUp, scheduleDowngrade, setCancelAtPeriodEnd, upgradeCharge, upgradeSubscription,
} from "@/lib/billing/purchases";
import { reconcile } from "@/lib/billing/reconcile";
import type { RequestRecord } from "@/lib/billing/types";
import { createApiKey, ensureDevWorkspace } from "@/lib/billing/workspaces";
import { apiKeys, modelPacks, models, payments, requests, subscriptions, usageWindows, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/db/uuid";

import { createTestDb } from "../helpers/db";

const MODEL = "anthropic/claude-opus-5.5";
const now = Date.UTC(2026, 10, 15, 15);
let seq = 0;
const pay = () => ({ provider: "dev", externalId: `dev_${++seq}` });

async function seed(db: Db, billingSource: "plan_then_prepaid" | "plan_only" | "prepaid_only" = "plan_then_prepaid") {
  const workspace = await ensureDevWorkspace(db, `sub-${billingSource}`);
  const key = await createApiKey(db, { workspaceId: workspace.id, name: "Test key", spendLimitMicroUsd: null, billingSource });
  await db.insert(models).values({
    id: MODEL, name: "Claude Opus 5.5", author: "anthropic", description: { en: "Test" }, contextLength: 200_000,
    officialInputPriceMicroUsd: BigInt(4_000_000), officialOutputPriceMicroUsd: BigInt(20_000_000),
    officialPriceSourceUrl: "https://example.com/pricing", discountBps: 8800,
    inputPriceMicroUsd: BigInt(480_000), outputPriceMicroUsd: BigInt(2_400_000), tags: [], status: "active",
  }).onConflictDoNothing();
  return { workspace, key };
}

function record(fixture: Awaited<ReturnType<typeof seed>>, cost: number): RequestRecord {
  return {
    id: uuidv7(), workspaceId: fixture.workspace.id, apiKeyId: fixture.key.id, modelId: MODEL, upstreamId: null,
    attempts: 1, stream: false, status: "success", httpStatus: 200, errorCode: null, promptTokens: 10, completionTokens: 10,
    cachedTokens: null, usageEstimated: false, costMicroUsd: BigInt(cost), upstreamCostMicroUsd: BigInt(1),
    officialCostMicroUsd: BigInt(cost * 10), ttfbMs: 10, latencyMs: 20,
  };
}

describe("subscription billing", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  beforeEach(async () => { testDb = await createTestDb(); });
  afterEach(async () => { await testDb?.close(); });

  async function subscribe(workspaceId: string) {
    await activateSubscription(testDb.db, { workspaceId, planId: "pro", payment: pay(), now });
  }
  const windows = (workspaceId: string) => testDb.db.select().from(usageWindows).where(eq(usageWindows.workspaceId, workspaceId));
  const lastRequest = async () => (await testDb.db.select().from(requests)).at(-1);

  it("charges the plan, opens both windows and leaves the balance untouched", async () => {
    const fixture = await seed(testDb.db);
    await subscribe(fixture.workspace.id);
    await chargeRequest(testDb.db, record(fixture, 1_000), now);
    await chargeRequest(testDb.db, record(fixture, 500), now + 60_000);

    const rows = await windows(fixture.workspace.id);
    expect(rows.map((row) => [row.kind, row.usedMicroUsd, row.resetsAt.getTime()]).sort()).toEqual([
      ["five_hour", BigInt(1_500), now + FIVE_HOUR_MS],
      ["week", BigInt(1_500), now + 7 * 24 * 3_600_000],
    ]);
    const [workspace] = await testDb.db.select().from(workspaces).where(eq(workspaces.id, fixture.workspace.id));
    expect(workspace.balanceMicroUsd).toBe(BigInt(0));
    expect(await lastRequest()).toMatchObject({ planMicroUsd: BigInt(500), creditsMicroUsd: BigInt(0) });
  });

  it("opens a new window after the old one resets", async () => {
    const fixture = await seed(testDb.db);
    await subscribe(fixture.workspace.id);
    await chargeRequest(testDb.db, record(fixture, 1_000), now);
    await chargeRequest(testDb.db, record(fixture, 300), now + FIVE_HOUR_MS);
    const fiveHour = (await windows(fixture.workspace.id)).find((row) => row.kind === "five_hour");
    expect(fiveHour).toMatchObject({ usedMicroUsd: BigInt(300), resetsAt: new Date(now + 2 * FIVE_HOUR_MS) });
  });

  it("splits a request that crosses the limit: plan, then pack, then credits, and reconciles", async () => {
    const fixture = await seed(testDb.db);
    await subscribe(fixture.workspace.id);
    await recordTopUp(testDb.db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(10_000_000), payment: pay() });
    await recordPackPurchase(testDb.db, { workspaceId: fixture.workspace.id, modelId: MODEL, payment: pay(), now });
    const limit = Number(PLANS.pro.fiveHourLimitMicroUsd);
    await chargeRequest(testDb.db, record(fixture, limit - 100), now);
    await chargeRequest(testDb.db, record(fixture, 24_000_100), now + 1);

    expect(await lastRequest()).toMatchObject({
      planMicroUsd: BigInt(100), packMicroUsd: BigInt(24_000_000), creditsMicroUsd: BigInt(0), absorbedMicroUsd: BigInt(0),
    });
    await chargeRequest(testDb.db, record(fixture, 700), now + 2);
    expect(await lastRequest()).toMatchObject({ planMicroUsd: BigInt(0), packMicroUsd: BigInt(0), creditsMicroUsd: BigInt(700) });
    const [workspace] = await testDb.db.select().from(workspaces).where(eq(workspaces.id, fixture.workspace.id));
    expect(workspace).toMatchObject({ balanceMicroUsd: BigInt(9_999_300), overflowSpentMicroUsd: BigInt(700), overflowMonth: "2026-11-01" });
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [], keySpendMismatches: [], packMismatches: [] });
  });

  it("absorbs the excess when overflow is off and caps overflow credits per month", async () => {
    const fixture = await seed(testDb.db);
    await subscribe(fixture.workspace.id);
    await grantCredits(testDb.db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(5_000_000), note: "Test" });
    await testDb.db.update(workspaces).set({ overflowMode: "stop" }).where(eq(workspaces.id, fixture.workspace.id));
    const limit = Number(PLANS.pro.fiveHourLimitMicroUsd);
    await chargeRequest(testDb.db, record(fixture, limit + 50), now);
    expect(await lastRequest()).toMatchObject({ planMicroUsd: BigInt(limit), absorbedMicroUsd: BigInt(50), creditsMicroUsd: BigInt(0) });

    await testDb.db.update(workspaces).set({ overflowMode: "continue", overflowCapMicroUsd: BigInt(300) }).where(eq(workspaces.id, fixture.workspace.id));
    await chargeRequest(testDb.db, record(fixture, 200), now + 1);
    await chargeRequest(testDb.db, record(fixture, 200), now + 2);
    expect(await lastRequest()).toMatchObject({ creditsMicroUsd: BigInt(100), absorbedMicroUsd: BigInt(100) });
    expect(await reconcile(testDb.db)).toMatchObject({ balanceMismatches: [], keySpendMismatches: [], packMismatches: [] });
  });

  it("prepaid-only keys never touch the plan windows", async () => {
    const fixture = await seed(testDb.db, "prepaid_only");
    await subscribe(fixture.workspace.id);
    await chargeRequest(testDb.db, record(fixture, 400), now);
    expect(await windows(fixture.workspace.id)).toEqual([]);
    expect(await lastRequest()).toMatchObject({ planMicroUsd: BigInt(0), creditsMicroUsd: BigInt(400) });
  });

  it("keeps windows exact under 40 parallel charges", async () => {
    const fixture = await seed(testDb.db);
    await subscribe(fixture.workspace.id);
    await Promise.all(Array.from({ length: 40 }, () => chargeRequest(testDb.db, record(fixture, 1_000), now)));
    const rows = await windows(fixture.workspace.id);
    expect(rows.map((row) => row.usedMicroUsd)).toEqual([BigInt(40_000), BigInt(40_000)]);
  });

  it("applies each payment once, upgrades with a prorated charge and schedules downgrades", async () => {
    const fixture = await seed(testDb.db);
    const payment = pay();
    expect(await recordTopUp(testDb.db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(25_000_000), payment })).toBe(true);
    expect(await recordTopUp(testDb.db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(25_000_000), payment })).toBe(false);
    await subscribe(fixture.workspace.id);

    const halfway = now + 15 * 24 * 3_600_000;
    const charge = upgradeCharge("pro", "max", now + 30 * 24 * 3_600_000, halfway);
    expect(charge).toBe(BigInt(30_000_000));
    await upgradeSubscription(testDb.db, { workspaceId: fixture.workspace.id, planId: "max", amountMicroUsd: charge, payment: pay() });
    await scheduleDowngrade(testDb.db, fixture.workspace.id, "plus");
    await setCancelAtPeriodEnd(testDb.db, fixture.workspace.id, true);
    const [subscription] = await testDb.db.select().from(subscriptions);
    expect(subscription).toMatchObject({ planId: "max", nextPlanId: "plus", cancelAtPeriodEnd: true, status: "active" });
    expect((await testDb.db.select().from(payments)).map((row) => row.kind)).toEqual(["topup", "subscription", "subscription"]);
    const [workspace] = await testDb.db.select().from(workspaces).where(eq(workspaces.id, fixture.workspace.id));
    expect(workspace.balanceMicroUsd).toBe(BigInt(25_000_000));
  });

  it("a rotated key frees its slot once its grace period ends", async () => {
    const fixture = await seed(testDb.db);
    for (let index = 1; index < 25; index++) {
      await createApiKey(testDb.db, { workspaceId: fixture.workspace.id, name: `key ${index}`, spendLimitMicroUsd: null });
    }
    const create = () => createApiKey(testDb.db, { workspaceId: fixture.workspace.id, name: "extra", spendLimitMicroUsd: null });
    await testDb.db.update(apiKeys).set({ expiresAt: new Date(Date.now() + 60_000) }).where(eq(apiKeys.id, fixture.key.id));
    await expect(create()).rejects.toThrow("25 active");
    await testDb.db.update(apiKeys).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(apiKeys.id, fixture.key.id));
    await expect(create()).resolves.toMatchObject({ hint: expect.stringMatching(/^wtf_/) });
  });

  it("grants packs with the bonus and expiry", async () => {
    const fixture = await seed(testDb.db);
    await recordPackPurchase(testDb.db, { workspaceId: fixture.workspace.id, modelId: MODEL, payment: pay(), now });
    expect(await testDb.db.select().from(modelPacks)).toMatchObject([{
      paidMicroUsd: BigInt(20_000_000), grantedMicroUsd: BigInt(24_000_000), balanceMicroUsd: BigInt(24_000_000),
      expiresAt: new Date(now + PACK_VALIDITY_MS),
    }]);
    await expect(recordPackPurchase(testDb.db, { workspaceId: fixture.workspace.id, modelId: "test/none", payment: pay(), now }))
      .rejects.toThrow("There is no pack");
  });
});
