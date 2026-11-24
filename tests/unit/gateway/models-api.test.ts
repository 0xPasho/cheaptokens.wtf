// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { CATALOG } from "@catalog/models";

import { buildModelsResponse, priceInUsd } from "@/lib/catalog/public-api";
import { getCatalog } from "@/lib/catalog/queries";

vi.mock("@catalog/models", () => import("../../fixtures/catalog-models"));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

import { cacheTag } from "next/cache";

import { GET } from "@/app/v1/models/route";

describe("GET /v1/models", () => {
  it("is public, tags its cache and returns exactly the documented fields", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(buildModelsResponse());
    expect(cacheTag).toHaveBeenCalledWith("catalog");
    expect(Object.keys(body).sort()).toEqual(["data", "object"]);
    expect(body.object).toBe("list");
    expect(body.data.map((model: { id: string }) => model.id)).toEqual(getCatalog().map((model) => model.id));
    const haiku = body.data.find((model: { id: string }) => model.id === "anthropic/claude-haiku-4.5");
    expect(haiku).toEqual({
      id: "anthropic/claude-haiku-4.5", object: "model", created: 1760000000, owned_by: "anthropic",
      name: "Claude Haiku 4.5", context_length: 200000, tags: ["fast", "vision", "tools", "long-context"],
      pricing: { currency: "USD", unit: "1M_tokens", input: "0.30", output: "1.50", official_input: "1.00", official_output: "5.00", discount_percent: 70 },
      status: "active",
    });
    expect(await (await GET()).json()).toEqual(body);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("omits hidden and retired entries while retaining deprecated ones", () => {
    const entry = CATALOG[0];
    const result = buildModelsResponse([
      { ...entry, id: "test/active", status: "active" },
      { ...entry, id: "test/hidden", status: "hidden" },
      { ...entry, id: "test/retired", status: "retired" },
      { ...entry, id: "test/deprecated", status: "deprecated" },
    ]);
    expect(result.data.map((model) => model.id)).toEqual(["test/active", "test/deprecated"]);
    expect(buildModelsResponse().data.some((model) => model.id === "qwen/qwen3.8-flash")).toBe(false);
  });

  it("publishes the reasoning levels it knows and omits the field when it does not (ADR-0076)", () => {
    const entry = CATALOG[0];
    const result = buildModelsResponse([
      { ...entry, id: "test/levels", status: "active", reasoningLevels: ["low", "medium", "high"] },
      { ...entry, id: "test/none", status: "active", reasoningLevels: [] },
      { ...entry, id: "test/unknown", status: "active", reasoningLevels: undefined },
    ]);
    const levels = Object.fromEntries(result.data.map((model) => [model.id, "reasoning_levels" in model ? model.reasoning_levels : "absent"]));
    expect(levels).toEqual({ "test/levels": ["low", "medium", "high"], "test/none": [], "test/unknown": "absent" });
  });

  it.each([
    ["0", "0.00"], ["1", "0.000001"], ["100000", "0.10"], ["22500", "0.0225"],
    ["1000000", "1.00"], ["1100000", "1.10"], ["9007199254740993123456", "9007199254740993.123456"],
  ])("formats %s micro USD without floats", (input, expected) => {
    expect(priceInUsd(BigInt(input))).toBe(expected);
  });
});
