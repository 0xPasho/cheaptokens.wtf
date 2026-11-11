import type { Locale } from "../config";

import { type Dictionary, en } from "./en";
import { es } from "./es";

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { en, es };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** Rellena `{nombre}` en un texto del diccionario: `t("Ver los {count}", { count: "10" })`. */
export function t(template: string, values: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/** Elige singular o plural con las reglas del idioma. */
export function plural(locale: Locale, count: number, one: string, other: string) {
  return new Intl.PluralRules(locale).select(count) === "one" ? one : other;
}
