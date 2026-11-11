import { match } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";

/** Idiomas de la web (ADR-0015). La API no tiene idioma. */
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie que guarda el idioma elegido con el selector (docs/10-i18n.md). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function hasLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * Idioma para una ruta sin prefijo: primero la cookie, después el mejor match de
 * Accept-Language entre los idiomas soportados, y si no, `en`.
 */
export function negotiateLocale({
  cookie,
  acceptLanguage,
}: {
  cookie?: string;
  acceptLanguage?: string | null;
}): Locale {
  if (cookie && hasLocale(cookie)) return cookie;
  const languages = new Negotiator({
    headers: { "accept-language": acceptLanguage ?? "" },
  }).languages();
  try {
    return match(languages, [...LOCALES], DEFAULT_LOCALE) as Locale;
  } catch {
    // Un Accept-Language mal formado no debe romper la página.
    return DEFAULT_LOCALE;
  }
}

/** La misma ruta en otro idioma: `/es/models` → `/en/models`. */
export function switchLocalePath(pathname: string, locale: Locale) {
  const [, first, ...rest] = pathname.split("/");
  const tail = first && hasLocale(first) ? rest : [first, ...rest].filter(Boolean);
  return `/${[locale, ...tail].join("/")}`.replace(/\/$/, "") || `/${locale}`;
}
