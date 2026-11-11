import { type NextRequest, NextResponse } from "next/server";

import { hasLocale, LOCALE_COOKIE, negotiateLocale } from "@/lib/i18n/config";

/**
 * Redirige las rutas web sin idioma a /{idioma} (docs/10-i18n.md).
 * Clerk se compone aquí cuando llegue el login (fase 0).
 */
export function proxy(request: NextRequest) {
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

export const config = {
  // Fuera: la API (/v1), los route handlers (/api), los archivos internos de Next y los estáticos.
  matcher: ["/((?!v1|api|_next|.*\\..*).*)"],
};
