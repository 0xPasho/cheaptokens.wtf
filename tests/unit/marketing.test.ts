// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getCatalog, toModel } from "@/lib/catalog/queries";
import type { CatalogEntry, CatalogModel } from "@/lib/catalog/types";
import { en } from "@/lib/i18n/dictionaries/en";
import {
  DEFAULT_OVERFLOW_CAP_MICRO_USD,
  ESTIMATOR_MODELS,
  FAQ_TOPICS,
  groupHref,
  HOME_FAQ,
  maxDiscountBps,
  medianDiscountBps,
  MIN_DEPOSIT_MICRO_USD,
  PEEK_SIZE,
  PEEK_TAGS,
  peekGroups,
  pickModels,
  previewModels,
  PRICE_STRIP_MODELS,
  PRICING_FAQ,
  USAGE_TABLE_MODELS,
} from "@/lib/marketing";
import { MIN_DEPOSIT_MICRO_USD as DEPOSIT_MINIMUM } from "@/lib/payments/crypto/deposits";

/** Un modelo mínimo para probar el orden: solo importan autor, descuento y tags. */
function model(id: string, discountBps: number, tags: CatalogEntry["tags"] = ["reasoning"]): CatalogModel {
  const [author] = id.split("/");
  return toModel({
    id, name: id, author, description: { en: id }, contextLength: 1_000_000,
    officialInput: 2_000_000, officialOutput: 10_000_000, officialPriceSourceUrl: "https://example.com",
    officialPriceVerifiedAt: null, discountBps, tags, status: "active",
  });
}

describe("landing: cifras del catálogo", () => {
  const models = [model("a/one", 3500), model("b/two", 9000), model("c/three", 6700), model("d/four", 5000)];

  it("el mayor descuento y el mediano", () => {
    expect(maxDiscountBps(models)).toBe(9000);
    expect(medianDiscountBps(models)).toBe(5000);
    expect(medianDiscountBps(models.slice(0, 3))).toBe(6700);
    expect(maxDiscountBps([])).toBe(0);
    expect(medianDiscountBps([])).toBe(0);
  });

  it("pickModels respeta el orden pedido y se salta los que no existen", () => {
    expect(pickModels(models, ["c/three", "x/missing", "a/one"]).map((m) => m.id)).toEqual(["c/three", "a/one"]);
  });
});

describe("vistazo al catálogo", () => {
  it("por capacidad: mayor descuento primero y una tarjeta por autor antes de repetir", () => {
    const members = [
      model("a/one", 9000), model("a/two", 8900), model("a/three", 8800),
      model("b/one", 7000), model("c/one", 6000),
    ];
    expect(previewModels(members, "tag").map((m) => m.id)).toEqual(["a/one", "b/one", "c/one", "a/two"]);
  });

  it("por autor: solo el orden por descuento", () => {
    const members = [model("a/one", 5000), model("a/two", 9000), model("a/three", 7000)];
    expect(previewModels(members, "author").map((m) => m.id)).toEqual(["a/two", "a/three", "a/one"]);
  });

  it("los grupos del catálogo real: sin vacíos, con a lo más cuatro tarjetas y todas del grupo", () => {
    const catalog = getCatalog();
    for (const mode of ["tag", "author"] as const) {
      const groups = peekGroups(catalog, mode);
      expect(groups.length).toBeGreaterThan(0);
      for (const group of groups) {
        expect(group.count).toBeGreaterThan(0);
        expect(group.models.length).toBe(Math.min(PEEK_SIZE, group.count));
        for (const card of group.models) {
          expect(mode === "tag" ? card.allTags.includes(group.key as never) : card.author === group.key).toBe(true);
        }
      }
    }
    expect(peekGroups(catalog, "tag").every((group) => (PEEK_TAGS as readonly string[]).includes(group.key))).toBe(true);
    const authors = peekGroups(catalog, "author").map((group) => group.count);
    expect(authors).toEqual(authors.toSorted((a, b) => b - a));
  });

  it("cada grupo abre el catálogo con su filtro", () => {
    expect(groupHref("es", "tag", "coding")).toBe("/es/models?tags=coding");
    expect(groupHref("en", "author", "meta-llama")).toBe("/en/models?author=meta-llama");
  });
});

describe("modelos destacados", () => {
  it("los modelos que nombran las páginas existen en el catálogo del repo", () => {
    const ids = new Set(getCatalog().map((m) => m.id));
    for (const id of [...PRICE_STRIP_MODELS, ...ESTIMATOR_MODELS, ...USAGE_TABLE_MODELS]) expect(ids, id).toContain(id);
  });
});

describe("preguntas frecuentes", () => {
  it("cada pregunta del diccionario está en un tema, una sola vez", () => {
    const listed = FAQ_TOPICS.flatMap((topic) => topic.items);
    expect(listed.toSorted()).toEqual(Object.keys(en.faq.items).toSorted());
    expect(FAQ_TOPICS.map((topic) => topic.id).toSorted()).toEqual(Object.keys(en.faq.topics).toSorted());
  });

  it("la landing y /pricing solo nombran preguntas que existen", () => {
    for (const id of [...HOME_FAQ, ...PRICING_FAQ]) expect(en.faq.items).toHaveProperty(id);
  });
});

describe("constantes que repiten las de otro módulo", () => {
  it("el depósito mínimo es el de los depósitos en USDC", () => {
    expect(BigInt(MIN_DEPOSIT_MICRO_USD)).toBe(DEPOSIT_MINIMUM);
  });

  it("el tope del excedente es el default de la base", () => {
    const schema = readFileSync(join(process.cwd(), "src/lib/db/schema.ts"), "utf8");
    expect(schema).toContain(`overflow_cap_micro_usd", { mode: "bigint" }).notNull().default(sql\`${DEFAULT_OVERFLOW_CAP_MICRO_USD}\`)`);
  });
});
