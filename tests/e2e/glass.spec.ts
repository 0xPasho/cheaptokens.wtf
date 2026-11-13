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
    await expect(page.getByRole("searchbox")).toBeFocused();
  });
}

test("catalog filters survive model navigation and browser back", async ({ page }) => {
  await page.goto("/en/models");
  await page.getByRole("searchbox").fill("claude-sonnet-4.6");
  await expect(page.locator("article")).toHaveCount(1);
  await page.locator("article").getByRole("link").click();
  await expect(page).toHaveURL(/q=claude-sonnet-4.6/);
  await page.locator(".nr-breadcrumb").click();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.getByRole("searchbox")).toHaveValue("claude-sonnet-4.6");
  await page.reload();
  await expect(page.locator("article")).toHaveCount(1);
});

test("request and output previews work without making an API call", async ({ page }) => {
  await page.goto("/en/models/anthropic/claude-sonnet-4.6");
  const request = page.getByRole("region", { name: "Quick Start", exact: true });
  await request.getByRole("tab", { name: "Python", exact: true }).click();
  await expect(request.locator("pre").first()).toContainText('model="anthropic/claude-sonnet-4.6"');
  await request.getByRole("tab", { name: "Raw response", exact: true }).click();
  await expect(request.getByRole("tabpanel").filter({ hasText: '"object": "chat.completion"' })).toBeVisible();
  await page.getByRole("region", { name: "API Details", exact: true }).getByRole("tab", { name: "API Schema", exact: true }).click();
  await expect(page.locator(".nr-schema-json")).toContainText('"max_tokens": 1024');
});
