import { PLANS, TYPICAL_REQUEST } from "../../src/lib/billing/plans";
import { typicalRequestsIn } from "../../src/lib/billing/typical";
import { getCatalog, requestCost } from "../../src/lib/catalog/queries";
import { formatCount, formatUsd } from "../../src/lib/format";
import { expect, type Page, test } from "@playwright/test";

import { axeScan, type Theme, THEMES } from "./helpers";

/** Landing (ADR-0060), catálogo, detalle de modelo (plan en docs/14), precios, preguntas (ADR-0061), cómo funciona (ADR-0071), docs (docs/02 › Docs) y acceso (ADR-0063). */

const LOCALES = ["en", "es"] as const;
const PAGES = [
  { name: "landing", path: "" },
  { name: "modelos", path: "/models" },
  { name: "detalle", path: "/models/anthropic/claude-sonnet-4.6" },
  { name: "docs", path: "/docs" },
  { name: "precios", path: "/pricing" },
  { name: "preguntas", path: "/faq" },
  { name: "como-funciona", path: "/how-it-works" },
  // La ventana de acceso, en el modo de desarrollo con el que corre el servidor de pruebas (ADR-0063).
  { name: "entrar", path: "/sign-in" },
  { name: "crear-cuenta", path: "/sign-up" },
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
    await page.getByRole("contentinfo").getByRole("combobox", { name: "Idioma" }).click();
    await page.getByRole("option", { name: "English" }).click();
    await expect(page).toHaveURL(/\/en\/models\/openai\/gpt-5$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // La cookie gana sobre Accept-Language (es-MX en la config).
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
  });
});

test.describe("landing en anchos difíciles", () => {
  for (const width of [320, 880, 1000]) {
    test(`a ${width} px nada se sale: ni los precios en español ni la cabecera`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, "/es");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      // Los descuentos se quedan dentro de su tarjeta.
      const escaped = await page.locator(".nr-mk-price-tile").evaluateAll((tiles) => tiles.filter((tile) => {
        const badge = tile.querySelector(".nr-mk-price-row > :last-child");
        return badge ? badge.getBoundingClientRect().right > tile.getBoundingClientRect().right : false;
      }).length);
      expect(escaped).toBe(0);
      if (width > 860) {
        // «Iniciar sesión» no se parte en dos líneas.
        const account = (await page.locator(".nr-account-link").boundingBox())!;
        expect(account.height).toBeLessThan(40);
      }
    });
  }
});

test.describe("landing", () => {
  test("la tabla cambia de grupo y lleva al catálogo con el filtro puesto", async ({ page }) => {
    await open(page, "/es");
    const prices = page.locator("#prices");
    const coding = getCatalog().filter((model) => model.allTags.includes("coding"));
    await prices.getByRole("tab", { name: /^Código/ }).click();
    const panel = prices.getByRole("tabpanel");
    const allCoding = panel.getByRole("link", { name: `Ver los ${coding.length} de Código` });
    await expect(allCoding).toHaveAttribute("href", "/es/models?tags=coding");
    await expect(panel.locator("tbody tr")).toHaveCount(Math.min(8, coding.length));
    const members = coding.map((model) => `/es/models/${model.id}`);
    for (const href of await panel.locator("tbody th a").evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
      expect(members).toContain(href);
    }
    await allCoding.click();
    await expect(page).toHaveURL(/\/es\/models\?tags=coding$/);
    await expect(page.getByRole("region", { name: "Modelos" }).locator("article")).toHaveCount(coding.length);
  });

  test("el selector de modelo recalcula las requests típicas de los planes", async ({ page }) => {
    await open(page, "/es");
    const plus = page.locator("#pricing").getByRole("article").filter({ has: page.getByRole("heading", { name: "Plus" }) });
    const fits = (id: string) => formatCount(typicalRequestsIn(PLANS.plus.fiveHourLimitMicroUsd, getCatalog().find((model) => model.id === id)!), "es");
    await expect(plus).toContainText(`≈ ${fits("anthropic/claude-sonnet-5.5")} requests`);
    await page.getByRole("combobox", { name: "Calcula los requests con" }).click();
    await page.getByRole("option", { name: "Claude Opus 5.5" }).click();
    await expect(plus).toContainText(`≈ ${fits("anthropic/claude-opus-5.5")} requests`);
    await expect(plus).toContainText("con Claude Opus 5.5");
  });

  test("Precios va en la cabecera y Preguntas frecuentes en el footer", async ({ page }) => {
    await open(page, "/es");
    await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Precios" }).click();
    await expect(page).toHaveURL(/\/es\/pricing$/);
    await expect(page).toHaveTitle("Precios · cheapllm.wtf");
    await page.getByRole("contentinfo").getByRole("link", { name: "Preguntas frecuentes" }).click();
    await expect(page).toHaveURL(/\/es\/faq$/);
    await page.getByRole("button", { name: "¿Qué incluye un plan?" }).click();
    await expect(page.getByText(`Plus cuesta ${formatUsd(Number(PLANS.plus.priceMicroUsd), "es", "whole")}`)).toBeVisible();
  });

  test("Cómo funciona tiene página propia: la cabecera y «Ver cómo funciona» llevan a ella (ADR-0071)", async ({ page }) => {
    await open(page, "/es");
    await page.locator("#why").getByRole("link", { name: "Ver cómo funciona" }).click();
    await expect(page).toHaveURL(/\/es\/how-it-works$/);
    await expect(page).toHaveTitle("Cómo funciona · cheapllm.wtf");
    await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Cómo funciona" })).toHaveAttribute("aria-current", "page");
    // El recibo de ejemplo sale del catálogo: la request típica con el precio de Claude Sonnet 5.5.
    const sonnet = getCatalog().find((model) => model.id === "anthropic/claude-sonnet-5.5")!;
    const charged = formatUsd(requestCost(sonnet.discountedInput, sonnet.discountedOutput, 20_000, 2_000), "es", "price");
    await expect(page.getByRole("complementary", { name: "Request de ejemplo" })).toContainText(charged);
  });
});

test.describe("foco de teclado (ADR-0064)", () => {
  /** El control enfocado, o la tarjeta que su link cubre entera, lleva un contorno de al menos 2 px. */
  const focusIsVisible = (page: Page) => page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const ringed = (el: Element | null) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
    };
    // Los campos de texto no llevan contorno: la búsqueda de la cabecera se ensancha al enfocarla.
    if (element.tagName === "INPUT") return true;
    return ringed(element) || ringed(element.closest(".nr-model-card, .nr-mk-price-tile"));
  });

  for (const path of ["/es", "/es/pricing", "/en/models"]) {
    test(`${path}: cada parada de Tab muestra dónde está el foco`, async ({ page }) => {
      await open(page, path);
      const hidden: string[] = [];
      for (let stop = 0; stop < 45; stop++) {
        await page.keyboard.press("Tab");
        const name = await page.evaluate(() => (document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent || "").trim().slice(0, 40));
        if (!(await focusIsVisible(page))) hidden.push(name);
      }
      expect(hidden).toEqual([]);
    });
  }

  test("«Saltar al contenido» es la primera parada, aparece al enfocarla y lleva al contenido", async ({ page }) => {
    await open(page, "/es");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skip).toBeFocused();
    const box = (await skip.boundingBox())!;
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThanOrEqual(24);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  });
});

test.describe("catálogo", () => {
  test.beforeEach(async ({ page }) => {
    await open(page, "/es/models");
  });

  const rows = (page: Page) => page.getByRole("region", { name: "Modelos" }).locator("article");

  test("busca por nombre o autor y anuncia el número de resultados", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Buscar modelos" }).fill("gemini");
    await expect(rows(page)).toHaveCount(getCatalog().filter((model) => model.author === "google").length);
    await expect(page.getByRole("status")).toContainText(`${getCatalog().filter((model) => model.author === "google").length} modelos`);
  });

  test("el atajo / abre la paleta de búsqueda", async ({ page }) => {
    const palette = page.getByRole("dialog", { name: "Buscar modelos" });
    // El atajo existe después de hidratar: se reintenta hasta que la página está lista.
    await expect(async () => {
      await page.locator("body").focus();
      await page.keyboard.press("/");
      await expect(palette).toBeVisible({ timeout: 250 });
    }).toPass({ timeout: 5000 });
    // El "/" no se escribe en el campo.
    await expect(palette.getByRole("combobox")).toBeFocused();
    await expect(palette.getByRole("combobox")).toHaveValue("");
  });

  test("los tags se combinan con Y", async ({ page }) => {
    const filters = page.getByRole("group", { name: "Filtrar por capacidad" });
    await filters.getByRole("button", { name: /^Visión/ }).click();
    const visionModels = await rows(page).count();
    await filters.getByRole("button", { name: /^Razonamiento/ }).click();
    const both = await rows(page).count();
    expect(both).toBeGreaterThan(0);
    expect(both).toBeLessThan(visionModels);
  });

  test("sin resultados muestra el estado vacío y Limpiar filtros los quita", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Buscar modelos" }).fill("no-existe");
    await expect(page.getByText("Ningún modelo coincide")).toBeVisible();
    await page.getByRole("button", { name: "Limpiar filtros" }).click();
    await expect(rows(page)).toHaveCount(getCatalog().length);
  });

  test("ordena por nombre", async ({ page }) => {
    await page.getByRole("combobox", { name: "Ordenar por" }).click();
    await page.getByRole("option", { name: "Nombre" }).click();
    const names = await rows(page).locator("h2 a").allTextContents();
    expect(names).toEqual([...names].sort(new Intl.Collator("en", { numeric: true, sensitivity: "base" }).compare));
  });

  test("cada modelo tiene su página de detalle", async ({ page }) => {
    test.setTimeout(120_000);
    const links = await rows(page).locator("h2 a").evaluateAll((anchors) =>
      anchors.map((a) => ({ href: a.getAttribute("href")!, name: a.textContent!.trim() })),
    );
    expect(links).toHaveLength(getCatalog().length);
    for (const { href, name } of links) {
      const response = await page.goto(href);
      expect(response?.status(), href).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    }
  });
});

test.describe("detalle", () => {
  test("muestra el ahorro del request de ejemplo y el snippet con el ID del modelo", async ({ page }) => {
    await open(page, "/es/models/anthropic/claude-sonnet-4.6");
    const model = getCatalog().find((entry) => entry.id === "anthropic/claude-sonnet-4.6")!;
    const { promptTokens, completionTokens } = TYPICAL_REQUEST;
    const discounted = requestCost(model.discountedInput, model.discountedOutput, promptTokens, completionTokens);
    const official = requestCost(model.officialInput, model.officialOutput, promptTokens, completionTokens);
    await expect(page.locator(".nr-cost").getByText(formatUsd(discounted, "es", "cost"), { exact: true })).toBeVisible();
    await expect(page.locator(".nr-cost").getByText(formatUsd(official - discounted, "es", "cost"), { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Python", exact: true }).click();
    await expect(page.getByRole("tabpanel").filter({ has: page.locator(".nr-code-box") }).first()).toContainText('model="anthropic/claude-sonnet-4.6"');
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
    await expect(page).toHaveTitle("Documentación · cheapllm.wtf");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/es/docs");

    await open(page, "/en/docs");
    await expect(page).toHaveTitle("Docs · cheapllm.wtf");
  });

  test("la tabla de errores tiene los 15 códigos y las cifras salen con el formato del idioma", async ({ page }) => {
    await open(page, "/es/docs");
    const errors = page.getByRole("region", { name: "Códigos de error" });
    // ADR-0068: agrupados en cinco, cada grupo con su fila de título (sin celdas `td`).
    await expect(errors.locator("tbody tr:has(td)")).toHaveCount(15);
    await expect(errors.locator("tbody th[scope=colgroup]")).toHaveCount(5);
    await expect(errors.locator("tbody tr").filter({ hasText: "rate_limit_exceeded" })).toContainText("429");
    // ADR-0049: el límite del plan también responde 429, con su propio código.
    await expect(errors.locator("tbody tr").filter({ hasText: "usage_limit_reached" })).toContainText("429");
    await expect(errors).toContainText("4,5 MB");
    // ADR-0030: el cobro mínimo, formateado con @/lib/format.
    await expect(page.getByText(/al menos 0,00001\s?US\$/)).toBeVisible();
  });

  test("el ejemplo de streaming pide el uso, y la referencia muestra el keep-alive y el error a mitad del stream", async ({ page }) => {
    await open(page, "/en/docs");
    const streaming = page.locator("#streaming");
    await expect(streaming.getByRole("tabpanel")).toContainText('stream_options={"include_usage": True}');
    await expect(streaming.getByRole("link", { name: "Stream format" })).toHaveAttribute("href", "#stream-format");
    const format = page.locator("#stream-format");
    await expect(format).toContainText(": keep-alive");
    await expect(format).toContainText('"finish_reason":"error"');
    await expect(format).toContainText("data: [DONE]");
  });

  test("el índice lleva a cada sección y las cifras salen del código", async ({ page }) => {
    await open(page, "/en/docs");
    const index = page.getByRole("navigation", { name: "On this page" });
    const links = index.getByRole("link");
    await expect(links).toHaveCount(11);
    for (const href of await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")))) {
      await expect(page.locator(`section${href}`)).toHaveCount(1);
    }
    // ADR-0049: el rate limit de cada plan, de src/lib/billing/plans.ts.
    const rateLimit = page.getByRole("region", { name: "Rate limit by plan" });
    await expect(rateLimit.locator("tbody tr").filter({ hasText: "Max" })).toContainText("300");
    // ADR-0066 y ADR-0079: la salida por defecto y el mínimo que se reserva, de src/lib/gateway/request-cost.ts.
    await expect(page.locator("#quickstart")).toContainText("32,768");
    await expect(page.locator("#billing")).toContainText("If not even 256 output tokens fit");
  });

  test.describe("en un teléfono", () => {
    test.use({ viewport: { width: 412, height: 915 } });

    test("/docs no se desborda: las tablas y el código se desplazan dentro de su caja", async ({ page }) => {
      await open(page, "/es/docs");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
});


test.describe("búsqueda de la cabecera (⌘K)", () => {
  test("está en el centro de la pantalla", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "/es");
    const box = (await page.getByRole("button", { name: /^Buscar/ }).boundingBox())!;
    // El centro de la cabecera, que ocupa el ancho de la página sin la barra de desplazamiento.
    const header = (await page.getByRole("banner").boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - (header.x + header.width / 2))).toBeLessThanOrEqual(1);
  });

  test("desde la landing lleva a un modelo con el teclado", async ({ page }) => {
    await open(page, "/en");
    const palette = page.getByRole("dialog", { name: "Search models" });
    await expect(async () => {
      await page.keyboard.press("ControlOrMeta+k");
      await expect(palette).toBeVisible({ timeout: 250 });
    }).toPass({ timeout: 5000 });
    const target = getCatalog().find((model) => model.id === "anthropic/claude-sonnet-4.6")!;
    await palette.getByRole("combobox").fill("sonnet 4.6");
    await expect(palette.getByRole("option").first()).toContainText(target.name);
    await expect(palette.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/models\/anthropic\/claude-sonnet-4\.6$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(target.name);
  });

  test("«Ver los resultados» abre el catálogo filtrado", async ({ page }) => {
    await open(page, "/es/pricing");
    await page.getByRole("button", { name: /^Buscar/ }).click();
    const palette = page.getByRole("dialog", { name: "Buscar modelos" });
    await palette.getByRole("combobox").fill("claude");
    await palette.getByRole("option", { name: /resultados? en el catálogo/ }).click();
    await expect(page).toHaveURL(/\/es\/models\?q=claude$/);
    await expect(page.getByRole("searchbox", { name: "Buscar modelos" })).toHaveValue("claude");
  });
});

test("catalog cards combine author and search filters and keep results when switching views", async ({ page }) => {
  await open(page, "/en/models", "dark");
  const region = page.getByRole("region", { name: "Models", exact: true });
  await expect(region.locator("article")).toHaveCount(getCatalog().length);
  await page.getByRole("button", { name: "Anthropic", exact: true }).click();
  await expect(region.locator("article")).toHaveCount(getCatalog().filter((model) => model.author === "anthropic").length);
  await page.getByRole("searchbox", { name: "Search models" }).fill("claude-sonnet-4.6");
  await expect(region.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(region.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await region.getByRole("link", { name: "Claude Sonnet 4.6" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Claude Sonnet 4.6");
});
