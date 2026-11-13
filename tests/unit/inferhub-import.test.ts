// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_IS_SAMPLE } from "@catalog/models";
import { UPSTREAMS } from "@catalog/upstreams";
import { importInferhubCatalog, publishedPriceToMicros } from "@/lib/catalog/inferhub-import";
import { getCatalog } from "@/lib/catalog/queries";
import { buildModelsResponse } from "@/lib/catalog/public-api";
import { validateCatalog } from "@/lib/catalog/validate";
import { syncCatalog } from "@/lib/catalog/sync";
import { loadCatalogSnapshot } from "@/lib/gateway/catalog-snapshot";
import { createTestDb } from "../helpers/db";

const model = (overrides: Record<string, unknown> = {}) => ({
  id: "ant/claude-haiku-4-5", upstream_label: "Claude Haiku 4.5",
  input_token_limit: 200_000, modality: "text,image",
  pricing: { official_in: 1, official_out: 5, asks_in: [0.01, 0.2, 0.5], asks_out: [0.05, 1, 2.5] },
  ...overrides,
});
const payload = (...data: ReturnType<typeof model>[]) => ({ object: "list", data });

describe("official catalog import", () => {
  it("uses published names, context and prices, and budgets the median offer instead of promising the minimum", () => {
    const result = importInferhubCatalog(payload(model()));
    expect(result.models[0]).toMatchObject({ id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", contextLength: 200_000, officialInput: 1_000_000, officialOutput: 5_000_000, discountBps: 7800, status: "active", officialPriceVerifiedAt: null, tags: ["vision"] });
    expect(result.mappings[0]).toMatchObject({ upstreamModel: "ant/claude-haiku-4-5", costInputPer1M: 200_000, costOutputPer1M: 1_000_000 });
  });

  it("deduplicates routes and keeps the selected route's context and pricing together", () => {
    const cheap = model({ id: "cmc/anthropic/claude-haiku-4-5", input_token_limit: 100_000 });
    const expensive = model({ id: "kiro/claude-haiku-4.5", upstream_label: "Claude Haiku 4.5 (Kiro)", input_token_limit: 500_000, pricing: { official_in: 1, official_out: 5, asks_in: [0.5], asks_out: [2.5] } });
    const result = importInferhubCatalog(payload(expensive, cheap));
    expect(result.models).toHaveLength(1);
    expect(result.models[0].contextLength).toBe(100_000);
    expect(result.mappings[0].upstreamModel).toBe(cheap.id);
    expect(importInferhubCatalog(payload(cheap, expensive))).toEqual(result);
  });

  it("excludes free pools, aliases, unpriced entries, unsupported endpoints and unknown creators", () => {
    const result = importInferhubCatalog(payload(model(), model({ id: "free/claude" }), model({ id: "claude-haiku" }), model({ id: "ant/no-price", pricing: undefined }), model({ id: "oai/image", upstream_label: "GPT Image 2" }), model({ id: "acme/unknown", upstream_label: "Mystery" })));
    expect(result.models).toHaveLength(1);
    expect(result.report.skipped).toEqual({ "free-or-alias": 2, "missing-paid-pricing": 1, "unsupported-endpoint": 1, "unattributed-creator": 1 });
  });

  it("rejects a response with no usable models instead of replacing the catalog with an empty list", () => {
    expect(() => importInferhubCatalog(payload())).toThrow();
    expect(() => importInferhubCatalog(payload(model({ id: "free/claude" })))).toThrow("no eligible paid chat models");
    expect(() => importInferhubCatalog(payload(model({ pricing: { official_in: -1 } })))).toThrow();
  });

  it("keeps removed IDs retired and restores them only when their model reappears", () => {
    const old = importInferhubCatalog(payload(model())).models;
    const next = importInferhubCatalog(payload(model({ id: "oai/gpt-5", upstream_label: "GPT 5" })), old);
    expect(next.models.find((entry) => entry.id === old[0].id)?.status).toBe("retired");
    expect(getCatalog(next.models).map((entry) => entry.id)).toEqual(["openai/gpt-5"]);
    expect(importInferhubCatalog(payload(model()), next.models).models[0].status).toBe("active");
  });

  it("drops offers that cannot cover the minimum margin at the official price", () => {
    const result = importInferhubCatalog(payload(model(), model({ id: "oai/gpt-5", upstream_label: "GPT 5", pricing: { official_in: 1, official_out: 1, asks_in: [1], asks_out: [1] } })));
    expect(result.report.skipped["insufficient-margin"]).toBe(1);
    expect(result.models).toHaveLength(1);
  });

  it.each([[0.00000001, 1], [0.000001, 1], [0.01755, 17_550], [0.0010000001, 1_001], [1.25, 1_250_000]])("converts %s USD conservatively to %s micro-USD", (usd, expected) => {
    expect(publishedPriceToMicros(usd)).toBe(expected);
  });
});

describe("imported application catalog", () => {
  it("syncs the imported catalog and loads a matching price-capped route for every public model", async () => {
    const database = await createTestDb();
    try {
      await syncCatalog(database.db, { models: CATALOG, upstreams: UPSTREAMS, environment: "production" });
      const snapshot = await loadCatalogSnapshot(database.db, { now: () => 1, env: { UPSTREAM_INFERHUB_API_KEY: "offline-test-key" }, environment: "production" });
      const mappings = UPSTREAMS.find((upstream) => upstream.id === "inferhub")!.models;
      for (const entry of getCatalog()) {
        const loaded = snapshot.getModel(entry.id)!;
        expect(loaded.status).toBe("active");
        expect(loaded.inputPricePer1M).toBe(BigInt(entry.discountedInput));
        expect(loaded.outputPricePer1M).toBe(BigInt(entry.discountedOutput));
        expect(loaded.upstreams).toHaveLength(1);
        expect(loaded.upstreams[0]).toMatchObject({ upstreamModel: mappings.find((mapping) => mapping.model === entry.id)!.upstreamModel, sendsPriceCap: true });
      }
    } finally { await database.close(); }
  }, 20_000);

  it("publishes genuine imported entries with a price-capped mapping for every visible model", () => {
    expect(CATALOG_IS_SAMPLE).toBe(false);
    expect(getCatalog().length).toBeGreaterThan(10);
    const real = UPSTREAMS.find((upstream) => upstream.id === "inferhub")!;
    expect(new Set(real.models.map((mapping) => mapping.model))).toEqual(new Set(getCatalog().map((entry) => entry.id)));
    expect(real.sendsPriceCap).toBe(true);
    expect(validateCatalog({ models: CATALOG, upstreams: UPSTREAMS, environment: "production" })).toEqual({ errors: [], warnings: [] });
  });

  it("keeps supplier routes and costs out of the public model response", () => {
    const text = JSON.stringify(buildModelsResponse()).toLowerCase();
    expect(text).not.toContain("inferhub");
    expect(text).not.toContain("upstreammodel");
    expect(text).not.toContain("costinputper1m");
    expect(getCatalog().some((entry) => entry.id === "anthropic/claude-sonnet-4.5")).toBe(false);
  });
});
