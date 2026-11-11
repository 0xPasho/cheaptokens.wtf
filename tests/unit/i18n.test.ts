// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hasLocale, LOCALES, negotiateLocale, switchLocalePath } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/dictionaries/en";
import { es } from "@/lib/i18n/dictionaries/es";
import { plural, t } from "@/lib/i18n/dictionaries";

function keys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => keys(item, `${prefix}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe("diccionarios", () => {
  it("es tiene exactamente las mismas claves que en", () => {
    expect(keys(es).sort()).toEqual(keys(en).sort());
  });

  it("ningún texto está vacío y los marcadores {x} coinciden entre idiomas", () => {
    const enMap = new Map(keys(en).map((k) => [k, k]));
    const get = (dict: unknown, path: string) =>
      path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], dict);
    for (const path of enMap.keys()) {
      const a = String(get(en, path));
      const b = String(get(es, path));
      expect(a.trim(), path).not.toBe("");
      expect(b.trim(), path).not.toBe("");
      expect(b.match(/\{\w+\}/g)?.sort() ?? [], path).toEqual(a.match(/\{\w+\}/g)?.sort() ?? []);
    }
  });

  it("t rellena marcadores y plural sigue las reglas del idioma", () => {
    expect(t("Ver los {count} modelos", { count: "10" })).toBe("Ver los 10 modelos");
    expect(plural("es", 1, "uno", "otros")).toBe("uno");
    expect(plural("en", 2, "one", "other")).toBe("other");
  });
});

describe("negociación de idioma (proxy)", () => {
  it("la cookie gana sobre Accept-Language", () => {
    expect(negotiateLocale({ cookie: "es", acceptLanguage: "en-US,en;q=0.9" })).toBe("es");
  });

  it("usa el mejor match de Accept-Language", () => {
    expect(negotiateLocale({ acceptLanguage: "es-MX,es;q=0.9,en;q=0.5" })).toBe("es");
    expect(negotiateLocale({ acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.5" })).toBe("en");
  });

  it("sin datos o con datos inválidos, en", () => {
    expect(negotiateLocale({})).toBe("en");
    expect(negotiateLocale({ cookie: "fr", acceptLanguage: "%%%" })).toBe("en");
  });

  it("solo en y es son idiomas", () => {
    expect(LOCALES).toEqual(["en", "es"]);
    expect(hasLocale("es")).toBe(true);
    expect(hasLocale("design-system")).toBe(false);
  });

  it("switchLocalePath cambia solo el prefijo", () => {
    expect(switchLocalePath("/es/models/anthropic/claude-haiku-4.5", "en")).toBe("/en/models/anthropic/claude-haiku-4.5");
    expect(switchLocalePath("/es", "en")).toBe("/en");
    expect(switchLocalePath("/models", "es")).toBe("/es/models");
  });
});
