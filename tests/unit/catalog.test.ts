// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CATALOG } from "@catalog/models";
import {
  CHEAP_OUTPUT_MAX,
  computedTags,
  filterModels,
  getCatalog,
  getModel,
  LONG_CONTEXT_MIN,
  requestCost,
  similarModels,
  toModel,
} from "@/lib/catalog/queries";
import { MODEL_TAGS } from "@/lib/catalog/tags";
import type { CatalogEntry } from "@/lib/catalog/types";

/** Reglas de docs/06-catalogo-y-precios.md sobre catalog/models.ts. */
describe("catalog/models.ts", () => {
  it("los IDs son únicos y tienen la forma autor/modelo en minúsculas", () => {
    const ids = CATALOG.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
  });

  it("el autor coincide con el prefijo del ID", () => {
    for (const entry of CATALOG) expect(entry.id.startsWith(`${entry.author}/`), entry.id).toBe(true);
  });

  it("solo usa tags de la lista fija y no escribe a mano los calculados", () => {
    for (const entry of CATALOG) {
      for (const tag of entry.tags) expect(MODEL_TAGS, entry.id).toContain(tag);
      expect(entry.tags, entry.id).not.toContain("long-context");
      expect(entry.tags, entry.id).not.toContain("cheap");
    }
  });

  it("todo modelo tiene descripción en inglés, precios positivos y descuento entre 0 y 100%", () => {
    for (const entry of CATALOG) {
      expect(entry.description.en.length, entry.id).toBeGreaterThan(10);
      expect(entry.officialInput, entry.id).toBeGreaterThan(0);
      expect(entry.officialOutput, entry.id).toBeGreaterThan(0);
      expect(entry.discountBps, entry.id).toBeGreaterThanOrEqual(0);
      expect(entry.discountBps, entry.id).toBeLessThan(10_000);
      expect(entry.officialPriceSourceUrl, entry.id).toMatch(/^https:\/\//);
    }
  });

  it("un modelo deprecated tiene fecha de retiro", () => {
    for (const entry of CATALOG.filter((e) => e.status === "deprecated")) {
      expect(entry.retiresOn, entry.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry => ({
  id: "acme/model",
  name: "Model",
  author: "acme",
  description: { en: "A test model for the catalog." },
  contextLength: 100_000,
  officialInput: 1_000_000,
  officialOutput: 10_000_000,
  officialPriceSourceUrl: "https://example.com",
  officialPriceVerifiedAt: null,
  discountBps: 5000,
  tags: ["fast"],
  status: "active",
  ...overrides,
});

describe("tags calculados", () => {
  it("long-context desde 200,000 tokens", () => {
    expect(computedTags(entry({ contextLength: LONG_CONTEXT_MIN }))).toContain("long-context");
    expect(computedTags(entry({ contextLength: LONG_CONTEXT_MIN - 1 }))).not.toContain("long-context");
  });

  it("cheap si el precio cheaptokens.wtf de output es ≤ $1.00 por 1M", () => {
    expect(computedTags(entry({ officialOutput: 2_000_000, discountBps: 5000 }))).toContain("cheap");
    expect(CHEAP_OUTPUT_MAX).toBe(1_000_000);
    expect(computedTags(entry({ officialOutput: 2_000_002, discountBps: 5000 }))).not.toContain("cheap");
  });

  it("allTags sigue el orden de MODEL_TAGS y deriva el slug", () => {
    const model = toModel(entry({ id: "acme/model-1.5", tags: ["tools", "fast"], contextLength: 300_000 }));
    expect(model.allTags).toEqual(["fast", "tools", "long-context"]);
    expect(model.slug).toBe("model-1.5");
  });
});

describe("consultas", () => {
  const entries = [
    entry({ id: "acme/a", name: "Alpha", discountBps: 9000, tags: ["fast", "vision"] }),
    entry({ id: "acme/b", name: "Beta", discountBps: 5000, tags: ["fast"], officialOutput: 1_000_000 }),
    entry({ id: "acme/c", name: "Gamma", discountBps: 7000, tags: ["coding"], status: "hidden" }),
    entry({ id: "acme/d", name: "Delta", discountBps: 7000, tags: ["vision"], status: "retired" }),
  ];
  const models = getCatalog(entries);

  it("el catálogo muestra active y deprecated; oculta hidden y retired", () => {
    expect(models.map((m) => m.id)).toEqual(["acme/a", "acme/b"]);
    expect(getModel("acme", "c", entries)).toBeUndefined();
  });

  it("busca por nombre o ID sin importar mayúsculas", () => {
    expect(filterModels(models, { query: "ALP", tags: [], sort: "name" }).map((m) => m.id)).toEqual(["acme/a"]);
    expect(filterModels(models, { query: "acme/b", tags: [], sort: "name" }).map((m) => m.id)).toEqual(["acme/b"]);
  });

  it("los tags se combinan con Y", () => {
    expect(filterModels(models, { query: "", tags: ["fast", "vision"], sort: "name" }).map((m) => m.id)).toEqual(["acme/a"]);
    expect(filterModels(models, { query: "", tags: ["fast"], sort: "name" })).toHaveLength(2);
  });

  it("ordena por descuento, precio de output o nombre", () => {
    expect(filterModels(models, { query: "", tags: [], sort: "discount" })[0].id).toBe("acme/a");
    expect(filterModels(models, { query: "", tags: [], sort: "output" })[0].id).toBe("acme/b");
    expect(filterModels(models, { query: "", tags: [], sort: "name" }).map((m) => m.name)).toEqual(["Alpha", "Beta"]);
  });

  it("los modelos parecidos comparten tags y no incluyen al modelo", () => {
    const [alpha] = models;
    expect(similarModels(alpha, models).map((m) => m.id)).toEqual(["acme/b"]);
  });

  it("requestCost aplica la fórmula de docs/06 y redondea hacia arriba", () => {
    // El ejemplo de docs/06: 2,000 + 500 tokens con $0.30 / $1.50 por 1M = 1,350 µUSD.
    expect(requestCost(300_000, 1_500_000, 2_000, 500)).toBe(1_350);
    expect(requestCost(1, 1, 1, 0)).toBe(1);
  });
});
