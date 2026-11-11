import { describe, expect, it } from "vitest";

import { applyDiscount } from "@/lib/catalog/pricing";
import { MODEL_TAGS } from "@/lib/catalog/tags";

describe("applyDiscount (ADR-0010)", () => {
  it("aplica el descuento en puntos base", () => {
    expect(applyDiscount(3_000_000, 9000)).toBe(300_000);
    expect(applyDiscount(15_000_000, 9000)).toBe(1_500_000);
    expect(applyDiscount(2_500_000, 8500)).toBe(375_000);
  });

  it("redondea al µUSD más cercano", () => {
    expect(applyDiscount(300_000, 8500)).toBe(45_000);
    expect(applyDiscount(1, 5000)).toBe(1);
    expect(applyDiscount(3, 9000)).toBe(0);
  });

  it("0 bps deja el precio oficial y 10000 bps lo vuelve 0", () => {
    expect(applyDiscount(1_000_000, 0)).toBe(1_000_000);
    expect(applyDiscount(1_000_000, 10_000)).toBe(0);
  });
});

describe("MODEL_TAGS (ADR-0011)", () => {
  it("es la lista fija de 8 tags de docs/06", () => {
    expect(MODEL_TAGS).toEqual([
      "fast",
      "reasoning",
      "coding",
      "vision",
      "tools",
      "open-weights",
      "long-context",
      "cheap",
    ]);
  });
});
