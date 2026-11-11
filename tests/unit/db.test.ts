// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeDb, getDb } from "@/lib/db/client";
import { migrateNodePostgres } from "@/lib/db/migrate";
import {
  apiKeys,
  creditTransactions,
  modelUpstreams,
  models,
  requests,
  upstreams,
  workspaces,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/db/uuid";

import { createTestDb } from "../helpers/db";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const model: typeof models.$inferInsert = {
  id: "test/model",
  name: "Test model",
  author: "test",
  description: { en: "Test", es: "Prueba" },
  contextLength: 32_000,
  officialInputPriceMicroUsd: BigInt(1_000_000),
  officialOutputPriceMicroUsd: BigInt(2_000_000),
  officialPriceSourceUrl: "https://example.com/pricing",
  officialPriceVerifiedAt: "2026-11-10",
  discountBps: 9000,
  inputPriceMicroUsd: BigInt(100_000),
  outputPriceMicroUsd: BigInt(200_000),
  tags: ["tools"],
  status: "active",
};

async function insertWorkspaceAndKey(db: Db) {
  const [workspace] = await db.insert(workspaces).values({ clerkUserId: "test-user" }).returning();
  const [key] = await db.insert(apiKeys).values({
    workspaceId: workspace.id,
    name: "Test key",
    hash: "a".repeat(64),
    hint: "wtf_aaaa…aaaa",
  }).returning();
  return { workspace, key };
}

function requestRecord(workspaceId: string, apiKeyId: string): typeof requests.$inferInsert {
  return {
    workspaceId,
    apiKeyId,
    modelId: model.id,
    attempts: 1,
    stream: true,
    status: "success",
    httpStatus: 200,
    promptTokens: 10,
    completionTokens: 20,
    usageEstimated: false,
    costMicroUsd: BigInt(10),
    upstreamCostMicroUsd: BigInt(5),
    officialCostMicroUsd: BigInt(50),
    latencyMs: 100,
  };
}

describe("Postgres schema and migrations", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    const cwd = vi.spyOn(process, "cwd").mockReturnValue("/tmp");
    try {
      testDb = await createTestDb();
    } finally {
      cwd.mockRestore();
    }
  });

  afterEach(async () => {
    await testDb?.close();
  });

  it("applies the migration independently of cwd with all seven tables and records it", async () => {
    const { db } = testDb;
    for (const table of [workspaces, apiKeys, models, upstreams, modelUpstreams, requests, creditTransactions]) {
      expect(await db.select().from(table)).toEqual([]);
    }
    expect(await db.execute(sql`select count(*)::int as count from drizzle.__drizzle_migrations`))
      .toMatchObject({ rows: [{ count: 1 }] });
  });

  it("stores a catalog description without a Spanish translation", async () => {
    const description = { en: "English only" };
    const [saved] = await testDb.db.insert(models).values({ ...model, description }).returning();
    expect(saved.description).toEqual(description);
  });

  it("refreshes workspace and model updatedAt while preserving createdAt", async () => {
    const { db } = testDb;
    const originalTime = new Date("2020-01-01T00:00:00.000Z");
    const [workspace] = await db.insert(workspaces).values({
      clerkUserId: "timestamp-user", createdAt: originalTime, updatedAt: originalTime,
    }).returning();
    const [savedModel] = await db.insert(models).values({
      ...model, createdAt: originalTime, updatedAt: originalTime,
    }).returning();
    const beforeUpdate = Date.now();
    const [updatedWorkspace] = await db.update(workspaces).set({ balanceMicroUsd: BigInt(1) })
      .where(eq(workspaces.id, workspace.id)).returning();
    const [updatedModel] = await db.update(models).set({ name: "Updated model" })
      .where(eq(models.id, savedModel.id)).returning();
    const afterUpdate = Date.now();

    for (const row of [updatedWorkspace, updatedModel]) {
      expect(row.createdAt).toEqual(originalTime);
      expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate);
      expect(row.updatedAt.getTime()).toBeLessThanOrEqual(afterUpdate);
    }
  });

  it("inserts a workspace, key, catalog mapping and request with UUID v7 defaults", async () => {
    const { db } = testDb;
    const { workspace, key } = await insertWorkspaceAndKey(db);
    await db.insert(models).values(model);
    const [upstream] = await db.insert(upstreams).values({
      id: "mock",
      name: "Mock",
      baseUrl: "http://127.0.0.1:4010/v1",
      enabled: true,
    }).returning();
    await db.insert(modelUpstreams).values({
      modelId: model.id,
      upstreamId: upstream.id,
      upstreamModel: "test/model",
      costInputMicroUsd: BigInt(50_000),
      costOutputMicroUsd: BigInt(100_000),
      priority: 1,
      enabled: true,
    });
    const [request] = await db.insert(requests).values({
      ...requestRecord(workspace.id, key.id),
      upstreamId: upstream.id,
    }).returning();

    for (const row of [workspace, key, request]) expect(row.id).toMatch(uuidPattern);
    expect(workspace.balanceMicroUsd).toBe(BigInt(0));
    expect(key.spentMicroUsd).toBe(BigInt(0));
    expect(upstream.apiKeyEnv).toBeNull();
    expect(upstream.sendsPriceCap).toBe(false);
    expect(request.createdAt).toBeInstanceOf(Date);
    expect(request.costMicroUsd).toBe(BigInt(10));
    expect(await db.select().from(requests)).toEqual([request]);
  });

  it.each([-1, 10_000])("rejects discount_bps = %i", async (discountBps) => {
    await expect(testDb.db.insert(models).values({ ...model, discountBps }))
      .rejects.toMatchObject({ cause: { code: "23514", constraint: "models_discount_bps_check" } });
  });

  it.each([0, 9999])("accepts discount_bps = %i", async (discountBps) => {
    const [saved] = await testDb.db.insert(models).values({ ...model, discountBps }).returning();
    expect(saved.discountBps).toBe(discountBps);
  });

  it("rejects duplicate key hashes, including across workspaces", async () => {
    const { db } = testDb;
    const { key } = await insertWorkspaceAndKey(db);
    const [other] = await db.insert(workspaces).values({ clerkUserId: "other-user" }).returning();
    await expect(db.insert(apiKeys).values({
      workspaceId: other.id,
      name: "Duplicate",
      hash: key.hash,
      hint: key.hint,
    })).rejects.toMatchObject({ cause: { code: "23505", constraint: "api_keys_hash_unique" } });
  });

  it.each(["9000000000000000", "9007199254740993"])("round-trips %s micro USD exactly", async (amount) => {
    const { db } = testDb;
    const value = BigInt(amount);
    const [workspace] = await db.insert(workspaces).values({
      clerkUserId: "bigint-user",
      balanceMicroUsd: value,
    }).returning();
    const [saved] = await db.select().from(workspaces).where(eq(workspaces.id, workspace.id));
    expect(saved.balanceMicroUsd).toBe(value);
    const [credit] = await db.insert(creditTransactions).values({
      workspaceId: workspace.id,
      type: "adjustment",
      amountMicroUsd: -value,
      note: "Precision test",
    }).returning();
    expect(credit.amountMicroUsd).toBe(-value);
    expect(credit.id).toMatch(uuidPattern);
  });

  it("enforces credit idempotency and permits multiple null external IDs", async () => {
    const { db } = testDb;
    const { workspace } = await insertWorkspaceAndKey(db);
    const credit = { workspaceId: workspace.id, type: "topup" as const, amountMicroUsd: BigInt(100) };
    await db.insert(creditTransactions).values([credit, credit, { ...credit, externalId: "test:payment" }]);
    await expect(db.insert(creditTransactions).values({ ...credit, externalId: "test:payment" }))
      .rejects.toMatchObject({ cause: { code: "23505", constraint: "credit_transactions_external_id_unique" } });
  });

  it("enforces the mapping composite primary key and foreign keys", async () => {
    const { db } = testDb;
    const mapping = {
      modelId: model.id,
      upstreamId: "mock",
      upstreamModel: "test/model",
      costInputMicroUsd: BigInt(1),
      costOutputMicroUsd: BigInt(2),
      priority: 1,
      enabled: true,
    };
    await expect(db.insert(modelUpstreams).values(mapping))
      .rejects.toMatchObject({ cause: { code: "23503" } });
    await db.insert(models).values(model);
    await expect(db.insert(modelUpstreams).values(mapping))
      .rejects.toMatchObject({ cause: { code: "23503" } });
    await db.insert(upstreams).values({ id: "mock", name: "Mock", baseUrl: "http://127.0.0.1", enabled: true });
    await db.insert(modelUpstreams).values(mapping);
    await expect(db.insert(modelUpstreams).values(mapping))
      .rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("rejects orphan keys and requests", async () => {
    const { db } = testDb;
    await expect(db.insert(apiKeys).values({
      workspaceId: uuidv7(), name: "Orphan", hash: "orphan", hint: "wtf_aaaa…aaaa",
    })).rejects.toMatchObject({ cause: { code: "23503" } });
    const { workspace, key } = await insertWorkspaceAndKey(db);
    const record = requestRecord(workspace.id, key.id);
    await expect(db.insert(requests).values(record)).rejects.toMatchObject({ cause: { code: "23503" } });
    await db.insert(models).values(model);
    for (const orphan of [{ workspaceId: uuidv7() }, { apiKeyId: uuidv7() }, { upstreamId: "missing" }]) {
      await expect(db.insert(requests).values({ ...record, ...orphan }))
        .rejects.toMatchObject({ cause: { code: "23503" } });
    }
  });

  it("isolates databases cloned from the migrated template", async () => {
    const other = await createTestDb();
    try {
      await testDb.db.insert(workspaces).values({ clerkUserId: "isolated-user" });
      expect(await other.db.select().from(workspaces)).toEqual([]);
      await expect(other.db.insert(workspaces).values({ clerkUserId: "isolated-user" })).resolves.toBeDefined();
    } finally {
      await other.close();
    }
  });

  it("rolls back a balance update and its credit insert together", async () => {
    const { db } = testDb;
    const { workspace } = await insertWorkspaceAndKey(db);
    await expect(db.transaction(async (tx) => {
      await tx.update(workspaces).set({ balanceMicroUsd: BigInt(100) }).where(eq(workspaces.id, workspace.id));
      await tx.insert(creditTransactions).values({
        workspaceId: workspace.id, type: "adjustment", amountMicroUsd: BigInt(100), note: "Rollback test",
      });
      throw new Error("Abort transaction");
    })).rejects.toThrow("Abort transaction");
    expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)).toEqual([{ balance: BigInt(0) }]);
    expect(await db.select().from(creditTransactions)).toEqual([]);
  });
});

describe("node-postgres client and socket", () => {
  beforeEach(async () => {
    await closeDb();
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "development");
  });

  afterEach(async () => {
    await closeDb();
    vi.unstubAllEnvs();
  });

  it("reports a missing DATABASE_URL in English", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    expect(() => getDb()).toThrow("DATABASE_URL is required to connect to the database");
  });

  it("migrates through pg and commits UPDATE + INSERT in one transaction", async () => {
    const client = await PGlite.create();
    const server = new PGLiteSocketServer({ db: client, host: "127.0.0.1", port: 0, maxConnections: 10 });
    try {
      await server.start();
      vi.stubEnv("DATABASE_URL", `postgres://postgres:postgres@${server.getServerConn()}/postgres`);
      const db = getDb();
      expect(getDb()).toBe(db);
      const cwd = vi.spyOn(process, "cwd").mockReturnValue("/tmp");
      try {
        await migrateNodePostgres(db);
        await migrateNodePostgres(db);
      } finally {
        cwd.mockRestore();
      }
      const { workspace } = await insertWorkspaceAndKey(db);
      const amount = BigInt("9000000000000000");
      await db.transaction(async (tx) => {
        await tx.update(workspaces).set({ balanceMicroUsd: amount }).where(eq(workspaces.id, workspace.id));
        await tx.insert(creditTransactions).values({
          workspaceId: workspace.id, type: "adjustment", amountMicroUsd: amount, note: "Socket test",
        });
      });
      expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)).toEqual([{ balance: amount }]);
      expect(await db.select({ amount: creditTransactions.amountMicroUsd }).from(creditTransactions)).toEqual([{ amount }]);
      await closeDb();
      const reopened = getDb();
      expect(reopened).not.toBe(db);
      expect(await reopened.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)).toEqual([{ balance: amount }]);
    } finally {
      await closeDb();
      await server.stop();
      await client.close();
    }
  }, 10_000);
});

describe("UUID v7 (RFC 9562)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("encodes the 48-bit Unix millisecond timestamp, version and variant", async () => {
    const { uuidv7: generate } = await import("@/lib/db/uuid");
    const timestamp = Date.parse("2026-11-10T12:34:56.789Z");
    const id = generate(timestamp);
    expect(id).toMatch(uuidPattern);
    expect(parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(timestamp);
  });

  it("preserves strict order and uniqueness within a millisecond and when the clock moves backwards", async () => {
    const { uuidv7: generate } = await import("@/lib/db/uuid");
    const ids = Array.from({ length: 1000 }, () => generate(1000));
    ids.push(generate(999), generate(1001), generate(1002));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    for (const id of ids) expect(id).toMatch(uuidPattern);
  });

  it("accepts the full timestamp range", async () => {
    const { uuidv7: generate } = await import("@/lib/db/uuid");
    expect(generate(0)).toMatch(/^00000000-0000-7/);
    expect(generate(2 ** 48 - 1)).toMatch(/^ffffffff-ffff-7/);
  });

  it.each([-1, 1.5, NaN, Infinity, 2 ** 48])("rejects invalid timestamp %s", async (timestamp) => {
    const { uuidv7: generate } = await import("@/lib/db/uuid");
    expect(() => generate(timestamp)).toThrow(RangeError);
  });
});
