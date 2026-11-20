/**
 * A dónde se va después de entrar (ADR-0063). Módulo sin dependencias: lo comparten el proxy,
 * las server actions y la ventana de acceso en el navegador.
 */
import type { Locale } from "@/lib/i18n/config";

/** Parámetro con la ruta a la que se vuelve después de entrar. */
export const REDIRECT_PARAM = "redirect_url";

/** Las dos URL de la ventana de acceso. Es la misma ventana: solo cambia el texto. */
export type AuthView = "sign-in" | "sign-up";

export function dashboardPath(locale: Locale): string {
  return `/${locale}/dashboard`;
}

/** `/es/sign-in` o `/es/sign-up`, con o sin parámetros: las dos URL de la ventana de acceso. */
export function isAuthPath(pathname: string): boolean {
  const [, , section, extra] = pathname.split(/[?#]/)[0].split("/");
  return (section === "sign-in" || section === "sign-up") && !extra;
}

/** Solo sirve para resolver la ruta como lo hará el navegador: nunca se navega a este origen. */
const RESOLVE_BASE = "https://redirect.invalid";

/**
 * Solo rutas propias del mismo idioma: nada de redirecciones abiertas. Cualquier otra cosa
 * (otro sitio, `//host`, barras invertidas, otro idioma) termina en el dashboard. Volver a la
 * propia ventana de acceso tampoco vale: quien acaba de entrar daría vueltas.
 *
 * La ruta se revisa ya resuelta, como la va a leer el navegador: `/es/../en/dashboard` es `/en/dashboard`.
 */
export function safeRedirectPath(value: string | null | undefined, locale: Locale): string {
  const fallback = dashboardPath(locale);
  const text = value ?? "";
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\")) return fallback;
  let url: URL;
  try {
    url = new URL(text, RESOLVE_BASE);
  } catch {
    return fallback;
  }
  const own = url.origin === RESOLVE_BASE && url.pathname.startsWith(`/${locale}/`);
  return own && !isAuthPath(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : fallback;
}

/** La ventana de acceso, con la ruta de regreso si hay una. */
export function authHref(locale: Locale, view: AuthView, next?: string): string {
  const path = `/${locale}/${view}`;
  return next ? `${path}?${REDIRECT_PARAM}=${encodeURIComponent(next)}` : path;
}

/**
 * «Obtén tu API key»: abre la ventana en modo crear cuenta y, al terminar, lleva a las keys.
 * Quien ya tiene sesión pasa directo a las keys (lo redirige el proxy).
 */
export function getKeyHref(locale: Locale): string {
  return authHref(locale, "sign-up", `${dashboardPath(locale)}/keys`);
}

/** La vista de una ruta: `/es/sign-up` → `sign-up`. Todo lo demás es iniciar sesión. */
export function viewFromPath(pathname: string): AuthView {
  return pathname.split("/")[2] === "sign-up" ? "sign-up" : "sign-in";
}

/** La misma ruta con la otra vista: `/es/sign-in?x=1` → `/es/sign-up?x=1`. */
export function viewPath(locale: Locale, view: AuthView, search = ""): string {
  return `/${locale}/${view}${search}`;
}
