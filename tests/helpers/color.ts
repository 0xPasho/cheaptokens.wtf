import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Un color OKLCH con alfa opcional (0–1). */
export type Oklch = { l: number; c: number; h: number; alpha: number };
type Rgb = [number, number, number];

const GLOBALS_CSS = join(process.cwd(), "src/app/globals.css");

/** Lee las variables de `:root` (claro) y `.dark` (oscuro) de globals.css. */
export function readThemeTokens(): Record<"light" | "dark", Record<string, Oklch>> {
  const css = readFileSync(GLOBALS_CSS, "utf8");
  const block = (selector: string) => {
    const match = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`No encontré el bloque ${selector} en globals.css`);
    const tokens: Record<string, Oklch> = {};
    for (const [, name, value] of match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      const color = parseOklch(value);
      if (color) tokens[name] = color;
    }
    return tokens;
  };
  return { light: block(":root"), dark: block("\\.dark") };
}

export function parseOklch(value: string): Oklch | null {
  const match = value
    .trim()
    .match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/);
  if (!match) return null;
  const [, l, c, h, a, percent] = match;
  const alpha = a === undefined ? 1 : Number(a) / (percent ? 100 : 1);
  return { l: Number(l), c: Number(c), h: Number(h), alpha };
}

function toLinearSrgb({ l, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const encode = (x: number) => {
  const v = Math.min(Math.max(x, 0), 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};
const decode = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

/** El color en sRGB codificado (0–1), recortado al gamut como hace el navegador. */
export function toSrgb(color: Oklch): Rgb {
  return toLinearSrgb(color).map(encode) as Rgb;
}

export function inSrgbGamut(color: Oklch): boolean {
  return toLinearSrgb(color).every((x) => x >= -1e-4 && x <= 1 + 1e-4);
}

/** Pinta `top` con opacidad `alpha` sobre `bottom`, en sRGB como el navegador. */
export function composite(top: Oklch, alpha: number, bottom: Rgb): Rgb {
  const fg = toSrgb(top);
  return fg.map((x, i) => alpha * x + (1 - alpha) * bottom[i]) as Rgb;
}

function luminance([r, g, b]: Rgb) {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b);
}

/** Contraste WCAG 2 entre dos colores sRGB. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
