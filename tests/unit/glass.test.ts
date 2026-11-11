// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { composite, contrast, readThemeTokens, toSrgb } from "../helpers/color";

/**
 * Liquid glass (docs/13 › Material). El vidrio depende de lo que tiene detrás, así que cada
 * nivel se mide contra el peor caso: el color opuesto al tema detrás del vidrio.
 * El desenfoque promedia el fondo; un fondo liso es el caso más exigente.
 */
const AA = 4.5;
const tokens = readThemeTokens();
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

const WHITE = [1, 1, 1] as [number, number, number];
const BLACK = [0, 0, 0] as [number, number, number];

describe.each(["light", "dark"] as const)("vidrio · %s", (theme) => {
  const t = tokens[theme];
  const bg = toSrgb(t.background);
  const card = toSrgb(t.card);
  const worst = theme === "dark" ? WHITE : BLACK;
  const glass = (backdrop: [number, number, number]) =>
    composite(t["glass-surface"], t["glass-surface"].alpha, backdrop);
  const control = (surface: [number, number, number]) =>
    composite(t["glass-control"], t["glass-control"].alpha, surface);

  it("glass-surface: texto principal y secundario pasan AA con el peor fondo detrás", () => {
    for (const backdrop of [worst, bg, card]) {
      expect(contrast(toSrgb(t.foreground), glass(backdrop))).toBeGreaterThanOrEqual(AA);
      expect(contrast(toSrgb(t["muted-foreground"]), glass(backdrop))).toBeGreaterThanOrEqual(AA);
      expect(contrast(toSrgb(t["popover-foreground"]), glass(backdrop))).toBeGreaterThanOrEqual(AA);
    }
  });

  it("glass-control: el texto pasa AA sobre el fondo, una card y una superficie de vidrio", () => {
    for (const surface of [bg, card, glass(worst), glass(bg)]) {
      expect(contrast(toSrgb(t.foreground), control(surface))).toBeGreaterThanOrEqual(AA);
    }
    // El placeholder de un input (muted-foreground) sobre el fondo, una card y un panel de vidrio
    // con el peor fondo detrás. axe ignora los placeholders, así que este par solo se mide aquí.
    for (const surface of [bg, card, glass(worst)]) {
      expect(contrast(toSrgb(t["muted-foreground"]), control(surface))).toBeGreaterThanOrEqual(AA);
    }
  });

  it("pestaña inactiva (foreground al 70%) sobre la pista de vidrio con el peor fondo", () => {
    const track = control(glass(worst));
    const inactive = composite(t.foreground, 0.7, track);
    expect(contrast(inactive, track)).toBeGreaterThanOrEqual(AA);
  });

  it("glass-prominent: el texto de la acción principal pasa AA en todo el degradado", () => {
    const text = toSrgb(t["primary-foreground"]);
    expect(contrast(text, toSrgb(t["prominent-top"]))).toBeGreaterThanOrEqual(AA);
    expect(contrast(text, toSrgb(t["prominent-bottom"]))).toBeGreaterThanOrEqual(AA);
  });

  it("glass-raised: la opción activa de un segmentado pasa AA sobre su pista", () => {
    const track = control(bg);
    for (const stop of ["raised-top", "raised-bottom"]) {
      const raised = composite(t[stop], t[stop].alpha, track);
      expect(contrast(toSrgb(t.foreground), raised), stop).toBeGreaterThanOrEqual(AA);
    }
  });

  it("el resplandor ambiental no le quita AA al texto del fondo", () => {
    const glow = composite(t["ambient-glow"], t["ambient-glow"].alpha, bg);
    expect(contrast(toSrgb(t.foreground), glow)).toBeGreaterThanOrEqual(7);
    expect(contrast(toSrgb(t["muted-foreground"]), glow)).toBeGreaterThanOrEqual(AA);
  });

  describe("controles: el indicador se distingue (WCAG 1.4.11, 3:1)", () => {
    const UI = 3;
    const track = composite(t.input, t.input.alpha, bg);

    it("Switch apagado: la perilla contra la pista hundida", () => {
      const knob = theme === "dark" ? t.foreground : t["muted-foreground"];
      expect(contrast(toSrgb(knob), track)).toBeGreaterThanOrEqual(UI);
    });

    it("Switch encendido: la perilla contra la píldora prominente", () => {
      const knob = toSrgb(t["primary-foreground"]);
      for (const stop of ["prominent-top", "prominent-bottom"]) {
        expect(contrast(knob, toSrgb(t[stop])), stop).toBeGreaterThanOrEqual(UI);
      }
    });

    it("Checkbox y Radio: el borde sin marcar contra el fondo y una card", () => {
      for (const surface of [bg, card]) {
        const border = composite(t["muted-foreground"], 0.8, surface);
        expect(contrast(border, surface)).toBeGreaterThanOrEqual(UI);
      }
    });

    it("Checkbox y Radio marcados: la marca contra la píldora prominente", () => {
      const mark = toSrgb(t["primary-foreground"]);
      expect(contrast(mark, toSrgb(t["prominent-top"]))).toBeGreaterThanOrEqual(AA);
      expect(contrast(mark, toSrgb(t["prominent-bottom"]))).toBeGreaterThanOrEqual(AA);
    });

    it("Slider y Progress: el relleno contra la pista hundida", () => {
      expect(contrast(toSrgb(t.primary), track)).toBeGreaterThanOrEqual(UI);
    });

    it("Slider: el borde de la perilla contra el fondo", () => {
      const border = composite(t["muted-foreground"], 0.8, bg);
      expect(contrast(border, bg)).toBeGreaterThanOrEqual(UI);
    });
  });

  it("el vidrio es translúcido de verdad, pero la superficie es más opaca que el control", () => {
    expect(t["glass-surface"].alpha).toBeLessThan(1);
    expect(t["glass-control"].alpha).toBeLessThan(t["glass-surface"].alpha);
    expect(t["glass-control-hover"].alpha).toBeGreaterThan(t["glass-control"].alpha);
  });
});

describe("vidrio · alternativas de accesibilidad en globals.css", () => {
  const block = (header: RegExp) => {
    const start = css.search(header);
    expect(start, `falta ${header}`).toBeGreaterThan(-1);
    // Hasta el cierre del bloque: el siguiente "}" que empieza una línea.
    return css.slice(start, css.indexOf("\n}", start));
  };

  it("con prefers-reduced-transparency el vidrio se vuelve opaco y sin desenfoque", () => {
    const reduce = block(/@media \(prefers-reduced-transparency: reduce\)/);
    expect(reduce).toMatch(/--glass-surface:\s*var\(--popover\)/);
    expect(reduce).toMatch(/--glass-bezel:\s*var\(--muted\)/);
    expect(reduce).toMatch(/--glass-blur:\s*none/);
  });

  it("con prefers-contrast: more el vidrio es opaco, sin brillos y con bordes marcados", () => {
    const more = block(/@media \(prefers-contrast: more\)/);
    expect(more).toMatch(/--glass-surface:\s*var\(--popover\)/);
    expect(more).toMatch(/--glass-highlight:\s*transparent/);
    expect(more).toMatch(/--glass-border:\s*oklch\(0 0 0 \/ 55%\)/);
    expect(more).toMatch(/:root\.dark[\s\S]*--glass-border:\s*oklch\(1 0 0 \/ 55%\)/);
  });

  it("con prefers-reduced-motion no hay transiciones ni animaciones", () => {
    const motion = block(/@media \(prefers-reduced-motion: reduce\)/);
    expect(motion).toMatch(/transition-duration:\s*0\.01ms !important/);
    expect(motion).toMatch(/animation-duration:\s*0\.01ms !important/);
  });

  it("sin soporte de backdrop-filter las superficies son opacas", () => {
    const fallback = block(/@supports not \(\(backdrop-filter: blur\(1px\)\)/);
    expect(fallback).toMatch(/--glass-surface:\s*var\(--popover\)/);
    expect(fallback).toMatch(/--glass-bezel:\s*var\(--muted\)/);
  });

  it.each(["glass-surface", "glass-bezel"])("%s usa backdrop-filter con prefijo -webkit- (Safari)", (name) => {
    const utility = block(new RegExp(`@utility ${name} \\{`));
    expect(utility).toContain("-webkit-backdrop-filter: var(--glass-blur)");
    expect(utility).toContain("backdrop-filter: var(--glass-blur)");
  });

  it("los niveles de vidrio solo usan tokens, sin colores sueltos", () => {
    for (const name of ["glass-surface", "glass-bezel", "glass-track", "glass-knob", "glass-control", "glass-prominent", "glass-raised", "glass-edge", "glass-glow"]) {
      const utility = block(new RegExp(`@utility ${name} \\{`));
      expect(utility, name).not.toMatch(/oklch\(|#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });
});
