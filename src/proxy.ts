import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

import { DEV_SESSION_COOKIE } from "@/lib/auth/cookies";
import { DEV_IDENTITY_PATTERN, getAuthMode } from "@/lib/auth/mode";
import { isAuthPath, REDIRECT_PARAM, safeRedirectPath } from "@/lib/auth/redirect";
import { hasLocale, LOCALE_COOKIE, type Locale, negotiateLocale } from "@/lib/i18n/config";

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
function dashboardLocale(pathname: string): Locale | null {
  const [, locale, section] = pathname.split("/");
  return locale && hasLocale(locale) && section === "dashboard" ? locale : null;
}

/**
 * Una visita a `/{idioma}/sign-in` o `/{idioma}/sign-up` → el idioma; cualquier otra cosa → null.
 * Solo cuentan las lecturas: la ventana también recibe server actions por POST (la de Clerk al abrir la
 * sesión, la del modo de desarrollo), y esas tienen que llegar aunque ya haya sesión.
 */
function authLocale(request: NextRequest): Locale | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const { pathname } = request.nextUrl;
  const [, locale] = pathname.split("/");
  return locale && hasLocale(locale) && isAuthPath(pathname) ? locale : null;
}

/** Sin sesión, el dashboard manda a iniciar sesión y vuelve después. Las páginas lo verifican otra vez. */
function signInRedirect(request: NextRequest, locale: Locale) {
  const url = new URL(`/${locale}/sign-in`, request.url);
  url.searchParams.set(REDIRECT_PARAM, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

/** Con sesión, la ventana de acceso no tiene nada que ofrecer: sigue a donde iba o al dashboard (ADR-0063). */
function signedInRedirect(request: NextRequest, locale: Locale) {
  const target = safeRedirectPath(request.nextUrl.searchParams.get(REDIRECT_PARAM), locale);
  return NextResponse.redirect(new URL(target, request.url));
}

// Clerk solo envuelve las páginas (ADR-0003): el matcher deja fuera /v1, así que el gateway nunca lo llama.
const withClerk = clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl;
  const dashboard = dashboardLocale(pathname);
  const access = authLocale(request);
  // La sesión solo se lee donde decide algo: el dashboard y la ventana de acceso.
  if (dashboard || access) {
    const signedIn = Boolean((await auth()).userId);
    if (dashboard && !signedIn) return signInRedirect(request, dashboard);
    if (access && signedIn) return signedInRedirect(request, access);
  }
  return localeRedirect(request);
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const mode = getAuthMode();
  if (mode === "clerk") return withClerk(request, event);
  const { pathname } = request.nextUrl;
  const hasDevSession = DEV_IDENTITY_PATTERN.test(request.cookies.get(DEV_SESSION_COOKIE)?.value ?? "");
  const dashboard = dashboardLocale(pathname);
  if (dashboard && !hasDevSession) return signInRedirect(request, dashboard);
  // Solo el modo de desarrollo tiene sesión propia: sin Clerk en preview o producción nadie está dentro.
  const access = mode === "dev" ? authLocale(request) : null;
  if (access && hasDevSession) return signedInRedirect(request, access);
  return localeRedirect(request);
}

export const config = {
  // Fuera: la API (/v1), los route handlers (/api), la puerta de socios (/partner/, docs/17), los archivos internos de Next y los estáticos.
  matcher: ["/((?!v1|api|partner/|_next|.*\\..*).*)"],
};
