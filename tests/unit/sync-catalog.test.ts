// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/internal/revalidate-catalog/route";
import { syncCatalog } from "@/lib/catalog/sync";
import type { CatalogEntry, UpstreamDefinition } from "@/lib/catalog/types";
import { migrateNodePostgres } from "@/lib/db/migrate";
import * as schema from "@/lib/db/schema";
import { modelUpstreams, models, upstreams } from "@/lib/db/schema";

import { createTestDb } from "../helpers/db";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));

const entry: CatalogEntry = {
  id: "test/model",
  name: "Test model",
  author: "test",
  description: { en: "English description", es: "Descripción en español" },
  contextLength: 200_000,
  officialInput: 1_000_000,
  officialOutput: 5_000_000,
  officialPriceSourceUrl: "https://example.com/pricing",
  officialPriceVerifiedAt: "2026-11-10",
  discountBps: 8_000,
  tags: ["tools", "reasoning"],
  status: "active",
};
const retired: CatalogEntry = { ...entry, id: "test/retired", status: "retired" };
const inferhub: UpstreamDefinition = {
  id: "inferhub",
  name: "InferHub",
  baseUrl: "https://example.com/v1",
  apiKeyEnv: "UPSTREAM_INFERHUB_API_KEY",
  sendsPriceCap: true,
  environments: ["development", "preview", "production"],
  models: [entry, retired].map((model) => ({
    model: model.id,
    upstreamModel: model.id,
    costInputPer1M: 100_000,
    costOutputPer1M: 500_000,
    priority: 1,
  })),
};
const mock: UpstreamDefinition = {
  ...inferhub,
  id: "mock",
  name: "Mock",
  apiKeyEnv: null,
  baseUrl: "http://127.0.0.1:4010/v1",
  environments: ["development", "preview"],
  models: inferhub.models.map((mapping) => ({ ...mapping })),
};

function input() {
  return {
    models: structuredClone([entry, retired]),
    upstreams: structuredClone([inferhub, mock]),
    environment: "development" as const,
  };
}

describe("syncCatalog", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    testDb = await createTestDb();
  });
  afterEach(async () => {
    await testDb?.close();
  });

  async function rows() {
    return {
      models: await testDb.db.select().from(models).orderBy(models.id),
      upstreams: await testDb.db.select().from(upstreams).orderBy(upstreams.id),
      mappings: await testDb.db.select().from(modelUpstreams).orderBy(modelUpstreams.modelId, modelUpstreams.upstreamId),
    };
  }

  it("is idempotent, derives prices and tags, and stores descriptions as JSON", async () => {
    expect(await syncCatalog(testDb.db, input())).toEqual({ warnings: [] });
    const first = await rows();
    await syncCatalog(testDb.db, input());
    const second = await rows();
    expect(second.models.map((row) => ({ ...row, updatedAt: undefined })))
      .toEqual(first.models.map((row) => ({ ...row, updatedAt: undefined })));
    expect(second.upstreams.map((row) => ({ ...row, updatedAt: undefined })))
      .toEqual(first.upstreams.map((row) => ({ ...row, updatedAt: undefined })));
    expect(second.mappings).toEqual(first.mappings);
    expect(second.models).toHaveLength(2);
    expect(second.upstreams).toHaveLength(2);
    expect(second.mappings).toHaveLength(4);
    expect(second.models.find(({ id }) => id === entry.id)).toMatchObject({
      description: entry.description,
      officialInputPriceMicroUsd: BigInt(1_000_000),
      officialOutputPriceMicroUsd: BigInt(5_000_000),
      inputPriceMicroUsd: BigInt(200_000),
      outputPriceMicroUsd: BigInt(1_000_000),
      tags: ["reasoning", "tools", "long-context", "cheap"],
    });
  });

  it("updates catalog fields and removes computed tags when thresholds no longer apply", async () => {
    await syncCatalog(testDb.db, input());
    const next = input();
    next.models[0] = {
      ...entry, name: "Deprecated model", status: "deprecated", retiresOn: "2026-12-01",
      contextLength: 199_999, officialOutput: 5_000_005,
      description: { en: "English only" }, tags: ["coding"],
    };
    const result = await syncCatalog(testDb.db, next);
    expect(result.warnings).toEqual([expect.stringContaining('missing "es" description')]);
    const [saved] = await testDb.db.select().from(models).where(eq(models.id, entry.id));
    expect(saved).toMatchObject({
      name: "Deprecated model", status: "deprecated", retiresAt: "2026-12-01",
      description: { en: "English only" }, tags: ["coding"], outputPriceMicroUsd: BigInt(1_000_001),
    });
  });

  it("rejects missing IDs, including retired ones, before writing anything", async () => {
    await syncCatalog(testDb.db, input());
    const before = await rows();
    const next = input();
    next.models = [{ ...entry, name: "Must not be saved" }];
    next.upstreams = [];
    await expect(syncCatalog(testDb.db, next)).rejects.toThrow("test/retired");
    expect(await rows()).toEqual(before);
  });

  it("validates before opening a transaction and leaves the database unchanged on errors", async () => {
    await syncCatalog(testDb.db, input());
    const before = await rows();
    const transaction = vi.spyOn(testDb.db, "transaction");
    const next = input();
    next.models[0].discountBps = 10_000;
    await expect(syncCatalog(testDb.db, next)).rejects.toThrow("Invalid catalog");
    expect(transaction).not.toHaveBeenCalled();
    expect(await rows()).toEqual(before);
  });

  it("warns about margin outside production and rejects it in production without writes", async () => {
    const next = input();
    next.upstreams[0].models[0].costInputPer1M = 1_000_000;
    const { warnings } = await syncCatalog(testDb.db, next);
    expect(warnings).toEqual([expect.stringContaining("10% margin")]);
    const before = await rows();
    await expect(syncCatalog(testDb.db, { ...next, environment: "production" })).rejects.toThrow("10% margin");
    expect(await rows()).toEqual(before);
  });

  it("disables removed mappings and upstreams without deleting their rows", async () => {
    await syncCatalog(testDb.db, input());
    const next = input();
    next.upstreams = [{ ...inferhub, models: [inferhub.models[0]] }];
    await syncCatalog(testDb.db, next);
    const saved = await rows();
    expect(saved.models).toHaveLength(2);
    expect(saved.upstreams).toHaveLength(2);
    expect(saved.mappings).toHaveLength(4);
    expect(saved.upstreams.find(({ id }) => id === "mock")?.enabled).toBe(false);
    expect(saved.mappings.filter(({ enabled }) => enabled)).toMatchObject([
      { modelId: entry.id, upstreamId: "inferhub" },
    ]);
    await syncCatalog(testDb.db, input());
    expect((await rows()).mappings.every(({ enabled }) => enabled)).toBe(true);
  });

  it("preserves both emergency fields through upserts and disabling removed mappings", async () => {
    await syncCatalog(testDb.db, input());
    const opsDisabledAt = new Date("2026-11-10T12:00:00Z");
    await testDb.db.update(modelUpstreams).set({ opsDisabledAt, opsDisabledReason: "Incident" });
    await syncCatalog(testDb.db, input());
    const next = input();
    next.upstreams = [];
    await syncCatalog(testDb.db, next);
    expect((await rows()).mappings).toEqual(Array.from({ length: 4 }, () => expect.objectContaining({
      opsDisabledAt, opsDisabledReason: "Incident", enabled: false,
    })));
  });

  it("disables the mock in production and never inserts it into a fresh production database", async () => {
    await syncCatalog(testDb.db, { ...input(), environment: "production" });
    expect((await rows()).upstreams.map(({ id }) => id)).toEqual(["inferhub"]);
    await syncCatalog(testDb.db, input());
    await syncCatalog(testDb.db, { ...input(), environment: "production" });
    const saved = await rows();
    expect(saved.upstreams.find(({ id }) => id === "mock")?.enabled).toBe(false);
    expect(saved.mappings.filter(({ upstreamId }) => upstreamId === "mock").every(({ enabled }) => !enabled)).toBe(true);
  });

  it("respects an explicitly disabled mapping", async () => {
    const next = input();
    next.upstreams[0].models[0].enabled = false;
    await syncCatalog(testDb.db, next);
    expect(await testDb.db.select({ enabled: modelUpstreams.enabled }).from(modelUpstreams).where(and(
      eq(modelUpstreams.modelId, entry.id), eq(modelUpstreams.upstreamId, "inferhub"),
    ))).toEqual([{ enabled: false }]);
  });

  it("rolls back all changes if a write fails partway through synchronization", async () => {
    await syncCatalog(testDb.db, input());
    const before = await rows();
    await testDb.db.execute(sql`alter table model_upstreams add constraint test_cost_limit check (cost_input_micro_usd < 200000)`);
    const next = input();
    next.models[0].name = "Must roll back";
    next.upstreams[0].models[0].costInputPer1M = 200_000;
    await expect(syncCatalog(testDb.db, next)).rejects.toThrow();
    expect(await rows()).toEqual(before);
  });
});

describe("syncCatalog over the PGlite Postgres socket", () => {
  it("finishes with tx-only queries inside the transaction", async () => {
    const client = await PGlite.create();
    const server = new PGLiteSocketServer({ db: client, host: "127.0.0.1", port: 0, maxConnections: 10 });
    let pool: Pool | undefined;
    try {
      await server.start();
      // Dos conexiones permiten detectar un uso de db dentro de la transacción: el socket lo bloquearía.
      pool = new Pool({
        connectionString: `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
        max: 2, query_timeout: 2_000, connectionTimeoutMillis: 2_000,
      });
      const db = drizzle(pool, { schema });
      await migrateNodePostgres(db);
      await syncCatalog(db, input());
      await syncCatalog(db, input());
      expect(await db.select({ id: models.id }).from(models)).toHaveLength(2);
    } finally {
      await pool?.end();
      await server.stop();
      await client.close();
    }
  }, 15_000);
});

describe("POST /api/internal/revalidate-catalog", () => {
  beforeEach(() => {
    revalidateTag.mockClear();
    vi.stubEnv("INTERNAL_REVALIDATE_SECRET", "catalog-secret-for-tests");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function request(authorization?: string) {
    return new Request("http://127.0.0.1/api/internal/revalidate-catalog", {
      method: "POST", headers: authorization === undefined ? {} : { authorization },
    });
  }

  it("returns 204 and revalidates the catalog with the max profile for a valid secret", async () => {
    const response = await POST(request("Bearer catalog-secret-for-tests"));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(revalidateTag).toHaveBeenCalledExactlyOnceWith("catalog", "max");
  });

  it.each([undefined, "", "Bearer wrong", "Bearer catalog-secret-for-testX", "Basic catalog-secret-for-tests", "Bearer é"])(
    "returns an indistinguishable 401 for invalid authorization %s", async (authorization) => {
      const response = await POST(request(authorization));
      expect(response.status).toBe(401);
      expect(await response.text()).toBe("");
      expect(revalidateTag).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, ""])("returns 401 when the configured secret is absent (%s)", async (secret) => {
    vi.stubEnv("INTERNAL_REVALIDATE_SECRET", secret);
    const response = await POST(request("Bearer catalog-secret-for-tests"));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it.each(["a", "a".repeat(15), "a".repeat(16)])("requires at least 16 characters in the configured secret (%s)", async (secret) => {
    vi.stubEnv("INTERNAL_REVALIDATE_SECRET", secret);
    const response = await POST(request(`Bearer ${secret}`));
    expect(response.status).toBe(secret.length < 16 ? 401 : 204);
    expect(await response.text()).toBe("");
    expect(revalidateTag).toHaveBeenCalledTimes(secret.length < 16 ? 0 : 1);
  });
});

describe("catalog:sync script", () => {
  const sync = vi.fn();
  const close = vi.fn();
  const fetchMock = vi.fn<typeof fetch>();
  const database = {};
  let previousExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.resetModules();
    previousExitCode = process.exitCode;
    sync.mockReset().mockResolvedValue({ warnings: ["Catalog warning"] });
    close.mockReset().mockResolvedValue(undefined);
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
    vi.doMock("@/lib/catalog/sync", () => ({ syncCatalog: sync }));
    vi.doMock("@/lib/db/client", () => ({ getDb: () => database, closeDb: close }));
    vi.doMock("../../scripts/_env", () => ({}));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("APP_URL", "http://127.0.0.1:3000");
    vi.stubEnv("INTERNAL_REVALIDATE_SECRET", "catalog-secret-for-tests");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = previousExitCode;
    vi.doUnmock("@/lib/catalog/sync");
    vi.doUnmock("@/lib/db/client");
    vi.doUnmock("../../scripts/_env");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function runScript() {
    await import("../../scripts/sync-catalog");
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  }

  it("uses readServerEnv's environment, prints warnings, and posts the secret after sync", async () => {
    await runScript();
    expect(sync).toHaveBeenCalledWith(database, {
      models: expect.any(Array), upstreams: expect.any(Array), environment: "preview",
    });
    expect(console.warn).toHaveBeenCalledWith("Catalog warning");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL("http://127.0.0.1:3000/api/internal/revalidate-catalog"),
      { method: "POST", headers: { authorization: "Bearer catalog-secret-for-tests" }, redirect: "error" },
    );
    expect(sync.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(["APP_URL", "INTERNAL_REVALIDATE_SECRET"])("warns and skips revalidation without %s", async (name) => {
    vi.stubEnv(name, undefined);
    await runScript();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("not revalidated"));
  });

  it("closes the database and reports a failed synchronization without revalidating", async () => {
    const error = new Error("Invalid catalog");
    sync.mockRejectedValue(error);
    await runScript();
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(error);
  });

  it("reports unsuccessful HTTP revalidation after a successful sync", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await runScript();
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({
      message: "Catalog cache revalidation failed (HTTP 401).",
    }));
  });

  it("reports that sync succeeded when the revalidation server cannot be reached", async () => {
    const error = new TypeError("fetch failed");
    fetchMock.mockRejectedValue(error);
    await runScript();
    await vi.waitFor(() => expect(process.exitCode).toBe(1));
    expect(sync).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({
      message: "Catalog was synchronized, but cache revalidation failed: the server could not be reached.",
      cause: error,
    }));
  });
});
