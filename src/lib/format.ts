/**
 * Formatos de la interfaz. Siempre con `Intl` y el idioma de la ruta: nunca se
 * arma un formato a mano (docs/10-i18n.md › Formatos).
 *
 * El dinero entra como micro-dólares enteros (µUSD), que es como se guarda
 * (ADR-0007). La conversión a dólares solo ocurre aquí, al mostrarlo.
 */

const MICROS_PER_USD = 1_000_000;

/**
 * - `balance`: saldo, recargas y totales. Siempre 2 decimales.
 * - `price`: precio por 1M de tokens. Hasta 4 decimales ($0.075).
 * - `cost`: costo de un request. Hasta 6 decimales, la precisión del µUSD ($0.00135).
 * - `whole`: montos redondos, como los botones de recarga ($10).
 * - `token`: precio de un solo token ($0.0000003). Solo en tooltips (docs/02 › Catálogo).
 */
export type MoneyKind = "balance" | "price" | "cost" | "whole" | "token";

const MONEY_FRACTION_DIGITS: Record<MoneyKind, [min: number, max: number]> = {
  whole: [0, 0],
  balance: [2, 2],
  price: [2, 4],
  cost: [2, 6],
  token: [2, 10],
};

const formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(
  key: string,
  create: () => T,
): T {
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = create();
    formatters.set(key, formatter);
  }
  return formatter as T;
}

/** `$0.30` en `en`, `0,30 US$` en `es`. */
export function formatUsd(
  micros: number,
  locale: string,
  kind: MoneyKind = "balance",
) {
  const [min, max] = MONEY_FRACTION_DIGITS[kind];
  return cached(
    `usd:${locale}:${kind}`,
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: min,
        maximumFractionDigits: max,
      }),
  )
    .format(micros / MICROS_PER_USD)
    .replace("-", "−");
}

/** Descuento en puntos base como porcentaje negativo: `9000` → `−90%`. */
export function formatDiscount(discountBps: number, locale: string) {
  return cached(
    `discount:${locale}`,
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 1,
      }),
  )
    // `|| 0` evita el cero negativo: sin descuento se muestra "0%", no "−0%".
    .format(-discountBps / 10_000 || 0)
    .replace("-", "−");
}

/** Conteo de tokens compacto: `200K` en `en`, `200 mil` en `es`. */
export function formatTokens(tokens: number, locale: string) {
  return cached(
    `tokens:${locale}`,
    () => new Intl.NumberFormat(locale, { notation: "compact" }),
  ).format(tokens);
}

/** Conteo exacto con separadores: `12,345`. Para tablas de uso. */
export function formatCount(value: number, locale: string) {
  return cached(`count:${locale}`, () => new Intl.NumberFormat(locale)).format(
    value,
  );
}

/**
 * Fecha corta (`Nov 8, 2026` / `8 nov 2026`). Se formatea en UTC para que el
 * servidor y el navegador produzcan el mismo texto y no haya error de
 * hidratación. Para horas locales del usuario, usar el patrón de la guía
 * `preventing-flash-before-hydration` de Next.
 */
export function formatDate(date: Date | string, locale: string) {
  return cached(
    `date:${locale}`,
    () =>
      new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }),
  ).format(typeof date === "string" ? new Date(date) : date);
}
