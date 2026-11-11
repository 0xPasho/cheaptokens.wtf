import { describe, expect, it } from "vitest";

import {
  formatCount,
  formatDate,
  formatDiscount,
  formatTokens,
  formatUsd,
} from "@/lib/format";

// Intl usa espacios no separables (U+00A0, U+202F). Se normalizan para comparar.
const plain = (text: string) => text.replace(/[  ]/g, " ");
const MINUS = "−";

describe("formatUsd", () => {
  it.each([
    ["balance", 12_345_678, "$12.35", "12,35 US$"],
    ["price", 75_000, "$0.075", "0,075 US$"],
    ["price", 3_000_000, "$3.00", "3,00 US$"],
    ["cost", 1_350, "$0.00135", "0,00135 US$"],
    ["whole", 10_000_000, "$10", "10 US$"],
    ["token", 0.3, "$0.0000003", "0,0000003 US$"],
  ] as const)("%s: %d µUSD → %s / %s", (kind, micros, en, es) => {
    expect(plain(formatUsd(micros, "en", kind))).toBe(en);
    expect(plain(formatUsd(micros, "es", kind))).toBe(es);
  });

  it("usa balance por default", () => {
    expect(formatUsd(1_000_000, "en")).toBe("$1.00");
  });

  it("los negativos llevan el signo menos tipográfico, no el guion", () => {
    expect(formatUsd(-120_000, "en")).toBe(`${MINUS}$0.12`);
    expect(plain(formatUsd(-120_000, "es"))).toBe(`${MINUS}0,12 US$`);
    expect(formatUsd(-120_000, "en")).not.toContain("-");
  });

  it("el precio por 1M nunca muestra más de 4 decimales", () => {
    expect(formatUsd(123_456, "en", "price")).toBe("$0.1235");
  });

  it("el costo de un request conserva la precisión de 1 µUSD", () => {
    expect(formatUsd(1, "en", "cost")).toBe("$0.000001");
  });
});

describe("formatDiscount", () => {
  it.each([
    [9000, `${MINUS}90%`, `${MINUS}90 %`],
    [8750, `${MINUS}87.5%`, `${MINUS}87,5 %`],
    [0, "0%", "0 %"],
  ])("%d bps → %s / %s", (bps, en, es) => {
    expect(plain(formatDiscount(bps, "en"))).toBe(en);
    expect(plain(formatDiscount(bps, "es"))).toBe(es);
  });
});

describe("formatTokens y formatCount", () => {
  it("compacta el contexto según el idioma", () => {
    expect(formatTokens(200_000, "en")).toBe("200K");
    expect(plain(formatTokens(200_000, "es"))).toBe("200 mil");
    expect(formatTokens(1_048_576, "en")).toBe("1M");
  });

  it("los conteos exactos usan el separador del idioma", () => {
    expect(formatCount(12_481, "en")).toBe("12,481");
    expect(formatCount(12_481, "es")).toBe("12.481");
  });
});

describe("formatDate", () => {
  it("formatea en UTC para que servidor y navegador coincidan", () => {
    expect(formatDate("2026-11-08", "en")).toBe("Nov 8, 2026");
    expect(formatDate("2026-11-08", "es")).toBe("8 nov 2026");
    // Una hora que en América sería el día anterior sigue siendo el 8 en UTC.
    expect(formatDate("2026-11-08T02:00:00Z", "en")).toBe("Nov 8, 2026");
  });
});
