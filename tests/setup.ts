import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const hasDom = typeof window !== "undefined";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (!hasDom) return;
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
  document.head.querySelectorAll("style").forEach((style) => style.remove());
});

// jsdom no implementa matchMedia. Por default el sistema está en claro; cada prueba lo cambia con `mockSystemTheme`.
if (hasDom && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Base UI mide elementos con ResizeObserver; jsdom no lo trae.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
