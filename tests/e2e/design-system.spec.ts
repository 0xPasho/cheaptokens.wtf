import { expect, test } from "@playwright/test";

import { axeScan, openDesignSystem, sectionTitles, settled, slug, THEMES } from "./helpers";

/**
 * Cada componente de /design-system en un navegador real, en los dos temas:
 * accesibilidad y contraste con axe, y una captura de referencia por sección.
 */

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test("el tema se aplica antes del primer paint (sin flash)", async ({ page }) => {
      // Registra la clase de <html> en cuanto existe <body>: el script de <head> ya corrió
      // y React todavía no hidrata.
      await page.addInitScript(() => {
        new MutationObserver((_, observer) => {
          if (document.body) {
            (window as unknown as { __darkAtBody: boolean }).__darkAtBody =
              document.documentElement.classList.contains("dark");
            observer.disconnect();
          }
        }).observe(document, { childList: true, subtree: true });
      });
      await openDesignSystem(page, theme);
      const darkAtBody = await page.evaluate(
        () => (window as unknown as { __darkAtBody: boolean }).__darkAtBody,
      );
      expect(darkAtBody).toBe(theme === "dark");
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    });

    test("cada sección pasa axe (WCAG 2.1 AA, incluido contraste)", async ({ page }) => {
      await openDesignSystem(page, theme);
      const titles = await sectionTitles(page);
      expect(titles.length).toBeGreaterThan(15);

      for (const title of titles) {
        await test.step(title, async () => {
          const { violations } = await axeScan(page, `[data-section="${title}"]`);
          expect.soft(violations, `${theme} · ${title}`).toEqual([]);
        });
      }
    });

    test("captura de referencia por sección", async ({ page }) => {
      await openDesignSystem(page, theme);
      for (const title of await sectionTitles(page)) {
        await test.step(title, async () => {
          const section = page.locator(`[data-section="${title}"]`);
          await section.scrollIntoViewIfNeeded();
          await expect.soft(section).toHaveScreenshot(`${theme}-${slug(title)}.png`);
        });
      }
    });
  });
}

test.describe("interacción", () => {
  test("la página carga sin errores ni advertencias en consola", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") messages.push(msg.text());
    });
    page.on("pageerror", (error) => messages.push(error.message));
    await openDesignSystem(page, "light");
    await page.waitForLoadState("networkidle");
    expect(messages).toEqual([]);
  });

  test("el selector de tema cambia el tema y lo recuerda al recargar", async ({ page }) => {
    // Sin openDesignSystem: su initScript volvería a guardar "light" en cada recarga.
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/es/design-system");
    await page.getByRole("button", { name: "Tema" }).click();
    await page.getByRole("menuitemradio", { name: "Oscuro" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("menu")).toBeHidden();

    // Recargar sin initScript: la preferencia sale de localStorage.
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("el código Konami activa y desactiva el modo retro", async ({ page }) => {
    await openDesignSystem(page, "light");
    await expect(page.locator("html")).not.toHaveClass(/retro-party/);

    for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a", "Enter"]) {
      await page.keyboard.press(key);
    }
    await expect(page.locator("html")).toHaveClass(/retro-party/);
    await expect(page.locator(".retro-banner")).toContainText("Modo retro activado");

    // Recargar conserva el modo (y no hay flash: el script de arranque lo aplica).
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/retro-party/);

    for (const key of ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a", "Enter"]) {
      await page.keyboard.press(key);
    }
    await expect(page.locator("html")).not.toHaveClass(/retro-party/);
  });

  test("diálogo de key nueva: foco adentro, overlay del token, Escape cierra y devuelve el foco", async ({ page }) => {
    await openDesignSystem(page, "light");
    const trigger = page
      .locator('[data-section="API keys"]')
      .getByRole("button", { name: "Crear key" });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Tu nueva API key" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);

    const overlayColor = await page
      .locator('[data-slot="dialog-overlay"]')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(overlayColor).toMatch(/0\.1\)$|\/ 0\.1\)$/);

    // El diálogo cabe en la pantalla.
    await settled(dialog);
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("copiar la key la deja en el portapapeles y lo confirma", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDesignSystem(page, "light");
    await page
      .locator('[data-section="API keys"]')
      .getByRole("button", { name: "Crear key" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Tu nueva API key" });
    const key = await dialog.getByRole("textbox", { name: "API key" }).inputValue();
    await dialog.locator('[data-slot="input-group"]').getByRole("button", { name: "Copiar" }).click();

    await expect(
      dialog.locator('[data-slot="input-group"]').getByRole("button", { name: "Copiado" }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key);
  });

  test("revocar pide confirmación y la acción repite el verbo", async ({ page }) => {
    await openDesignSystem(page, "light");
    const trigger = page
      .locator('[data-section="API keys"]')
      .getByRole("button", { name: "Revocar" });
    await trigger.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Revocar key" })).toBeVisible();
    await dialog.getByRole("button", { name: "Revocar key" }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("con movimiento reducido no hay transiciones ni animaciones", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDesignSystem(page, "light");
    const durations = await page
      .locator('[data-section="Button"] [data-slot="button"]')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return [style.transitionDuration, style.animationDuration];
      });
    for (const duration of durations) {
      expect(parseFloat(duration)).toBeLessThan(0.001);
    }
  });

  test("el foco con teclado es visible en botones y links", async ({ page }) => {
    await openDesignSystem(page, "light");
    const link = page.getByRole("navigation", { name: "Secciones" }).getByRole("link").first();
    await link.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const ring = await link.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).not.toBe("none");
  });

  test("el slider muestra su valor formateado y se mueve con teclado", async ({ page }) => {
    await openDesignSystem(page, "light");
    const section = page.locator('[data-section="Switch · Slider · RadioGroup · Checkbox · Toggle"]');
    const slider = section.getByRole("slider");
    await slider.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(section.getByText(/^4\s?US\$$/)).toBeVisible();
  });

  test("el precio por token se ve al enfocar el precio con teclado", async ({ page }) => {
    await openDesignSystem(page, "light");
    const section = page.locator('[data-section="Tooltip · Kbd"]');
    await section.getByRole("button", { name: /0,30/ }).focus();
    await expect(page.getByText(/0,0000003\s?US\$ por token/)).toBeVisible();
  });
});
