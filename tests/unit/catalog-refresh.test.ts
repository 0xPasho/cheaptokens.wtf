// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mergeCatalog, mockUpstreamFor } from "@/lib/catalog/merge";
import type { CatalogProvider, ProviderOffer } from "@/lib/catalog/providers/types";
import { loadStoredEntries, refreshCatalog } from "@/lib/catalog/refresh";
import type { CatalogEntry, UpstreamDefinition } from "@/lib/catalog/types";
import { modelUpstreams, models, upstreams } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

import { createTestDb } from "../helpers/db";

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@catalog/models", () => ({ CATALOG: [] }));

const entry = (id: string, discountBps: number, overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id, name: id, author: id.split("/")[0],
  description: { en: `${id}.` },
  contextLength: 100_000,
  officialInput: 1_000_000, officialOutput: 5_000_000,
  officialPriceSourceUrl: "https://example.com/pricing", officialPriceVerifiedAt: null,
  discountBps, tags: [], status: "active",
  ...overrides,
});

/** Una oferta con el costo como fracción del oficial y el mayor descuento que deja 30 % de margen. */
const offer = (id: string, costShareBps: number, discountBps: number, upstreamModel = id): ProviderOffer => ({
  entry: entry(id, discountBps),
  mapping: { model: id, upstreamModel, costInputPer1M: costShareBps * 100, costOutputPer1M: costShareBps * 500, priority: 1 },
});

const upstream = (id: string): Omit<UpstreamDefinition, "models"> => ({
  id, name: id, baseUrl: `https://${id}.example.com/v1`, apiKeyEnv: `UPSTREAM_${id.toUpperCase()}_API_KEY`,
  sendsPriceCap: false, environments: ["development", "preview", "production"],
});

describe("mergeCatalog", () => {
  it("publishes the price of the cheapest route and keeps other providers only when they fit under it", () => {
    const merged = mergeCatalog([
      // 20 % del oficial → 74 % de descuento; 19.9 % cabe bajo ese mismo precio; 40 % no.
      { upstream: upstream("alpha"), offers: [offer("acme/one", 2_000, 7_400), offer("acme/two", 4_000, 4_800)] },
      { upstream: upstream("beta"), offers: [offer("acme/one", 1_990, 7_400, "beta-one"), offer("acme/two", 2_000, 7_400)] },
    ]);
    expect(merged.models.map(({ id, discountBps }) => [id, discountBps])).toEqual([["acme/one", 7_400], ["acme/two", 7_400]]);
    const routes = Object.fromEntries(merged.upstreams.map((item) => [item.id, item.models.map((m) => [m.model, m.priority])]));
    // En acme/one beta es más barato: va primero. En acme/two la ruta cara de alpha se descarta.
    expect(routes).toEqual({ alpha: [["acme/one", 2]], beta: [["acme/one", 1], ["acme/two", 1]] });
    expect(merged.report).toEqual({ models: 2, routes: 3, droppedRoutes: 1, retired: 0 });
  });

  it("keeps curated hidden and deprecated states and retires what nobody offers anymore", () => {
    const previous = [
      entry("acme/hidden", 5_000, { status: "hidden" }),
      entry("acme/old", 5_000, { status: "deprecated", retiresOn: "2027-01-01" }),
      entry("acme/back", 5_000, { status: "retired" }),
      entry("acme/gone", 5_000),
    ];
    const merged = mergeCatalog([{
      upstream: upstream("alpha"),
      offers: [offer("acme/hidden", 2_000, 7_400), offer("acme/old", 2_000, 7_400), offer("acme/back", 2_000, 7_400)],
    }], previous);
    expect(merged.models.map(({ id, status, retiresOn }) => [id, status, retiresOn])).toEqual([
      ["acme/back", "active", undefined],
      ["acme/hidden", "hidden", undefined],
      ["acme/old", "deprecated", "2027-01-01"],
      ["acme/gone", "retired", undefined],
    ]);
    expect(merged.upstreams[0].models.map((m) => m.model)).toEqual(["acme/back", "acme/hidden", "acme/old"]);
  });

  it("takes the smallest max output among the routes that serve, and keeps the previous one when none reports it", () => {
    const withMax = (item: ProviderOffer, maxOutputTokens: number): ProviderOffer => ({ ...item, entry: { ...item.entry, maxOutputTokens } });
    const merged = mergeCatalog([
      // En acme/two la ruta de alpha no cabe bajo el precio: su salida máxima no cuenta.
      { upstream: upstream("alpha"), offers: [withMax(offer("acme/one", 2_000, 7_400), 128_000), withMax(offer("acme/two", 4_000, 4_800), 8_000)] },
      { upstream: upstream("beta"), offers: [withMax(offer("acme/one", 1_990, 7_400), 64_000), withMax(offer("acme/two", 2_000, 7_400), 32_000), offer("acme/three", 2_000, 7_400), offer("acme/four", 2_000, 7_400)] },
    ], [entry("acme/three", 7_400, { maxOutputTokens: 4_096 })]);
    expect(Object.fromEntries(merged.models.map((model) => [model.id, model.maxOutputTokens])))
      .toEqual({ "acme/one": 64_000, "acme/two": 32_000, "acme/three": 4_096, "acme/four": undefined });
    expect(merged.models.find((model) => model.id === "acme/four")).not.toHaveProperty("maxOutputTokens");
  });

  it("puts the mock behind every real route at half the cheapest cost", () => {
    const merged = mergeCatalog([
      { upstream: upstream("alpha"), offers: [offer("acme/one", 2_000, 7_400)] },
      { upstream: upstream("beta"), offers: [offer("acme/one", 1_990, 7_400)] },
    ]);
    expect(mockUpstreamFor(merged.upstreams)).toMatchObject({
      id: "mock", environments: ["development", "preview"],
      models: [{ model: "acme/one", upstreamModel: "acme/one", costInputPer1M: 99_500, costOutputPer1M: 497_500, priority: 1_000 }],
    });
  });
});

describe("refreshCatalog", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;
  let db: Db;
  beforeEach(async () => { testDb = await createTestDb(); db = testDb.db; });
  afterEach(async () => { await testDb.close(); });

  const provider = (id: string, load: () => ProviderOffer[]): CatalogProvider => ({
    upstream: upstream(id), loadOffers: async () => load(),
  });
  const routes = async () => (await db.select().from(modelUpstreams))
    .filter((row) => row.enabled)
    .map((row) => `${row.upstreamId}:${row.modelId}:${row.costOutputMicroUsd}:${row.priority}`).sort();

  it("writes prices and routes, follows a cost change on the next run and round-trips through the database", async () => {
    let share = 2_000;
    let discount = 7_400;
    const alpha = provider("alpha", () => [offer("acme/one", share, discount)]);
    const first = await refreshCatalog(db, { providers: [alpha], environment: "production" });
    expect(first).toMatchObject({ changed: true, models: 1, routes: 1, retired: 0, providers: [{ id: "alpha", ok: true, offers: 1 }] });
    expect(await db.select().from(models)).toMatchObject([{ id: "acme/one", discountBps: 7_400, outputPriceMicroUsd: BigInt(1_300_000) }]);
    expect(await routes()).toEqual(["alpha:acme/one:1000000:1"]);
    // En producción el mock no se escribe.
    expect((await db.select().from(upstreams)).map((row) => row.id)).toEqual(["alpha"]);

    // Sin cambios en el proveedor no se escribe nada: `updated_at` queda igual.
    const [{ updatedAt }] = await db.select().from(upstreams);
    expect(await refreshCatalog(db, { providers: [alpha], environment: "production" })).toMatchObject({ changed: false, models: 1 });
    expect((await db.select().from(upstreams))[0].updatedAt).toEqual(updatedAt);

    share = 3_000;
    discount = 6_100;
    expect(await refreshCatalog(db, { providers: [alpha], environment: "production" })).toMatchObject({ changed: true });
    expect(await db.select().from(models)).toMatchObject([{ discountBps: 6_100, outputPriceMicroUsd: BigInt(1_950_000) }]);
    expect(await routes()).toEqual(["alpha:acme/one:1500000:1"]);
    expect(await loadStoredEntries(db)).toEqual([entry("acme/one", 6_100)]);
  });

  it("stores the max output, follows a change and keeps it when the provider stops reporting it (ADR-0067)", async () => {
    let maxOutputTokens: number | undefined = 128_000;
    const alpha = provider("alpha", () => {
      const item = offer("acme/one", 2_000, 7_400);
      return [maxOutputTokens === undefined ? item : { ...item, entry: { ...item.entry, maxOutputTokens } }];
    });
    const stored = async () => (await db.select().from(models))[0].maxOutputTokens;
    await refreshCatalog(db, { providers: [alpha], environment: "production" });
    expect(await stored()).toBe(128_000);
    expect(await refreshCatalog(db, { providers: [alpha], environment: "production" })).toMatchObject({ changed: false });

    maxOutputTokens = 64_000;
    expect(await refreshCatalog(db, { providers: [alpha], environment: "production" })).toMatchObject({ changed: true });
    expect(await stored()).toBe(64_000);

    maxOutputTokens = undefined;
    expect(await refreshCatalog(db, { providers: [alpha], environment: "production" })).toMatchObject({ changed: false });
    expect(await stored()).toBe(64_000);
    expect(await loadStoredEntries(db)).toEqual([entry("acme/one", 7_400, { maxOutputTokens: 64_000 })]);
  });

  it("keeps the stored routes of a provider that fails and writes nothing when every provider fails", async () => {
    let alphaDown = false;
    let betaDown = false;
    const alpha = provider("alpha", () => {
      if (alphaDown) throw new Error("alpha is down");
      return [offer("acme/one", 2_000, 7_400)];
    });
    const beta = provider("beta", () => {
      if (betaDown) throw new Error("beta is down");
      return [offer("acme/two", 2_000, 7_400)];
    });
    await refreshCatalog(db, { providers: [alpha, beta], environment: "production" });
    const healthy = await routes();
    expect(healthy).toEqual(["alpha:acme/one:1000000:1", "beta:acme/two:1000000:1"]);

    alphaDown = true;
    const partial = await refreshCatalog(db, { providers: [alpha, beta], environment: "production" });
    expect(partial.providers).toEqual([
      { id: "alpha", ok: false, offers: 1, error: "alpha is down" },
      { id: "beta", ok: true, offers: 1 },
    ]);
    expect(partial).toMatchObject({ changed: false, models: 2, retired: 0 });
    expect(await routes()).toEqual(healthy);

    betaDown = true;
    await expect(refreshCatalog(db, { providers: [alpha, beta], environment: "production" })).rejects.toThrow("No catalog provider answered");
    expect(await routes()).toEqual(healthy);
  });

  it("retires a model that disappears and uses the seed only while the database is empty", async () => {
    let offers = [offer("acme/one", 2_000, 7_400), offer("acme/two", 2_000, 7_400)];
    const alpha = provider("alpha", () => offers);
    const seed = [entry("acme/seeded", 5_000)];
    await refreshCatalog(db, { providers: [alpha], environment: "development", seed });
    const status = async () => Object.fromEntries((await db.select().from(models)).map((row) => [row.id, row.status]));
    expect(await status()).toEqual({ "acme/one": "active", "acme/two": "active", "acme/seeded": "retired" });
    // Fuera de producción el mock queda detrás.
    expect((await db.select().from(upstreams)).map((row) => row.id).sort()).toEqual(["alpha", "mock"]);

    expect(await refreshCatalog(db, { providers: [alpha], environment: "development", seed })).toMatchObject({ changed: false });
    offers = [offer("acme/one", 2_000, 7_400)];
    await refreshCatalog(db, { providers: [alpha], environment: "development", seed: [entry("acme/ignored", 5_000)] });
    expect(await status()).toEqual({ "acme/one": "active", "acme/two": "retired", "acme/seeded": "retired" });
    expect(await routes()).toEqual(["alpha:acme/one:1000000:1", "mock:acme/one:500000:1000"]);
  });
});

describe("GET /api/internal/refresh-catalog", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("rejects requests without one of the two secrets before touching anything", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-with-enough-length");
    vi.stubEnv("INTERNAL_REVALIDATE_SECRET", "");
    const { GET, POST } = await import("@/app/api/internal/refresh-catalog/route");
    const call = (handler: typeof GET, authorization?: string) =>
      handler(new Request("http://localhost/api/internal/refresh-catalog", { headers: authorization ? { authorization } : {} }));
    expect((await call(GET)).status).toBe(401);
    expect((await call(POST, "Bearer wrong")).status).toBe(401);
    expect((await call(GET, "Bearer ")).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();

    // Con el secreto correcto pasa la puerta; sin base de datos, la actualización falla sin revalidar.
    vi.stubEnv("DATABASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(GET, "Bearer cron-secret-with-enough-length");
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: "refresh_failed" });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
