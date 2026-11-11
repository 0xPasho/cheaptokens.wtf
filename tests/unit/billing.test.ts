// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashKey, validateKeyFormat } from "@/lib/api-keys";
import { chargeRequest, grantCredits, usdToMicroUsdExact } from "@/lib/billing/ledger";
import { reconcile } from "@/lib/billing/reconcile";
import type { RequestRecord } from "@/lib/billing/types";
import { createApiKey, ensureDevWorkspace, findDevWorkspace } from "@/lib/billing/workspaces";
import * as dbClient from "@/lib/db/client";
import { migrateNodePostgres } from "@/lib/db/migrate";
import * as schema from "@/lib/db/schema";
import { apiKeys, creditTransactions, models, requests, upstreams, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { uuidv7 } from "@/lib/db/uuid";

import { createTestDb } from "../helpers/db";

async function seed(db: Db) {
  const workspace = await ensureDevWorkspace(db, "billing");
  const key = await createApiKey(db, { workspaceId: workspace.id, name: "Test key", spendLimitMicroUsd: null });
  await db.insert(models).values({
    id: "test/model",
    name: "Test model",
    author: "test",
    description: { en: "Test model" },
    contextLength: 32_000,
    officialInputPriceMicroUsd: BigInt(1_000_000),
    officialOutputPriceMicroUsd: BigInt(2_000_000),
    officialPriceSourceUrl: "https://example.com/pricing",
    discountBps: 9000,
    inputPriceMicroUsd: BigInt(100_000),
    outputPriceMicroUsd: BigInt(200_000),
    tags: [],
    status: "active",
  });
  await db.insert(upstreams).values({
    id: "mock", name: "Mock", baseUrl: "http://127.0.0.1/v1", enabled: true,
  });
  return { workspace, key };
}

function record(fixture: Awaited<ReturnType<typeof seed>>, overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: uuidv7(),
    workspaceId: fixture.workspace.id,
    apiKeyId: fixture.key.id,
    modelId: "test/model",
    upstreamId: "mock",
    attempts: 1,
    stream: true,
    status: "success",
    httpStatus: 200,
    errorCode: null,
    promptTokens: 10,
    completionTokens: 20,
    cachedTokens: null,
    usageEstimated: false,
    costMicroUsd: BigInt(37),
    upstreamCostMicroUsd: BigInt(11),
    officialCostMicroUsd: BigInt(100),
    ttfbMs: 20,
    latencyMs: 100,
    ...overrides,
  };
}

describe("billing ledger, workspaces and reconciliation", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  let fixture: Awaited<ReturnType<typeof seed>>;

  beforeEach(async () => {
    testDb = await createTestDb();
    fixture = await seed(testDb.db);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await testDb?.close();
  });

  it("inserts the entire request, debits balance and updates key spend and last use", async () => {
    const { db } = testDb;
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(1000), note: "Test credits" });
    const request = record(fixture);
    await chargeRequest(db, request);
    const [saved] = await db.select().from(requests);
    expect(saved).toMatchObject(request);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces))
      .toEqual([{ balance: BigInt(963) }]);
    const [key] = await db.select().from(apiKeys);
    expect(key.spentMicroUsd).toBe(BigInt(37));
    expect(key.lastUsedAt).toBeInstanceOf(Date);
  });

  it.each(["costMicroUsd", "upstreamCostMicroUsd", "officialCostMicroUsd"] as const)(
    "rejects negative %s before opening a transaction",
    async (field) => {
      const transaction = vi.spyOn(testDb.db, "transaction");
      await expect(chargeRequest(testDb.db, record(fixture, { [field]: BigInt(-1) })))
        .rejects.toThrow(`${field} must not be negative`);
      expect(transaction).not.toHaveBeenCalled();
      expect(await testDb.db.select().from(requests)).toEqual([]);
      expect(await testDb.db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces))
        .toEqual([{ balance: BigInt(0) }]);
      expect(await testDb.db.select({ spent: apiKeys.spentMicroUsd, lastUsed: apiKeys.lastUsedAt }).from(apiKeys))
        .toEqual([{ spent: BigInt(0), lastUsed: null }]);
    },
  );

  it("rejects a zero adjustment before opening a transaction", async () => {
    const transaction = vi.spyOn(testDb.db, "transaction");
    await expect(grantCredits(testDb.db, {
      workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(0), note: "Zero",
    })).rejects.toThrow("Credit adjustment amount must not be zero");
    expect(transaction).not.toHaveBeenCalled();
    expect(await testDb.db.select().from(creditTransactions)).toEqual([]);
    expect(await testDb.db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces))
      .toEqual([{ balance: BigInt(0) }]);
  });

  it("records failed requests with zero cost and updates last use", async () => {
    const { db } = testDb;
    const request = record(fixture, {
      costMicroUsd: BigInt(0), upstreamCostMicroUsd: BigInt(0), officialCostMicroUsd: BigInt(0),
      upstreamId: null, status: "upstream_timeout", httpStatus: 504, errorCode: "upstream_timeout",
      promptTokens: 0, completionTokens: 0, ttfbMs: null,
    });
    await chargeRequest(db, request);
    expect(await db.select().from(requests)).toMatchObject([request]);
    expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)).toEqual([{ balance: BigInt(0) }]);
    const [key] = await db.select().from(apiKeys);
    expect(key.spentMicroUsd).toBe(BigInt(0));
    expect(key.lastUsedAt).toBeInstanceOf(Date);
  });

  it("leaves balances and key spend untouched when the request insert fails", async () => {
    const { db } = testDb;
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(100), note: "Initial" });
    const request = record(fixture);
    await chargeRequest(db, request);
    await expect(chargeRequest(db, request)).rejects.toThrow();
    await expect(chargeRequest(db, record(fixture, { modelId: "missing/model" }))).rejects.toThrow();
    expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)).toEqual([{ balance: BigInt(63) }]);
    expect(await db.select({ spent: apiKeys.spentMicroUsd }).from(apiKeys)).toEqual([{ spent: BigInt(37) }]);
    expect(await db.select({ total: count() }).from(requests)).toEqual([{ total: 1 }]);
  });

  it("rolls back the request and workspace debit if the key update fails", async () => {
    const { db } = testDb;
    // El desbordamiento ocurre en el último UPDATE, después del débito del workspace.
    await db.update(apiKeys).set({ spentMicroUsd: BigInt("9223372036854775807") });
    await expect(chargeRequest(db, record(fixture))).rejects.toThrow();
    expect(await db.select().from(requests)).toEqual([]);
    expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)).toEqual([{ balance: BigInt(0) }]);
    expect(await db.select({ spent: apiKeys.spentMicroUsd, lastUsed: apiKeys.lastUsedAt }).from(apiKeys))
      .toEqual([{ spent: BigInt("9223372036854775807"), lastUsed: null }]);
  });

  it("rejects a request whose key belongs to a different workspace and rolls back", async () => {
    const other = await ensureDevWorkspace(testDb.db, "other");
    await expect(chargeRequest(testDb.db, record(fixture, { workspaceId: other.id })))
      .rejects.toThrow("Request workspace and API key must match");
    expect(await testDb.db.select().from(requests)).toEqual([]);
    expect((await reconcile(testDb.db)).balanceMismatches).toEqual([]);
  });

  it("keeps the exact balance and key spend after 50 parallel charges, including negative balance", async () => {
    const { db } = testDb;
    const amount = BigInt("9007199254740993");
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: amount, note: "Exact bigint" });
    const cost = amount / BigInt(49);
    await Promise.all(Array.from({ length: 50 }, () => chargeRequest(db, record(fixture, { costMicroUsd: cost }))));
    expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces))
      .toEqual([{ balance: amount - cost * BigInt(50) }]);
    expect(await db.select({ spent: apiKeys.spentMicroUsd }).from(apiKeys)).toEqual([{ spent: cost * BigInt(50) }]);
    expect(await db.select({ total: count() }).from(requests)).toEqual([{ total: 50 }]);
    expect(await reconcile(db)).toMatchObject({ balanceMismatches: [], keySpendMismatches: [] });
  });

  it("records signed manual adjustments with notes and no payment identifiers", async () => {
    const { db } = testDb;
    for (const amount of ["9007199254740993", "-1234567"]) {
      await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(amount), note: "Manual adjustment" });
    }
    const credits = await db.select().from(creditTransactions);
    expect(credits).toMatchObject([
      { type: "adjustment", amountMicroUsd: BigInt("9007199254740993"), note: "Manual adjustment", paymentProvider: null, externalId: null },
      { type: "adjustment", amountMicroUsd: BigInt(-1234567), note: "Manual adjustment", paymentProvider: null, externalId: null },
    ]);
    expect(await reconcile(db)).toMatchObject({ balanceMismatches: [], keySpendMismatches: [] });
  });

  it.each(["", " \n\t "])("rejects an empty adjustment note (%j) without writes", async (note) => {
    await expect(grantCredits(testDb.db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(100), note }))
      .rejects.toThrow("Credit adjustment note is required");
    expect(await testDb.db.select().from(creditTransactions)).toEqual([]);
    expect(await testDb.db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)).toEqual([{ balance: BigInt(0) }]);
  });

  it("rolls back an adjustment insert when the balance update overflows", async () => {
    const { db } = testDb;
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt("9223372036854775807"), note: "Maximum" });
    await expect(grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(1), note: "Overflow" }))
      .rejects.toThrow();
    expect(await db.select({ total: count() }).from(creditTransactions)).toEqual([{ total: 1 }]);
    expect((await reconcile(db)).balanceMismatches).toEqual([]);
  });

  it("returns no mismatches for empty accounts and detects both corrupted invariants", async () => {
    const { db } = testDb;
    await ensureDevWorkspace(db, "unused");
    expect(await reconcile(db)).toEqual({ balanceMismatches: [], keySpendMismatches: [], upstreamDaily: [] });
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(200), note: "Test" });
    await chargeRequest(db, record(fixture));
    await chargeRequest(db, record(fixture));
    expect(await reconcile(db)).toMatchObject({ balanceMismatches: [], keySpendMismatches: [] });
    await db.update(workspaces).set({ balanceMicroUsd: BigInt(125) }).where(eq(workspaces.id, fixture.workspace.id));
    await db.update(apiKeys).set({ spentMicroUsd: BigInt(75), revokedAt: new Date() }).where(eq(apiKeys.id, fixture.key.id));
    expect(await reconcile(db)).toMatchObject({
      balanceMismatches: [{ workspaceId: fixture.workspace.id, expected: BigInt(126), actual: BigInt(125) }],
      keySpendMismatches: [{ apiKeyId: fixture.key.id, expected: BigInt(74), actual: BigInt(75) }],
    });
  });

  it("aggregates upstream spend and counts per UTC day without multiplying ledger rows", async () => {
    const { db } = testDb;
    await db.execute(sql`set time zone 'America/Mexico_City'`);
    await db.insert(upstreams).values({ id: "other", name: "Other", baseUrl: "http://127.0.0.1/v1", enabled: true });
    const samples = [
      { upstreamId: "mock", at: "2026-11-10T23:59:59Z", cost: BigInt("9007199254740993") },
      { upstreamId: "mock", at: "2026-11-10T18:00:00-06:00", cost: BigInt(7) },
      { upstreamId: "mock", at: "2026-11-11T12:00:00Z", cost: BigInt(13) },
      { upstreamId: "other", at: "2026-11-11T12:00:00Z", cost: BigInt(5) },
      { upstreamId: null, at: "2026-11-11T12:00:00Z", cost: BigInt(0) },
    ];
    for (const sample of samples) {
      const request = record(fixture, { upstreamId: sample.upstreamId, upstreamCostMicroUsd: sample.cost });
      await chargeRequest(db, request);
      await db.update(requests).set({ createdAt: new Date(sample.at) }).where(eq(requests.id, request.id));
    }
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(500), note: "First" });
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(-10), note: "Second" });
    expect(await reconcile(db)).toEqual({
      balanceMismatches: [], keySpendMismatches: [],
      upstreamDaily: [
        { upstreamId: "mock", day: "2026-11-10", requestCount: BigInt(1), upstreamCostMicroUsd: BigInt("9007199254740993") },
        { upstreamId: "mock", day: "2026-11-11", requestCount: BigInt(2), upstreamCostMicroUsd: BigInt(20) },
        { upstreamId: "other", day: "2026-11-11", requestCount: BigInt(1), upstreamCostMicroUsd: BigInt(5) },
        { upstreamId: null, day: "2026-11-11", requestCount: BigInt(1), upstreamCostMicroUsd: BigInt(0) },
      ],
    });
  });

  it("upserts dev workspaces concurrently without resetting the existing balance", async () => {
    const { db } = testDb;
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(123), note: "Preserve" });
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureDevWorkspace(db, "billing")));
    expect(results).toEqual(Array.from({ length: 5 }, () => fixture.workspace));
    expect(await db.select({ clerk: workspaces.clerkUserId, balance: workspaces.balanceMicroUsd }).from(workspaces))
      .toEqual([{ clerk: "dev:billing", balance: BigInt(123) }]);
    await expect(ensureDevWorkspace(db, "  ")).rejects.toThrow("Workspace name is required");
  });

  it("finds dev workspaces by exact Clerk ID without creating missing ones", async () => {
    const { db } = testDb;
    await db.insert(workspaces).values({ clerkUserId: "billing" });
    const before = await db.select().from(workspaces);
    expect(await findDevWorkspace(db, "billing")).toEqual(fixture.workspace);
    await expect(findDevWorkspace(db, "bill")).rejects.toThrow(
      'Workspace "bill" not found. Create it with pnpm keys:create.',
    );
    await expect(findDevWorkspace(db, "  ")).rejects.toThrow("Workspace name is required");
    expect(await db.select().from(workspaces)).toEqual(before);
  });

  it("does not create or credit a workspace when the CLI name is mistyped", async () => {
    const { db } = testDb;
    vi.spyOn(dbClient, "getDb").mockReturnValue(db);
    const close = vi.spyOn(dbClient, "closeDb").mockResolvedValue();
    const before = await db.select().from(workspaces);
    const { main } = await import("../../scripts/credits-grant");
    await expect(main(["--workspace", "bill", "--usd", "100", "--note", "Typo"]))
      .rejects.toThrow('Workspace "bill" not found. Create it with pnpm keys:create.');
    expect(await db.select().from(workspaces)).toEqual(before);
    expect(await db.select().from(creditTransactions)).toEqual([]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("returns a valid key once and stores only its matching hash, hint and limit", async () => {
    const { db } = testDb;
    const created = await createApiKey(db, { workspaceId: fixture.workspace.id, name: "Limited", spendLimitMicroUsd: BigInt(1234567) });
    expect(validateKeyFormat(created.key)).toBe(true);
    const [saved] = await db.select().from(apiKeys).where(eq(apiKeys.id, created.id));
    expect(saved).toMatchObject({
      hash: hashKey(created.key), hint: created.hint, name: "Limited",
      spendLimitMicroUsd: BigInt(1234567), spentMicroUsd: BigInt(0), lastUsedAt: null,
    });
    expect(Object.values(saved)).not.toContain(created.key);
  });

  it("enforces 25 active keys under concurrent creation and allows replacing a revoked key", async () => {
    const { db } = testDb;
    const input = { workspaceId: fixture.workspace.id, name: "Parallel", spendLimitMicroUsd: null };
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => createApiKey(db, input)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(24);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(6);
    await expect(createApiKey(db, input)).rejects.toThrow("25 active API keys");
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, fixture.key.id));
    await expect(createApiKey(db, input)).resolves.toHaveProperty("key");
    expect(await db.select({ total: count() }).from(apiKeys)).toEqual([{ total: 26 }]);
    const other = await ensureDevWorkspace(db, "other");
    await expect(createApiKey(db, { ...input, workspaceId: other.id })).resolves.toHaveProperty("key");
  });

  it("rejects invalid key input or a missing workspace without inserting", async () => {
    const input = { workspaceId: fixture.workspace.id, name: "Valid", spendLimitMicroUsd: null };
    await expect(createApiKey(testDb.db, { ...input, name: " " })).rejects.toThrow("API key name is required");
    await expect(createApiKey(testDb.db, { ...input, spendLimitMicroUsd: BigInt(-1) })).rejects.toThrow("must not be negative");
    await expect(createApiKey(testDb.db, { ...input, workspaceId: uuidv7() })).rejects.toThrow("Workspace not found");
    expect(await testDb.db.select({ total: count() }).from(apiKeys)).toEqual([{ total: 1 }]);
  });

  it("imports all CLI modules without connecting, printing or setting an exit code", async () => {
    const connect = vi.spyOn(dbClient, "getDb");
    const close = vi.spyOn(dbClient, "closeDb");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousExitCode = process.exitCode;
    await import("../../scripts/keys-create");
    await import("../../scripts/credits-grant");
    await import("../../scripts/reconcile");
    expect(connect).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(previousExitCode);
  });

  it("runs the CLI workflows, prints a key once and reports reconciliation exit codes", async () => {
    const { db } = testDb;
    vi.spyOn(dbClient, "getDb").mockReturnValue(db);
    const close = vi.spyOn(dbClient, "closeDb").mockResolvedValue();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { main: keysMain } = await import("../../scripts/keys-create");
    const { main: creditsMain } = await import("../../scripts/credits-grant");
    const { main: reconcileMain } = await import("../../scripts/reconcile");
    await keysMain(["--", "--workspace", "cli", "--name", "CLI test", "--limit-usd", "1.234567"]);
    const output = log.mock.calls.flat().join("\n");
    const keys = output.match(/wtf_[0-9A-Za-z]{49}/g) ?? [];
    expect(keys).toHaveLength(1);
    const rawKey = keys[0];
    if (!rawKey) throw new Error("Expected one API key in CLI output");
    expect(validateKeyFormat(rawKey)).toBe(true);
    const [saved] = await db.select().from(apiKeys).where(eq(apiKeys.hash, hashKey(rawKey)));
    expect(output).toContain(saved.hint);
    expect(output).toContain(saved.workspaceId);
    expect(saved.spendLimitMicroUsd).toBe(BigInt(1234567));
    await creditsMain(["--", "--workspace", "cli", "--usd", "9007199254.740993", "--note", "Exact CLI credit"]);
    await creditsMain(["--workspace", "cli", "--usd", "-0.000001", "--note", "Negative adjustment"]);
    expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces).where(eq(workspaces.id, saved.workspaceId)))
      .toEqual([{ balance: BigInt("9007199254740992") }]);
    expect(await reconcileMain([])).toBe(0);
    expect(log.mock.calls.flat().join("\n")).toContain("Balance invariant: 0 mismatches");
    expect(log.mock.calls.flat().join("\n")).toContain("Key spend invariant: 0 mismatches");
    await db.update(workspaces).set({ balanceMicroUsd: BigInt(0) }).where(eq(workspaces.id, saved.workspaceId));
    expect(await reconcileMain([])).toBe(1);
    expect(log.mock.calls.flat().join("\n")).toContain("expected 9007199254740992, actual 0");
    expect(close).toHaveBeenCalledTimes(5);
  });

  it("reports missing arguments, malformed amounts and missing DATABASE_URL before writing", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "development");
    const { main: keysMain } = await import("../../scripts/keys-create");
    const { main: creditsMain } = await import("../../scripts/credits-grant");
    const { main: reconcileMain } = await import("../../scripts/reconcile");
    await expect(keysMain([])).rejects.toThrow("--workspace");
    await expect(creditsMain(["--workspace", "cli"])).rejects.toThrow("--usd");
    await expect(creditsMain(["--workspace", "cli", "--usd", "1"])).rejects.toThrow("--note");
    await expect(creditsMain(["--workspace", "cli", "--usd", "0.0000001", "--note", "Test"]))
      .rejects.toThrow("USD amount");
    await expect(keysMain(["--workspace", "cli", "--limit-usd=-1"])).rejects.toThrow("must not be negative");
    await expect(keysMain(["--workspace", "cli"])).rejects.toThrow("DATABASE_URL");
    await expect(creditsMain(["--workspace", "cli", "--usd", "1", "--note", "Test"])).rejects.toThrow("DATABASE_URL");
    await expect(reconcileMain([])).rejects.toThrow("DATABASE_URL");
    await expect(reconcileMain(["--unknown"])).rejects.toThrow();
    expect(await testDb.db.select().from(creditTransactions)).toEqual([]);
  });
});

describe("exact USD argument conversion", () => {
  it.each([
    ["0", "0"], ["10", "10000000"], ["+1.2", "1200000"], ["-0.000001", "-1"],
    ["1.234567000", "1234567"], ["9007199254.740993", "9007199254740993"],
  ])("converts %s to %s micro USD without floats", (value, expected) => {
    expect(usdToMicroUsdExact(value)).toBe(BigInt(expected));
  });

  it.each(["", " ", "NaN", "Infinity", "1e3", "0.0000001", "-1.0000001", "1,000", "1.2.3"])("rejects %j", (value) => {
    expect(() => usdToMicroUsdExact(value)).toThrow("USD amount");
  });
});

it("uses only tx inside billing transactions over the PGlite socket with a single pool connection", async () => {
  const client = await PGlite.create();
  const server = new PGLiteSocketServer({ db: client, host: "127.0.0.1", port: 0, maxConnections: 5 });
  let pool: Pool | undefined;
  try {
    await server.start();
    // Una llamada a db dentro de tx agotaría la única conexión y fallaría por timeout.
    pool = new Pool({
      connectionString: `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
      max: 1, connectionTimeoutMillis: 1000, query_timeout: 2000,
    });
    const db = drizzle(pool, { schema });
    await migrateNodePostgres(db);
    const fixture = await seed(db);
    await grantCredits(db, { workspaceId: fixture.workspace.id, amountMicroUsd: BigInt(1000), note: "Socket test" });
    await chargeRequest(db, record(fixture));
    expect(await reconcile(db)).toMatchObject({ balanceMismatches: [], keySpendMismatches: [] });
    expect(await db.select({ balance: workspaces.balanceMicroUsd }).from(workspaces)).toEqual([{ balance: BigInt(963) }]);
  } finally {
    await pool?.end();
    await server.stop();
    await client.close();
  }
}, 15_000);


// Los procesos reales comprueban la guardia principal y el código que observa un cron.
it("runs all three CLIs through symlinks and reports failures with their causes", async () => {
  const client = await PGlite.create();
  const server = new PGLiteSocketServer({ db: client, host: "127.0.0.1", port: 0, maxConnections: 5 });
  const directory = await mkdtemp(join(tmpdir(), "billing-cli-"));
  let pool: Pool | undefined;
  try {
    await server.start();
    const databaseUrl = `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
    pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle(pool, { schema });
    await migrateNodePostgres(db);
    for (const script of ["keys-create", "credits-grant", "reconcile"]) {
      await symlink(resolve(`scripts/${script}.ts`), join(directory, `${script}.ts`));
    }
    const run = (script: string, args: string[] = []) => new Promise<{
      code: number; stdout: string; stderr: string;
    }>((resolveResult, reject) => {
      execFile(process.execPath, ["--import", "tsx", join(directory, `${script}.ts`), ...args], {
        env: { ...process.env, DATABASE_URL: databaseUrl, APP_ENV: "development", VERCEL_ENV: "development" },
        timeout: 10_000,
      }, (error, stdout, stderr) => {
        const code = error ? error.code : 0;
        if (typeof code !== "number") return reject(error);
        resolveResult({ code, stdout, stderr });
      });
    });

    const missing = await run("credits-grant", ["--workspace", "reb", "--usd", "100", "--note", "Typo"]);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('Workspace "reb" not found. Create it with pnpm keys:create.');
    expect(await db.select().from(workspaces)).toEqual([]);
    expect(await db.select().from(creditTransactions)).toEqual([]);

    const created = await run("keys-create", ["--workspace", "cli"]);
    expect(created.code).toBe(0);
    expect(created.stdout.match(/wtf_[0-9A-Za-z]{49}/g)).toHaveLength(1);
    const granted = await run("credits-grant", ["--workspace", "cli", "--usd", "1", "--note", "Test"]);
    expect(granted.code).toBe(0);
    expect(granted.stdout).toContain("Granted 1000000 micro USD");
    const clean = await run("reconcile");
    expect(clean.code).toBe(0);
    expect(clean.stdout).toContain("Balance invariant: 0 mismatches");
    await db.update(workspaces).set({ balanceMicroUsd: BigInt(0) });
    const mismatched = await run("reconcile");
    expect(mismatched.code).toBe(1);
    expect(mismatched.stdout).toContain("Balance invariant: 1 mismatches");
    expect(mismatched.stdout).toContain("expected 1000000, actual 0");

    for (const [script, args] of [
      ["keys-create", ["--workspace", "cli", "--limit-usd", "9223372036854.775808"]],
      ["credits-grant", ["--workspace", "cli", "--usd", "9223372036854.775808", "--note", "Overflow"]],
    ] as const) {
      const failed = await run(script, [...args]);
      expect(failed.code).toBe(1);
      expect(failed.stderr).toContain("Failed query:");
      expect(failed.stderr).toContain("out of range");
    }
    await db.execute(sql`alter table requests rename to unavailable_requests`);
    const failed = await run("reconcile");
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain("Failed query:");
    expect(failed.stderr).toContain('relation "requests" does not exist');
  } finally {
    await pool?.end();
    await server.stop();
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
