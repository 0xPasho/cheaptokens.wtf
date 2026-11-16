import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

import { DEV_SESSION_COOKIE } from "@/lib/auth/cookies";
import { DEV_IDENTITY_PATTERN, getAuthMode } from "@/lib/auth/mode";
import { hasLocale, LOCALE_COOKIE, negotiateLocale } from "@/lib/i18n/config";

/** Redirige las rutas web sin idioma a /{idioma} (docs/10-i18n.md). */
function localeRedirect(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const [, first] = pathname.split("/");
  if (first && hasLocale(first)) return;

  const locale = negotiateLocale({
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

/** `/{idioma}/dashboard…` → el idioma; cualquier otra ruta → null. */
function dashboardLocale(pathname: string): string | null {
  const [, locale, section] = pathname.split("/");
  return locale && hasLocale(locale) && section === "dashboard" ? locale : null;
}

/** Sin sesión, el dashboard manda a iniciar sesión y vuelve después. Las páginas lo verifican otra vez. */
function signInRedirect(request: NextRequest, locale: string) {
  const url = new URL(`/${locale}/sign-in`, request.url);
  url.searchParams.set("redirect_url", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

// Clerk solo envuelve las páginas (ADR-0003): el matcher deja fuera /v1, así que el gateway nunca lo llama.
const withClerk = clerkMiddleware(async (auth, request) => {
  const locale = dashboardLocale(request.nextUrl.pathname);
  if (locale && !(await auth()).userId) return signInRedirect(request, locale);
  return localeRedirect(request);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const mode = getAuthMode();
  if (mode === "clerk") return withClerk(request, event);
  const locale = dashboardLocale(request.nextUrl.pathname);
  if (locale && !DEV_IDENTITY_PATTERN.test(request.cookies.get(DEV_SESSION_COOKIE)?.value ?? "")) {
    return signInRedirect(request, locale);
  }
  return localeRedirect(request);
}

export const config = {
  // Fuera: la API (/v1), los route handlers (/api), la puerta de socios (/partner/, docs/17), los archivos internos de Next y los estáticos.
  matcher: ["/((?!v1|api|partner/|_next|.*\\..*).*)"],
};
