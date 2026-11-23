import { expect, test } from "@playwright/test";
import { axeScan, openDesignSystem, settled, THEMES } from "./helpers";

for (const theme of THEMES) {
  test(`flat material · ${theme}: panels and menus are opaque without blur`, async ({ page }) => {
    await openDesignSystem(page, theme);
    const surface = page.locator('[data-section="Surface materials"] .glass-surface');
    const style = await surface.evaluate((el) => { const s = getComputedStyle(el); return { blur: s.backdropFilter, shadow: s.boxShadow, fill: s.backgroundColor }; });
    expect(style.blur).toBe("none");
    expect(style.shadow).toBe("none");
    expect(style.fill).not.toBe("rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "Tema" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await settled(menu);
    expect(await menu.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
    expect((await axeScan(page, '[role="menu"]')).violations).toEqual([]);
  });

  test(`flat material · ${theme}: dialog retains keyboard focus and solid surfaces`, async ({ page }) => {
    await openDesignSystem(page, theme);
    await page.locator('[data-section="API keys"]').getByRole("button", { name: "Crear key" }).click();
    const dialog = page.getByRole("dialog", { name: "Tu nueva API key" });
    await expect(dialog).toBeVisible();
    await settled(dialog);
    expect(await dialog.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
    expect((await axeScan(page, '[role="dialog"]')).violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test(`reference style · ${theme}: catalog uses source geometry and local fonts`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
    await page.goto("/en/models");
    await page.evaluate(() => document.fonts.ready);
    const card = page.locator(".nr-model-card").first();
    const style = await card.evaluate((el) => { const s = getComputedStyle(el); return { radius: s.borderRadius, shadow: s.boxShadow, blur: s.backdropFilter }; });
    expect(style).toEqual({ radius: "28px", shadow: "none", blur: "none" });
    const sidebar = (await page.locator(".nr-sidebar").boundingBox())!;
    expect(sidebar.width).toBe(240);
    expect(sidebar.x).toBe(20);
    expect(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily)).toContain("inter");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog").getByRole("combobox")).toBeFocused();
  });
}

test("catalog filters survive model navigation and browser back", async ({ page }) => {
  await page.goto("/en/models");
  await page.getByRole("searchbox").fill("claude-sonnet-4.6");
  await expect(page.locator("article")).toHaveCount(1);
  await page.locator("article").getByRole("link").click();
  await expect(page).toHaveURL(/q=claude-sonnet-4.6/);
  await page.locator(".nr-breadcrumb").click();
  // Next conserva oculta la página anterior: sin esperar la URL, lo de abajo pasa sobre el catálogo
  // que quedó escondido bajo el detalle y la recarga llega antes de que la navegación termine.
  await expect(page).toHaveURL(/\/en\/models\?q=claude-sonnet-4\.6$/);
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.getByRole("searchbox")).toHaveValue("claude-sonnet-4.6");
  await page.reload();
  await expect(page.locator("article")).toHaveCount(1);
});

test("model integration examples copy the selected language without making an API call", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/chat/completions")) apiCalls.push(request.url());
  });
  await page.goto("/en/models/deepseek/deepseek-v4.1-flash");
  const quickstart = page.getByRole("region", { name: "Quick Start", exact: true });
  const javascriptPanel = quickstart.getByRole("tabpanel", { name: "JavaScript", exact: true });
  const pythonPanel = quickstart.getByRole("tabpanel", { name: "Python", exact: true });
  const curlPanel = quickstart.getByRole("tabpanel", { name: "cURL", exact: true });
  await expect(javascriptPanel).toContainText("generateText");
  await javascriptPanel.getByRole("combobox", { name: "Library" }).selectOption("openai");
  await expect(javascriptPanel).toContainText("npm install openai");
  await expect(javascriptPanel).toContainText("client.chat.completions.create");
  const javascript = quickstart.getByRole("tab", { name: "JavaScript", exact: true });
  await javascript.focus();
  await page.keyboard.press("ArrowRight");
  await expect(quickstart.getByRole("tab", { name: "Python", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(pythonPanel).toContainText("model.invoke");
  await pythonPanel.getByRole("button", { name: "Copy code", exact: true }).last().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('model="deepseek/deepseek-v4.1-flash"');
  expect(copied).toContain('os.environ["CHEAPLLM_API_KEY"]');
  expect(copied).not.toContain("<span");
  await pythonPanel.getByRole("combobox", { name: "Library" }).selectOption("openai");
  await expect(pythonPanel).toContainText("from openai import OpenAI");
  await expect(pythonPanel).toContainText("python3 -m pip install openai");
  await pythonPanel.getByRole("button", { name: "Copy code", exact: true }).last().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("response.choices[0].message.content");
  await quickstart.getByRole("tab", { name: "cURL", exact: true }).click();
  await expect(curlPanel).toContainText("$CHEAPLLM_API_KEY");
  await expect(curlPanel.getByRole("listitem")).toHaveCount(2);
  await page.getByRole("region", { name: "API Details", exact: true }).getByRole("tab", { name: "API Schema", exact: true }).click();
  await expect(page.locator(".nr-schema-json")).toContainText('"max_tokens": 1024');
  expect(apiCalls).toEqual([]);
});

for (const width of [320, 880, 1440]) {
  test(`model quickstart at ${width}px: all code is readable without nested scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/es/models/deepseek/deepseek-v4.1-flash");
    const quickstart = page.getByRole("region", { name: "Inicio rápido", exact: true });
    for (const [language, library] of [["JavaScript", "default"], ["JavaScript", "openai"], ["Python", "default"], ["Python", "openai"], ["cURL", null]] as const) {
      await quickstart.getByRole("tab", { name: language, exact: true }).click();
      const panel = quickstart.getByRole("tabpanel", { name: language, exact: true });
      if (library) {
        const select = panel.getByRole("combobox", { name: "Librería" });
        await select.selectOption(library);
        await expect(select).toHaveValue(library);
        await expect(panel).toContainText(library === "openai" ? "client.chat.completions.create" : language === "JavaScript" ? "generateText" : "model.invoke");
      }
      const clipped = await panel.locator("pre").evaluateAll((blocks) => blocks.filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1).length);
      expect(clipped).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    }
  });
}
