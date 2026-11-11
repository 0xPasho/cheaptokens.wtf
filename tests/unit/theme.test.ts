import { describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  isTheme,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeScript,
} from "@/lib/theme";

function mockSystemTheme(dark: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: dark && query.includes("dark"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

const isDark = () => document.documentElement.classList.contains("dark");

describe("preferencia de tema", () => {
  it("solo acepta light, dark y system", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
    expect(isTheme("blue")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("sin preferencia guardada, o con un valor inválido, usa system", () => {
    expect(readStoredTheme()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readStoredTheme()).toBe("system");
  });

  it("system sigue al sistema operativo", () => {
    mockSystemTheme(true);
    expect(resolveTheme("system")).toBe("dark");
    mockSystemTheme(false);
    expect(resolveTheme("system")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("themeScript (corre en <head> antes del primer paint)", () => {
  const run = () => new Function(themeScript)();

  it.each([
    ["dark", false, true],
    ["light", true, false],
    [null, true, true],
    [null, false, false],
    ["system", true, true],
  ])("guardado=%s, sistema oscuro=%s → .dark=%s", (stored, systemDark, expected) => {
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
    mockSystemTheme(systemDark);
    run();
    expect(isDark()).toBe(expected);
  });

  it("aplica la misma regla que resolveTheme", () => {
    for (const systemDark of [true, false]) {
      for (const stored of ["light", "dark", "system"] as const) {
        localStorage.setItem(THEME_STORAGE_KEY, stored);
        mockSystemTheme(systemDark);
        document.documentElement.className = "";
        run();
        expect(isDark()).toBe(resolveTheme(stored) === "dark");
      }
    }
  });

  it("no rompe la página si localStorage falla", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    expect(run).not.toThrow();
  });
});

describe("applyTheme", () => {
  it("pone y quita .dark", () => {
    applyTheme("dark");
    expect(isDark()).toBe(true);
    applyTheme("light");
    expect(isDark()).toBe(false);
  });

  it("apaga las transiciones durante el cambio y las devuelve después", () => {
    vi.useFakeTimers();
    const before = new Set(document.head.querySelectorAll("style"));
    applyTheme("dark");
    const blocker = [...document.head.querySelectorAll("style")].find(
      (s) => !before.has(s) && s.textContent?.includes("transition:none"),
    );
    expect(blocker).toBeDefined();
    vi.runAllTimers();
    expect(blocker?.isConnected).toBe(false);
  });

  it("no hace nada si el tema ya está aplicado", () => {
    applyTheme("dark");
    const styles = document.head.querySelectorAll("style").length;
    applyTheme("dark");
    expect(document.head.querySelectorAll("style").length).toBe(styles);
  });
});
