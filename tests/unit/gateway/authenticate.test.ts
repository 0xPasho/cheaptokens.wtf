// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateKey } from "@/lib/api-keys";
import { apiKeys, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { authenticate, checkAccount } from "@/lib/gateway/authenticate";
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

  it("leaves suspension, balance and spend checks to checkAccount", async () => {
    const { generated } = await seed(
      { suspendedAt: new Date(), balanceMicroUsd: BigInt(-1) },
      { spendLimitMicroUsd: BigInt(0), spentMicroUsd: BigInt(0) },
    );
    const result = await authenticate(`Bearer ${generated.key}`, testDb.db);
    expect(result).toMatchObject({ ok: true, context: { suspended: true, balanceMicroUsd: BigInt(-1) } });
    if (!result.ok) throw new Error("Expected valid credentials");
    expect(checkAccount(result.context)).toBe("account_suspended");
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
  };

  it("rejects a suspended workspace", () => {
    expect(checkAccount({ ...context, suspended: true })).toBe("account_suspended");
  });

  it.each([BigInt(0), BigInt(-1)])("rejects a nonpositive balance (%s)", (balanceMicroUsd) => {
    expect(checkAccount({ ...context, balanceMicroUsd })).toBe("insufficient_credits");
  });

  it.each([
    [BigInt(0), BigInt(0)],
    [BigInt(10), BigInt(10)],
    [BigInt(11), BigInt(10)],
    [BigInt("9007199254740993"), BigInt("9007199254740993")],
  ])("rejects spent %s at or above limit %s", (spentMicroUsd, spendLimitMicroUsd) => {
    expect(checkAccount({ ...context, spentMicroUsd, spendLimitMicroUsd })).toBe("key_limit_exceeded");
  });

  it("checks suspension before balance and spend limit", () => {
    expect(checkAccount({
      ...context, suspended: true, balanceMicroUsd: BigInt(0), spendLimitMicroUsd: BigInt(0),
    })).toBe("account_suspended");
  });

  it("checks balance before spend limit", () => {
    expect(checkAccount({ ...context, balanceMicroUsd: BigInt(0), spendLimitMicroUsd: BigInt(0) }))
      .toBe("insufficient_credits");
  });

  it("allows a positive balance without a key limit, regardless of spend", () => {
    expect(checkAccount({ ...context, spentMicroUsd: BigInt("9223372036854775807") })).toBeNull();
  });

  it("allows spend one micro-dollar below a large limit without losing precision", () => {
    expect(checkAccount({
      ...context, spentMicroUsd: BigInt("9007199254740992"), spendLimitMicroUsd: BigInt("9007199254740993"),
    })).toBeNull();
  });
});
