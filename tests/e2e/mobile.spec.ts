import { expect, test } from "@playwright/test";

import { axeScan, openDesignSystem, settled, THEMES } from "./helpers";

/** /design-system en un teléfono (Pixel 7, 412 px de ancho). */

for (const theme of THEMES) {
  test(`móvil · ${theme}: nada se sale de la pantalla y pasa axe`, async ({ page }) => {
    await openDesignSystem(page, theme);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "la página no debe desplazarse en horizontal").toBeLessThanOrEqual(0);

    const { violations } = await axeScan(page, "main");
    expect(violations).toEqual([]);
  });
}

test("móvil: la tabla del catálogo se desplaza dentro de su contenedor", async ({ page }) => {
  await openDesignSystem(page, "light");
  const container = page
    .locator('[data-section="Catálogo"] [data-slot="table-container"]')
    .first();
  const { scrollWidth, clientWidth } = await container.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);
});

test("móvil: el diálogo de key nueva cabe en la pantalla", async ({ page }) => {
  await openDesignSystem(page, "light");
  await page
    .locator('[data-section="API keys"]')
    .getByRole("button", { name: "Crear key" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Tu nueva API key" });
  await expect(dialog).toBeVisible();
  await settled(dialog);
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
});

test("móvil: Anterior y Siguiente siguen teniendo nombre aunque el texto se oculte", async ({ page }) => {
  await openDesignSystem(page, "light");
  const nav = page.getByRole("navigation", { name: "Páginas de requests" });
  await expect(nav.getByRole("link", { name: "Anterior" })).toBeVisible();
  // sr-only deja una caja de 1 px: para Playwright eso es "visible", así que se mide la caja.
  const box = (await nav.getByText("Anterior").boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(1);
});

for (const path of ["/es", "/en/models", "/es/models/google/gemini-4-argon"]) {
  test(`móvil: ${path} no se desborda y la navegación cabe`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const header = (await page.locator("header").first().boundingBox())!;
    expect(header.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(page.getByRole("navigation", { name: /Main|Principal/ }).getByRole("link").first()).toBeVisible();
  });
}
