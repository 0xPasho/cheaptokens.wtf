// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  composite,
  contrast,
  inSrgbGamut,
  readThemeTokens,
  toSrgb,
} from "../helpers/color";

/**
 * Los pares de color de docs/13 › Contraste medido, recalculados desde globals.css.
 * Si alguien cambia un token y el par baja de AA (4.5:1), esta prueba falla.
 */
const AA = 4.5;
const tokens = readThemeTokens();

// Tinte del fondo de los badges y botones de color, por tema (las clases bg-X/10 y dark:bg-X/20).
const TINT = { light: 0.1, dark: 0.2 } as const;
// Tinte en hover de Button destructive (hover:bg-destructive/20 y dark:hover:bg-destructive/30).
const HOVER_TINT = { light: 0.2, dark: 0.3 } as const;

describe.each(["light", "dark"] as const)("tokens de color · %s", (theme) => {
  const t = tokens[theme];
  const bg = toSrgb(t.background);

  it("define todos los tokens semánticos que usa la interfaz", () => {
    for (const name of [
      "background",
      "foreground",
      "card",
      "muted",
      "muted-foreground",
      "primary",
      "primary-foreground",
      "border",
      "ring",
      "destructive",
      "success",
      "success-foreground",
      "warning",
      "warning-foreground",
      "overlay",
    ]) {
      expect(t[name], `falta --${name}`).toBeDefined();
    }
  });

  it("el texto principal y el secundario pasan AA sobre el fondo y sobre muted", () => {
    expect(contrast(toSrgb(t.foreground), bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(toSrgb(t["muted-foreground"]), bg)).toBeGreaterThanOrEqual(AA);
    // Avatar, Kbd y los fondos sutiles ponen muted-foreground sobre muted.
    expect(
      contrast(toSrgb(t["muted-foreground"]), toSrgb(t.muted)),
    ).toBeGreaterThanOrEqual(AA);
    expect(
      contrast(toSrgb(t["card-foreground"]), toSrgb(t.card)),
    ).toBeGreaterThanOrEqual(7);
  });

  it("primary-foreground pasa AA sobre primary (botón default)", () => {
    expect(
      contrast(toSrgb(t["primary-foreground"]), toSrgb(t.primary)),
    ).toBeGreaterThanOrEqual(AA);
  });

  it.each(["success", "warning", "destructive"])(
    "%s pasa AA sobre el fondo y sobre su propio tinte",
    (name) => {
      const color = t[name];
      expect(contrast(toSrgb(color), bg)).toBeGreaterThanOrEqual(AA);
      expect(
        contrast(toSrgb(color), composite(color, TINT[theme], bg)),
        `${name} sobre ${name}/${TINT[theme] * 100}`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it("destructive pasa AA en hover sobre el fondo de la página", () => {
    const color = t.destructive;
    expect(
      contrast(toSrgb(color), composite(color, HOVER_TINT[theme], bg)),
    ).toBeGreaterThanOrEqual(AA);
  });

  // Superficies donde viven badges y botones de color: la card y su pie (bg-muted/50 sobre card).
  const card = toSrgb(t.card);
  const cardFooter = composite(t.muted, 0.5, card);

  it("los tintes de color pasan AA en reposo sobre una card y sobre su pie", () => {
    for (const name of ["success", "warning", "destructive"]) {
      for (const [surface, rgb] of [["card", card], ["pie de card", cardFooter]] as const) {
        expect(
          contrast(toSrgb(t[name]), composite(t[name], TINT[theme], rgb)),
          `${name} sobre ${surface}`,
        ).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("excepción conocida: hover destructive sobre una card no baja de 3.8:1", () => {
    // docs/13 › Contraste medido: en reposo pasa AA; solo el hover sobre card queda debajo.
    // Si mejora, actualiza el doc y endurece esta prueba.
    const color = t.destructive;
    for (const rgb of [card, cardFooter]) {
      const ratio = contrast(toSrgb(color), composite(color, HOVER_TINT[theme], rgb));
      expect(ratio).toBeGreaterThanOrEqual(3.8);
    }
  });

  it.each(["success", "warning"])(
    "%s-foreground pasa AA sobre %s sólido",
    (name) => {
      expect(
        contrast(toSrgb(t[`${name}-foreground`]), toSrgb(t[name])),
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it("los tokens propios caben en sRGB (no dependen del recorte del navegador)", () => {
    for (const name of ["success", "warning", "destructive"]) {
      expect(inSrgbGamut(t[name]), name).toBe(true);
    }
  });

  it("success, warning y destructive son tonos distintos (≥ 15° entre sí)", () => {
    const hues = ["success", "warning", "destructive"].map((n) => t[n].h);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const diff = Math.abs(hues[i] - hues[j]) % 360;
        expect(Math.min(diff, 360 - diff)).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it("el overlay es negro translúcido y más denso en oscuro", () => {
    expect(t.overlay.l).toBe(0);
    expect(t.overlay.alpha).toBeGreaterThan(0);
    expect(t.overlay.alpha).toBeLessThan(1);
    if (theme === "dark") {
      expect(t.overlay.alpha).toBeGreaterThan(tokens.light.overlay.alpha);
    }
  });
});
