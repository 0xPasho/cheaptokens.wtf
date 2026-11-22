// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateKey } from "@/lib/api-keys";
import { apiKeys, subscriptions, usageWindows, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { PLANS } from "@/lib/billing/plans";
import { admitUsage, authenticate, checkAccount } from "@/lib/gateway/authenticate";
import type { AuthContext } from "@/lib/gateway/types";

import { createTestDb } from "../../helpers/db";

const invalidKey = { ok: false, code: "invalid_api_key" };
const validKey = generateKey().key;
const badChecksum = `${validKey.slice(0, -1)}${validKey.endsWith("0") ? "1" : "0"}`;

describe("authenticate: local validation", () => {
  it.each([
    null,
    "",
    "   ",
    `Basic ${validKey}`,
    `Token ${validKey}`,
    "Bearer",
    "Bearer   ",
    `Bearer${validKey}`,
    `Bearer ${validKey} extra`,
    "Bearer garbage",
    `Bearer ${validKey.slice(1)}`,
    `Bearer ${validKey}0`,
    `Bearer WTF_${validKey.slice(4)}`,
    `Bearer ${validKey.slice(0, -1)}!`,
    `Bearer ${badChecksum}`,
  ])("rejects malformed authorization without touching the database (%#)", async (authorization) => {
    const access = vi.fn(() => { throw new Error("Database must not be used"); });
    const db = new Proxy({} as Db, { get: access });

    await expect(authenticate(authorization, db)).resolves.toEqual(invalidKey);
    expect(access).not.toHaveBeenCalled();
  });
});

describe("authenticate: database lookup", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await testDb?.close();
  });

  async function seed(
    workspaceOverrides: Partial<typeof workspaces.$inferInsert> = {},
    keyOverrides: Partial<typeof apiKeys.$inferInsert> = {},
  ) {
    const generated = generateKey();
    const [workspace] = await testDb.db.insert(workspaces).values({
      clerkUserId: "auth-user",
      balanceMicroUsd: BigInt("9007199254740993"),
      rateLimitRpm: 120,
      ...workspaceOverrides,
    }).returning();
    const [key] = await testDb.db.insert(apiKeys).values({
      workspaceId: workspace.id,
      name: "Test key",
      hash: generated.hash,
      hint: generated.hint,
      spendLimitMicroUsd: BigInt("9007199254740995"),
      spentMicroUsd: BigInt("9007199254740992"),
      ...keyOverrides,
    }).returning();
    return { generated, workspace, key };
  }

  it("returns the matching key and workspace in one lookup without writes", async () => {
    const { db } = testDb;
    const { generated, workspace, key } = await seed();
    await db.insert(workspaces).values({ clerkUserId: "other-user", balanceMicroUsd: BigInt(0) });
    const beforeWorkspaces = await db.select().from(workspaces);
    const select = vi.spyOn(db, "select");

    await expect(authenticate(`Bearer ${generated.key}`, db)).resolves.toEqual({
      ok: true,
      context: {
        apiKeyId: key.id,
        workspaceId: workspace.id,
        balanceMicroUsd: workspace.balanceMicroUsd,
        spendLimitMicroUsd: key.spendLimitMicroUsd,
        spentMicroUsd: key.spentMicroUsd,
        suspended: false,
        rateLimitRpm: 120,
        billingSource: "plan_then_prepaid",
        allowedModels: null,
        plan: null,
        overflow: { mode: "continue", packs: true, credits: true, capMicroUsd: BigInt(25_000_000), spentThisMonthMicroUsd: BigInt(0) },
      },
    });
    expect(select).toHaveBeenCalledTimes(1);
    select.mockRestore();

    expect(await db.select().from(apiKeys)).toEqual([key]);
    expect(await db.select().from(workspaces)).toEqual(beforeWorkspaces);
  });

  it.each(["Bearer", "bearer", "BEARER", "bEaReR"])(
    "accepts %s with surrounding whitespace", async (scheme) => {
      const { generated } = await seed();
      await expect(authenticate(` \t${scheme}   ${generated.key}\t `, testDb.db))
        .resolves.toMatchObject({ ok: true });
    },
  );

  it("preserves null limits and rate overrides", async () => {
    const { generated } = await seed({ rateLimitRpm: null }, { spendLimitMicroUsd: null });
    await expect(authenticate(`Bearer ${generated.key}`, testDb.db)).resolves.toMatchObject({
      ok: true,
      context: { spendLimitMicroUsd: null, rateLimitRpm: null },
    });
  });

  it("rejects a well-formed key whose hash is not stored", async () => {
    await seed();
    await expect(authenticate(`Bearer ${generateKey().key}`, testDb.db)).resolves.toEqual(invalidKey);
  });

  it("rejects a revoked key with the same public error", async () => {
    const { generated } = await seed({}, { revokedAt: new Date() });
    await expect(authenticate(`Bearer ${generated.key}`, testDb.db)).resolves.toEqual(invalidKey);
  });

  it("rejects an active key belonging to a deleted workspace with the same public error", async () => {
    const { generated } = await seed({ deletedAt: new Date() });
    await expect(authenticate(`Bearer ${generated.key}`, testDb.db)).resolves.toEqual(invalidKey);
  });

  it("reads the active plan and its windows in the same lookup", async () => {
    const now = Date.UTC(2026, 10, 15, 15);
    const { generated, workspace } = await seed({ rateLimitRpm: null });
    await testDb.db.insert(subscriptions).values({
      workspaceId: workspace.id, planId: "pro", status: "active", paymentProvider: "dev",
      currentPeriodStart: new Date(now - 86_400_000), currentPeriodEnd: new Date(now + 86_400_000),
    });
    await testDb.db.insert(usageWindows).values([
      { workspaceId: workspace.id, kind: "five_hour", startedAt: new Date(now - 3_600_000), resetsAt: new Date(now + 3_600_000), usedMicroUsd: BigInt(1_000) },
      { workspaceId: workspace.id, kind: "week", startedAt: new Date(now - 86_400_000), resetsAt: new Date(now + 86_400_000), usedMicroUsd: BigInt(5_000) },
    ]);
    const select = vi.spyOn(testDb.db, "select");
    const result = await authenticate(`Bearer ${generated.key}`, testDb.db, now);
    expect(select).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      context: {
        rateLimitRpm: PLANS.pro.rateLimitRpm,
        plan: {
          plan: PLANS.pro,
          fiveHour: { usedMicroUsd: BigInt(1_000), resetsAt: now + 3_600_000 },
          week: { usedMicroUsd: BigInt(5_000), resetsAt: now + 86_400_000 },
        },
      },
    });
  });

  it("ignores an expired or canceled subscription", async () => {
    const now = Date.UTC(2026, 10, 15, 15);
    const { generated, workspace } = await seed();
    await testDb.db.insert(subscriptions).values({
      workspaceId: workspace.id, planId: "pro", status: "active", paymentProvider: "dev",
      currentPeriodStart: new Date(now - 2 * 86_400_000), currentPeriodEnd: new Date(now - 1),
    });
    await expect(authenticate(`Bearer ${generated.key}`, testDb.db, now)).resolves.toMatchObject({ ok: true, context: { plan: null } });
  });

  it("rejects a rotated key once its grace period ends", async () => {
    const now = Date.UTC(2026, 10, 15, 15);
    const { generated } = await seed({}, { expiresAt: new Date(now + 1_000) });
    await expect(authenticate(`Bearer ${generated.key}`, testDb.db, now)).resolves.toMatchObject({ ok: true });
    await expect(authenticate(`Bearer ${generated.key}`, testDb.db, now + 1_000)).resolves.toEqual(invalidKey);
  });

  it("checks pack balance only when the plan does not cover the request", async () => {
    const now = Date.UTC(2026, 10, 15, 15);
    const { generated } = await seed({ balanceMicroUsd: BigInt(0) }, { billingSource: "prepaid_only" });
    const result = await authenticate(`Bearer ${generated.key}`, testDb.db, now);
    if (!result.ok) throw new Error("Expected valid credentials");
    await expect(admitUsage(result.context, "anthropic/claude-opus-5.5", testDb.db, now, BigInt(1)))
      .resolves.toEqual({ ok: false, code: "insufficient_credits", retryAt: null });
  });

  it("reports whether the plan alone covered the request, and always checks prepaid when told to", async () => {
    const now = Date.UTC(2026, 10, 15, 15);
    const { generated, workspace } = await seed({ balanceMicroUsd: BigInt(5_000_000) });
    await testDb.db.insert(subscriptions).values({
      workspaceId: workspace.id, planId: "plus", status: "active", paymentProvider: "dev",
      currentPeriodStart: new Date(now - 86_400_000), currentPeriodEnd: new Date(now + 86_400_000),
    });
    const result = await authenticate(`Bearer ${generated.key}`, testDb.db, now);
    if (!result.ok) throw new Error("Expected valid credentials");
    const planLeft = PLANS.plus.fiveHourLimitMicroUsd;
    const admit = (planMustCover: bigint | null) => admitUsage(result.context, "anthropic/claude-opus-5.5", testDb.db, now, planMustCover);

    const budgetMicroUsd = planLeft + BigInt(5_000_000);

    // El plan cubre el request y lo ya reservado: no se consultan paquetes ni excedente de socio.
    await expect(admit(planLeft)).resolves.toEqual({ ok: true, usesPlan: true, budgetMicroUsd, planOnly: true });
    // Un micro más (otra reserva en curso) y ya se consultan.
    await expect(admit(planLeft + BigInt(1))).resolves.toEqual({ ok: true, usesPlan: true, budgetMicroUsd, planOnly: false });
    await expect(admit(null)).resolves.toEqual({ ok: true, usesPlan: true, budgetMicroUsd, planOnly: false });
  });

  it("leaves suspension, balance and spend checks to checkAccount", async () => {
    const { generated } = await seed(
      { suspendedAt: new Date(), balanceMicroUsd: BigInt(-1) },
      { spendLimitMicroUsd: BigInt(0), spentMicroUsd: BigInt(0) },
    );
    const result = await authenticate(`Bearer ${generated.key}`, testDb.db);
    expect(result).toMatchObject({ ok: true, context: { suspended: true, balanceMicroUsd: BigInt(-1) } });
    if (!result.ok) throw new Error("Expected valid credentials");
    expect(checkAccount(result.context, "any/model")).toBe("account_suspended");
  });

  it("rejects the very next call after revocation", async () => {
    const { generated, key } = await seed();
    const authorization = `Bearer ${generated.key}`;
    await expect(authenticate(authorization, testDb.db)).resolves.toMatchObject({ ok: true });

    await testDb.db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, key.id));

    await expect(authenticate(authorization, testDb.db)).resolves.toEqual(invalidKey);
  });
});

describe("checkAccount", () => {
  const context: AuthContext = {
    apiKeyId: "key-id",
    workspaceId: "workspace-id",
    balanceMicroUsd: BigInt(1),
    spendLimitMicroUsd: null,
    spentMicroUsd: BigInt(0),
    suspended: false,
    rateLimitRpm: null,
    billingSource: "plan_then_prepaid",
    allowedModels: null,
    plan: null,
    overflow: { mode: "continue", packs: true, credits: true, capMicroUsd: BigInt(0), spentThisMonthMicroUsd: BigInt(0) },
  };

  it("rejects a suspended workspace", () => {
    expect(checkAccount({ ...context, suspended: true }, "any/model")).toBe("account_suspended");
  });

  it("rejects a model outside the key's allowed list", () => {
    expect(checkAccount({ ...context, allowedModels: ["a/one"] }, "a/two")).toBe("model_not_allowed_for_key");
    expect(checkAccount({ ...context, allowedModels: ["a/one"] }, "a/one")).toBeNull();
  });

  it.each([
    [BigInt(0), BigInt(0)],
    [BigInt(10), BigInt(10)],
    [BigInt(11), BigInt(10)],
    [BigInt("9007199254740993"), BigInt("9007199254740993")],
  ])("rejects spent %s at or above limit %s", (spentMicroUsd, spendLimitMicroUsd) => {
    expect(checkAccount({ ...context, spentMicroUsd, spendLimitMicroUsd }, "any/model")).toBe("key_limit_exceeded");
  });

  it("checks suspension before balance and spend limit", () => {
    expect(checkAccount({
      ...context, suspended: true, balanceMicroUsd: BigInt(0), spendLimitMicroUsd: BigInt(0),
    }, "any/model")).toBe("account_suspended");
  });

  it("leaves the balance to the usage admission", () => {
    expect(checkAccount({ ...context, balanceMicroUsd: BigInt(0) }, "any/model")).toBeNull();
  });

  it("allows a positive balance without a key limit, regardless of spend", () => {
    expect(checkAccount({ ...context, spentMicroUsd: BigInt("9223372036854775807") }, "any/model")).toBeNull();
  });

  it("allows spend one micro-dollar below a large limit without losing precision", () => {
    expect(checkAccount({
      ...context, spentMicroUsd: BigInt("9007199254740992"), spendLimitMicroUsd: BigInt("9007199254740993"),
    }, "any/model")).toBeNull();
  });
});
