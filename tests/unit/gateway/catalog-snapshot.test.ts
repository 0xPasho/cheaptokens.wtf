// @vitest-environment node
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { modelUpstreams, models, upstreams } from "@/lib/db/schema";
import { createCatalogSource, loadCatalogSnapshot } from "@/lib/gateway/catalog-snapshot";
import type { CatalogSnapshot } from "@/lib/gateway/types";

import { createTestDb } from "../../helpers/db";

afterEach(() => vi.useRealTimers());

const hugePrice = BigInt("9007199254740993");
const model: typeof models.$inferInsert = {
  id: "test/model", name: "Test model", author: "test", description: { en: "Test" },
  contextLength: 200_000, officialInputPriceMicroUsd: hugePrice,
  officialOutputPriceMicroUsd: hugePrice + BigInt(1),
  officialPriceSourceUrl: "https://example.com/pricing", officialPriceVerifiedAt: null,
  discountBps: 0, inputPriceMicroUsd: hugePrice, outputPriceMicroUsd: hugePrice + BigInt(1),
  tags: ["reasoning", "tools"], status: "active",
};

describe("loadCatalogSnapshot", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  const options = {
    now: () => 1_000,
    env: { PRIMARY_KEY: "primary-secret", BACKUP_KEY: "backup-secret", UPSTREAM_PRIMARY_BASE_URL: "http://127.0.0.1:9999/v1/" },
    environment: "development" as const,
  };

  beforeEach(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(models).values([
      model,
      { ...model, id: "test/hidden", status: "hidden", tags: [] },
      { ...model, id: "test/retired", status: "retired" },
    ]);
    await testDb.db.insert(upstreams).values([
      { id: "primary", name: "Primary", baseUrl: "https://primary.example/v1", apiKeyEnv: "PRIMARY_KEY", enabled: true, sendsPriceCap: true },
      { id: "backup", name: "Backup", baseUrl: "https://backup.example/v1", apiKeyEnv: "BACKUP_KEY", enabled: true },
      { id: "missing-key", name: "Missing key", baseUrl: "https://missing.example/v1", apiKeyEnv: "MISSING_KEY", enabled: true },
      { id: "disabled-upstream", name: "Disabled upstream", baseUrl: "https://disabled.example/v1", enabled: false },
      { id: "disabled-mapping", name: "Disabled mapping", baseUrl: "https://disabled.example/v1", enabled: true },
      { id: "ops-disabled", name: "Emergency disabled", baseUrl: "https://disabled.example/v1", enabled: true },
      { id: "mock", name: "Mock", baseUrl: "http://127.0.0.1:4010/v1", apiKeyEnv: null, enabled: true },
    ]);
    await testDb.db.insert(modelUpstreams).values([
      { upstreamId: "primary", priority: 20 },
      { upstreamId: "backup", priority: 1 },
      { upstreamId: "missing-key", priority: 0 },
      { upstreamId: "disabled-upstream", priority: 0 },
      { upstreamId: "disabled-mapping", priority: 0, enabled: false },
      { upstreamId: "ops-disabled", priority: 0, opsDisabledAt: new Date(), opsDisabledReason: "Incident" },
      { upstreamId: "mock", priority: 30 },
    ].map((mapping) => ({
      modelId: model.id, upstreamModel: `${mapping.upstreamId}/remote`,
      costInputMicroUsd: hugePrice, costOutputMicroUsd: hugePrice + BigInt(2), enabled: true,
      ...mapping,
    })));
  });
  afterEach(async () => {
    await testDb?.close();
  });

  it("uses two queries, filters disabled targets and missing keys, and orders by priority", async () => {
    const select = vi.spyOn(testDb.db, "select");
    const snapshot = await loadCatalogSnapshot(testDb.db, options);
    expect(select).toHaveBeenCalledTimes(2);
    expect(snapshot.loadedAt).toBe(1_000);
    const saved = snapshot.getModel(model.id);
    expect(saved).toMatchObject({
      id: model.id, status: "active", isReasoning: true,
      inputPricePer1M: hugePrice, outputPricePer1M: hugePrice + BigInt(1),
      officialInputPer1M: hugePrice, officialOutputPer1M: hugePrice + BigInt(1),
    });
    expect(saved?.upstreams).toEqual([
      {
        upstreamId: "backup", baseUrl: "https://backup.example/v1", apiKey: "backup-secret",
        upstreamModel: "backup/remote", costInputPer1M: hugePrice, costOutputPer1M: hugePrice + BigInt(2),
        priority: 1, sendsPriceCap: false,
      },
      {
        upstreamId: "primary", baseUrl: "http://127.0.0.1:9999/v1", apiKey: "primary-secret",
        upstreamModel: "primary/remote", costInputPer1M: hugePrice, costOutputPer1M: hugePrice + BigInt(2),
        priority: 20, sendsPriceCap: true,
      },
      {
        upstreamId: "mock", baseUrl: "http://127.0.0.1:4010/v1", apiKey: "",
        upstreamModel: "mock/remote", costInputPer1M: hugePrice, costOutputPer1M: hugePrice + BigInt(2),
        priority: 30, sendsPriceCap: false,
      },
    ]);
    expect(snapshot.getModel("test/hidden")).toMatchObject({ status: "hidden", isReasoning: false, upstreams: [] });
    expect(snapshot.getModel("test/retired")).toMatchObject({ status: "retired", upstreams: [] });
    expect(snapshot.getModel("missing/model")).toBeUndefined();
  });

  it("omits the mock in production even if it is enabled in the database", async () => {
    const snapshot = await loadCatalogSnapshot(testDb.db, { ...options, environment: "production" });
    expect(snapshot.getModel(model.id)?.upstreams.map(({ upstreamId }) => upstreamId)).toEqual(["backup", "primary"]);
  });

  it("treats empty secrets as absent and supports overrides for hyphenated upstream IDs", async () => {
    const snapshot = await loadCatalogSnapshot(testDb.db, {
      ...options,
      env: {
        PRIMARY_KEY: "", MISSING_KEY: "available-secret", UPSTREAM_MISSING_KEY_BASE_URL: "http://127.0.0.1:9876/v1",
      },
    });
    expect(snapshot.getModel(model.id)?.upstreams.map(({ upstreamId, baseUrl }) => ({ upstreamId, baseUrl })))
      .toEqual([
        { upstreamId: "missing-key", baseUrl: "http://127.0.0.1:9876/v1" },
        { upstreamId: "mock", baseUrl: "http://127.0.0.1:4010/v1" },
      ]);
  });

  it("reflects an emergency switch by the default 60 second TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(0);
    const load = vi.fn(() => loadCatalogSnapshot(testDb.db, { ...options, now: Date.now }));
    const source = createCatalogSource(load, { now: Date.now });
    const initial = await source();
    await testDb.db.update(modelUpstreams).set({ opsDisabledAt: new Date() })
      .where(eq(modelUpstreams.upstreamId, "primary"));
    vi.setSystemTime(59_999);
    expect(await source()).toBe(initial);
    expect(load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(60_000);
    const refreshed = await source();
    expect(load).toHaveBeenCalledTimes(2);
    expect(refreshed.loadedAt).toBe(60_000);
    expect(refreshed.getModel(model.id)?.upstreams.map(({ upstreamId }) => upstreamId)).toEqual(["backup", "mock"]);
  });
});

describe("createCatalogSource", () => {
  const snapshot = (loadedAt: number): CatalogSnapshot => ({ loadedAt, getModel: () => undefined });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  it("shares a single in-flight load on both initial and expired concurrent calls", async () => {
    let complete: (value: CatalogSnapshot) => void = () => { throw new Error("Load has not started"); };
    const load = vi.fn(() => new Promise<CatalogSnapshot>((resolve) => { complete = resolve; }));
    const source = createCatalogSource(load, { now: Date.now });
    for (const time of [0, 60_000]) {
      vi.setSystemTime(time);
      const calls = [source(), source(), source()];
      expect(calls[0]).toBe(calls[1]);
      expect(calls[0]).toBe(calls[2]);
      await Promise.resolve();
      expect(load).toHaveBeenCalledTimes(time === 0 ? 1 : 2);
      const next = snapshot(time);
      complete(next);
      expect(await Promise.all(calls)).toEqual([next, next, next]);
    }
  });

  it("serves the previous snapshot on a failed reload and retries on the next call", async () => {
    const initial = snapshot(0);
    const refreshed = snapshot(60_000);
    const error = new Error("Database unavailable");
    const onError = vi.fn();
    const load = vi.fn<() => Promise<CatalogSnapshot>>()
      .mockResolvedValueOnce(initial)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(refreshed);
    const source = createCatalogSource(load, { now: Date.now, onError });
    expect(await source()).toBe(initial);
    expect(onError).not.toHaveBeenCalled();
    vi.setSystemTime(60_000);
    expect(await Promise.all([source(), source()])).toEqual([initial, initial]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(await source()).toBe(refreshed);
    expect(load).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(await source()).toBe(refreshed);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("propagates an initial load failure and permits a later retry", async () => {
    const next = snapshot(0);
    const load = vi.fn<() => Promise<CatalogSnapshot>>()
      .mockRejectedValueOnce(new Error("Initial load failed"))
      .mockResolvedValueOnce(next);
    const source = createCatalogSource(load, { now: Date.now });
    await expect(source()).rejects.toThrow("Initial load failed");
    expect(await source()).toBe(next);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("honors a custom TTL without extending freshness by the load duration", async () => {
    const load = vi.fn(async () => {
      const next = snapshot(Date.now());
      vi.setSystemTime(Date.now() + 500);
      return next;
    });
    const source = createCatalogSource(load, { ttlMs: 1_000, now: Date.now });
    const first = await source();
    vi.setSystemTime(999);
    expect(await source()).toBe(first);
    vi.setSystemTime(1_000);
    expect(await source()).not.toBe(first);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
