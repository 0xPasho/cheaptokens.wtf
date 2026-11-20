"use client";

import { usePathname } from "next/navigation";
import { useCallback } from "react";

import { type AuthView, REDIRECT_PARAM, safeRedirectPath, viewFromPath, viewPath } from "@/lib/auth/redirect";
import type { Locale } from "@/lib/i18n/config";

/** El título de la pestaña de cada vista, ya con el nombre del sitio. */
export type AuthTitles = Record<AuthView, string>;

/**
 * La vista sale de la URL: `/sign-in` o `/sign-up`. Cambiarla no navega (así no se pierde lo escrito):
 * solo reemplaza la URL y el título de la pestaña. Next sincroniza `usePathname` con `replaceState`.
 */
export function useAuthView(locale: Locale, titles: AuthTitles): [AuthView, (view: AuthView) => void] {
  const view = viewFromPath(usePathname());
  const setView = useCallback((next: AuthView) => {
    window.history.replaceState(null, "", viewPath(locale, next, window.location.search));
    document.title = titles[next];
  }, [locale, titles]);
  return [view, setView];
}

/** A dónde iba la persona: `?redirect_url=` si es una ruta propia, o el dashboard. Se lee al terminar, no al pintar. */
export function currentRedirectTarget(locale: Locale): string {
  return safeRedirectPath(new URLSearchParams(window.location.search).get(REDIRECT_PARAM), locale);
}
