import { expect, type Page, test } from "@playwright/test";

import { axeScan, openDesignSystem, settled, THEMES } from "./helpers";

/**
 * Liquid glass en Chrome real (docs/13 › Material): el desenfoque se aplica, cada
 * componente se lee sobre el peor fondo y el vidrio se vuelve opaco cuando la persona
 * pide menos transparencia o más contraste.
 */

type GlassStyle = { blur: string; alpha: number };

/** backdrop-filter y opacidad del fondo calculados por el navegador. */
async function glassStyle(page: Page, selector: string): Promise<GlassStyle> {
  return page.locator(selector).first().evaluate((el) => {
    const style = getComputedStyle(el);
    const bg = style.backgroundColor;
    const slash = bg.match(/\/\s*([\d.]+)\)$/);
    const rgba = bg.match(/^rgba\([^)]*,\s*([\d.]+)\)$/);
    const alpha = slash ? Number(slash[1]) : rgba ? Number(rgba[1]) : 1;
    return {
      blur: style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter"),
      alpha,
    };
  });
}

/** Emula una preferencia del sistema que Playwright todavía no expone (vía Chrome DevTools Protocol). */
async function emulate(page: Page, name: string, value: string) {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setEmulatedMedia", { features: [{ name, value }] });
}

const PANEL = '[data-glass-backdrop="worst"] .glass-surface';

for (const theme of THEMES) {
  test.describe(`vidrio · ${theme}`, () => {
    test("glass-surface desenfoca y deja ver el fondo", async ({ page }) => {
      await openDesignSystem(page, theme);
      const { blur, alpha } = await glassStyle(page, PANEL);
      expect(blur).toContain("blur(24px)");
      expect(blur).toContain("saturate(1.8)");
      expect(alpha).toBeGreaterThan(0.5);
      expect(alpha).toBeLessThan(1);
    });

    test("cada componente sobre vidrio pasa axe con el peor fondo detrás", async ({ page }) => {
      await openDesignSystem(page, theme);
      for (const backdrop of ["worst", "background"]) {
        const { violations } = await axeScan(page, `[data-glass-backdrop="${backdrop}"]`);
        expect.soft(violations, `${theme} · ${backdrop}`).toEqual([]);
      }
    });

    test("con transparencia reducida el vidrio es opaco y sin desenfoque", async ({ page }) => {
      await emulate(page, "prefers-reduced-transparency", "reduce");
      await openDesignSystem(page, theme);
      const { blur, alpha } = await glassStyle(page, PANEL);
      expect(blur).toBe("none");
      expect(alpha).toBe(1);
      await expect(page.locator('[data-section="Vidrio sobre textura"]')).toHaveScreenshot(
        `${theme}-vidrio-transparencia-reducida.png`,
      );
    });

    test("con transparencia reducida el marco del diálogo también es opaco", async ({ page }) => {
      await emulate(page, "prefers-reduced-transparency", "reduce");
      await openDesignSystem(page, theme);
      await page
        .locator('[data-section="API keys"]')
        .getByRole("button", { name: "Crear key" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Tu nueva API key" });
      await expect(dialog).toBeVisible();
      await settled(dialog);
      const frame = await glassStyle(page, '[role="dialog"]');
      expect(frame.blur).toBe("none");
      expect(frame.alpha).toBe(1);
    });

    test("con más contraste el vidrio es opaco y sin desenfoque", async ({ page }) => {
      await emulate(page, "prefers-contrast", "more");
      await openDesignSystem(page, theme);
      const { blur, alpha } = await glassStyle(page, PANEL);
      expect(blur).toBe("none");
      expect(alpha).toBe(1);
    });

    test("el anillo de foco se ve sobre los controles de vidrio", async ({ page }) => {
      await openDesignSystem(page, theme);
      // glass-* usa box-shadow, igual que ring-*: el foco tiene que ganar.
      const targets = [
        page.locator('[data-section="Field · Input · InputGroup · Label"]').getByRole("textbox", { name: "Nombre de la key" }),
        page.locator('[data-section="Button"]').getByRole("button", { name: "Cancelar" }),
        page.locator('[data-section="Switch · Slider · RadioGroup · Checkbox · Toggle"]').getByRole("switch"),
        page.locator('[data-section="Switch · Slider · RadioGroup · Checkbox · Toggle"]').getByRole("checkbox"),
      ];
      // El foco del slider cae en un <input> dentro de la perilla: el anillo se mide en la perilla.
      const sliderInput = page
        .locator('[data-section="Switch · Slider · RadioGroup · Checkbox · Toggle"]')
        .getByRole("slider");
      const sliderThumb = page
        .locator('[data-section="Switch · Slider · RadioGroup · Checkbox · Toggle"] [data-slot="slider-thumb"]');
      const checks = [...targets.map((t) => ({ focus: t, ring: t })), { focus: sliderInput, ring: sliderThumb }];
      for (const { focus, ring: target } of checks) {
        await focus.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        // El anillo es de 3 px (ring-3) en el color ring/50: aparece como "0px 0px 0px 3px".
        // Chrome lo pinta un frame después del Tab, así que se espera (máximo 1 s).
        await expect
          .poll(() => target.evaluate((el) => getComputedStyle(el).boxShadow), {
            message: await target.evaluate((el) => el.outerHTML.slice(0, 60)),
            timeout: 1000,
          })
          .toContain("0px 0px 0px 3px");
      }
    });

    test("el menú desplegable abierto es vidrio esmerilado (ref 9)", async ({ page }) => {
      await openDesignSystem(page, theme);
      await page.getByRole("button", { name: "Tema" }).click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await settled(menu);
      const { blur, alpha } = await glassStyle(page, '[role="menu"]');
      expect(blur).toContain("blur(24px)");
      expect(alpha).toBeLessThan(1);
      const { violations } = await axeScan(page, '[role="menu"]');
      expect(violations).toEqual([]);
    });

    test("el diálogo tiene marco de vidrio y panel opaco (refs 5, 10, 11)", async ({ page }) => {
      await openDesignSystem(page, theme);
      await page
        .locator('[data-section="API keys"]')
        .getByRole("button", { name: "Crear key" })
        .click();
      const dialog = page.getByRole("dialog", { name: "Tu nueva API key" });
      await expect(dialog).toBeVisible();
      await settled(dialog);

      const frame = await glassStyle(page, '[role="dialog"]');
      expect(frame.blur).toContain("blur(24px)");
      expect(frame.alpha).toBeLessThan(1);

      const panel = await glassStyle(page, '[data-slot="dialog-panel"]');
      expect(panel.alpha).toBe(1);

      const { violations } = await axeScan(page, '[role="dialog"]');
      expect(violations).toEqual([]);
      await expect(dialog).toHaveScreenshot(`${theme}-dialogo-marco-doble.png`);
    });
  });
}
