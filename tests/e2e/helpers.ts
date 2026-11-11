import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";

export type Theme = "light" | "dark";
export const THEMES: Theme[] = ["light", "dark"];

/** Abre /design-system con la preferencia de tema ya guardada, como un usuario que vuelve. */
export async function openDesignSystem(page: Page, theme: Theme) {
  await page.addInitScript((value) => {
    localStorage.setItem("theme", value);
  }, theme);
  await page.goto("/es/design-system");
  await page.evaluate(() => document.fonts.ready);
}

/** Espera a que terminen las animaciones de entrada (zoom/fade) antes de medir un elemento. */
export async function settled(locator: Locator) {
  await locator.evaluate((el) =>
    Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
  );
}

/** Los títulos de cada sección (`data-section`) de /design-system, en orden. */
export async function sectionTitles(page: Page) {
  return page
    .locator("[data-section]")
    .evaluateAll((sections) => sections.map((s) => s.getAttribute("data-section")!));
}

export function slug(title: string) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** axe con las reglas de WCAG 2.1 A y AA, limitado a un selector. */
export async function axeScan(page: Page, selector: string) {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return {
    violations: results.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
    })),
    incomplete: results.incomplete.map((v) => ({ rule: v.id, count: v.nodes.length })),
  };
}
