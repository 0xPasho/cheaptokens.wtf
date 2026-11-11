import { lang } from "next/root-params";

import { DEFAULT_LOCALE, hasLocale, type Locale } from "./config";
import { type Dictionary, getDictionary } from "./dictionaries";

/** El idioma de la ruta actual, desde cualquier Server Component (incluida la 404). */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  return value && hasLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getLocaleAndDictionary(): Promise<[Locale, Dictionary]> {
  const locale = await getLocale();
  return [locale, getDictionary(locale)];
}
