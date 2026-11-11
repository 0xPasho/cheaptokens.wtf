export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = Exclude<Theme, "system">;

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "system";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Corre en `<head>` antes del primer paint, para que no haya flash del tema
 * equivocado. Ver la guía `preventing-flash-before-hydration` de Next 16.
 * Debe aplicar la misma regla que `resolveTheme`.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

/** Solo en el cliente. */
export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Solo en el cliente. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Solo en el cliente. */
export function subscribeToSystemTheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Pone o quita la clase `.dark` en `<html>`. Apaga las transiciones durante el
 * cambio para que los colores no se animen uno por uno.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark = resolveTheme(theme) === "dark";
  if (root.classList.contains("dark") === dark) return;

  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);

  root.classList.toggle("dark", dark);

  // Fuerza un reflow con las transiciones apagadas antes de volver a prenderlas.
  window.getComputedStyle(document.body);
  setTimeout(() => style.remove(), 1);
}
