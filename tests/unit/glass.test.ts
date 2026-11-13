// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, readThemeTokens, toSrgb } from "../helpers/color";

const themes = readThemeTokens();
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

// The NibbleRouter material is opaque. Contrast is measured against its actual
// surfaces, rather than the removed translucent glass over arbitrary backdrops.
describe.each(["light", "dark"] as const)("flat materials · %s", (theme) => {
  const tokens = themes[theme];
  it.each(["background", "card", "popover", "secondary", "muted"])("body and secondary text pass AA on %s", (surface) => {
    const background = toSrgb(tokens[surface]);
    expect(contrast(toSrgb(tokens.foreground), background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(toSrgb(tokens["muted-foreground"]), background)).toBeGreaterThanOrEqual(4.5);
  });
  it("the primary action retains readable text", () => {
    expect(contrast(toSrgb(tokens.primary), toSrgb(tokens["primary-foreground"]))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("material accessibility", () => {
  it("shared compatibility utilities no longer add blur, gradients or ornamental shadows", () => {
    for (const name of ["glass-surface", "glass-bezel", "glass-control", "glass-prominent", "glass-raised", "glass-edge"]) {
      const body = css.match(new RegExp(`@utility ${name}\\s*\\{([^}]+)\\}`))?.[1];
      expect(body, name).toBeDefined();
      expect(body).not.toMatch(/backdrop-filter|linear-gradient|radial-gradient|inset/);
    }
  });
  it("reduced motion still disables animated transitions", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toContain("transition-duration: 0.01ms !important");
  });
});
