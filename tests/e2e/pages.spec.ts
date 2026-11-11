import { expect, type Page, test } from "@playwright/test";

import { axeScan, type Theme, THEMES } from "./helpers";

/** Landing, catálogo, detalle de modelo (plan en docs/14) y docs (docs/02 › Docs). */

const LOCALES = ["en", "es"] as const;
const PAGES = [
  { name: "landing", path: "" },
  { name: "modelos", path: "/models" },
  { name: "detalle", path: "/models/anthropic/claude-sonnet-4.5" },
  { name: "docs", path: "/docs" },
] as const;

async function open(page: Page, url: string, theme: Theme = "light") {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  const response = await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  return response;
}

for (const locale of LOCALES) {
  for (const theme of THEMES) {
    for (const { name, path } of PAGES) {
      test(`${name} · ${locale} · ${theme}: pasa axe y coincide con su captura`, async ({ page }) => {
        const response = await open(page, `/${locale}${path}`, theme);
        expect(response?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

        const { violations } = await axeScan(page, "body");
        expect.soft(violations).toEqual([]);

        // La entrada escalonada del hero termina antes de capturar.
        await page.waitForTimeout(900);
        await expect.soft(page).toHaveScreenshot(`${name}-${locale}-${theme}.png`, { fullPage: true });
      });
    }
  }
}

test.describe("idioma", () => {
  test("/ redirige al idioma del navegador", async ({ browser }) => {
    // Chrome arma Accept-Language desde el locale del contexto.
    for (const [locale, expected] of [["es-MX", "/es"], ["en-US", "/en"], ["fr-FR", "/en"]]) {
      const context = await browser.newContext({ locale });
      const page = await context.newPage();
      await page.goto("/");
      await expect(page).toHaveURL(new RegExp(`${expected}$`));
      await context.close();
    }
  });

  test("una ruta sin idioma conserva el resto del camino", async ({ page }) => {
    await page.goto("/models");
    await expect(page).toHaveURL(/\/es\/models$/);
  });

  test("el selector de idioma cambia solo el prefijo y lo recuerda", async ({ page }) => {
    await open(page, "/es/models/openai/gpt-5");
    await page.getByRole("navigation", { name: "Idioma" }).getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/models\/openai\/gpt-5$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // La cookie gana sobre Accept-Language (es-MX en la config).
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
  });
});

test.describe("catálogo", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "/es/models");
  });

  const rows = (page: Page) => page.getByRole("region", { name: "Modelos" }).locator("tbody tr");

  test("busca por nombre o autor y anuncia el número de resultados", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Buscar modelos" }).fill("gemini");
    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByRole("status")).toHaveText("2 modelos");
  });

  test("el atajo / enfoca la búsqueda", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Buscar modelos" });
    // El atajo existe después de hidratar: se reintenta hasta que la página está lista.
    await expect(async () => {
      await page.locator("body").focus();
      await page.keyboard.press("/");
      await expect(search).toBeFocused({ timeout: 250 });
    }).toPass({ timeout: 5000 });
    // El "/" no se escribe en el campo.
    await expect(search).toHaveValue("");
  });

  test("los tags se combinan con Y", async ({ page }) => {
    const filters = page.getByRole("group", { name: "Filtrar por capacidad" });
    await filters.getByRole("button", { name: "Pesos abiertos" }).click();
    const openWeights = await rows(page).count();
    await filters.getByRole("button", { name: "Visión" }).click();
    const both = await rows(page).count();
    expect(both).toBeGreaterThan(0);
    expect(both).toBeLessThan(openWeights);
  });

  test("sin resultados muestra el estado vacío y Limpiar filtros los quita", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Buscar modelos" }).fill("no-existe");
    await expect(page.getByText("Ningún modelo coincide")).toBeVisible();
    await page.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("ordena por nombre", async ({ page }) => {
    await page.getByRole("combobox", { name: "Ordenar por" }).click();
    await page.getByRole("option", { name: "Nombre" }).click();
    const names = await rows(page).locator("td:first-child a").allTextContents();
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test("cada modelo tiene su página de detalle", async ({ page }) => {
    const links = await rows(page).locator("td:first-child a").evaluateAll((anchors) =>
      anchors.map((a) => ({ href: a.getAttribute("href")!, name: a.textContent!.trim() })),
    );
    expect(links).toHaveLength(10);
    for (const { href, name } of links) {
      const response = await page.goto(href);
      expect(response?.status(), href).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    }
  });
});

test.describe("detalle", () => {
  test("muestra el ahorro del request de ejemplo y el snippet con el ID del modelo", async ({ page }) => {
    await open(page, "/es/models/anthropic/claude-sonnet-4.5");
    // docs/06: 2,000 + 500 tokens a $0.30 / $1.50 → $0.00135 con cheaptokens.wtf, $0.0135 oficial.
    await expect(page.getByText(/0,00135\s?US\$/).first()).toBeVisible();
    await expect(page.getByText(/0,01215\s?US\$/)).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText('model="anthropic/claude-sonnet-4.5"');
  });

  test("un modelo desconocido da 404 en el idioma de la ruta", async ({ page }) => {
    const response = await page.goto("/es/models/acme/no-existe");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "No tenemos ese modelo" })).toBeVisible();
  });
});

test.describe("docs", () => {
  test("título por idioma y Docs enlazada desde el header y el footer", async ({ page }) => {
    await open(page, "/es");
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Docs" }).click();
    await expect(page).toHaveURL(/\/es\/docs$/);
    await expect(page).toHaveTitle("Documentación · cheaptokens.wtf");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/es/docs");

    await open(page, "/en/docs");
    await expect(page).toHaveTitle("Docs · cheaptokens.wtf");
  });

  test("la tabla de errores tiene los 12 códigos y las cifras salen con el formato del idioma", async ({ page }) => {
    await open(page, "/es/docs");
    const errors = page.getByRole("region", { name: "Códigos de error" });
    await expect(errors.locator("tbody tr")).toHaveCount(12);
    await expect(errors.locator("tbody tr").filter({ hasText: "429" })).toContainText("rate_limit_exceeded");
    await expect(errors).toContainText("4,5 MB");
    // ADR-0030: el cobro mínimo, formateado con @/lib/format.
    await expect(page.getByText(/al menos 0,00001\s?US\$/)).toBeVisible();
  });

  test("el ejemplo de streaming pide el uso y muestra el keep-alive y el error a mitad del stream", async ({ page }) => {
    await open(page, "/en/docs");
    const streaming = page.locator("#streaming");
    await expect(streaming.getByRole("tabpanel")).toContainText('stream_options={"include_usage": True}');
    await expect(streaming).toContainText(": keep-alive");
    await expect(streaming).toContainText('"finish_reason":"error"');
    await expect(streaming).toContainText("data: [DONE]");
  });

  test.describe("en un teléfono", () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test("/docs no se desborda: las tablas y el código se desplazan dentro de su caja", async ({ page }) => {
      await open(page, "/es/docs");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  });
});
