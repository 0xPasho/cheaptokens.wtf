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

/** Totales que pueden ser de centavos: con 2 decimales si pasan de un centavo, con precisión de µUSD si no. */
export function totalKind(micros: number): MoneyKind {
  return Math.abs(micros) > 0 && Math.abs(micros) < 10_000 ? "cost" : "balance";
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

/** Fracción como porcentaje: `0.34` → `34%` / `34 %`. Para el uso del plan. */
export function formatPercent(fraction: number, locale: string, maximumFractionDigits = 0) {
  return cached(
    `percent:${locale}:${maximumFractionDigits}`,
    () => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits }),
  ).format(fraction);
}

/** Fecha con hora en UTC (`Nov 15, 2026, 03:20 PM UTC`). Igual en servidor y navegador. */
export function formatDateTime(date: Date | string, locale: string) {
  return cached(
    `datetime:${locale}`,
    () => new Intl.DateTimeFormat(locale, {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
    }),
  ).format(typeof date === "string" ? new Date(date) : date);
}

/** Duración hasta un reinicio, con las dos unidades mayores: `2h 41m` / `2h 41min`, `3d 4h`. */
export function formatDuration(ms: number, locale: string) {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const unit = (value: number, name: "day" | "hour" | "minute") => cached(
    `duration:${locale}:${name}`,
    () => new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "narrow" }),
  ).format(value);
  if (days > 0) return `${unit(days, "day")} ${unit(hours, "hour")}`;
  if (hours > 0) return `${unit(hours, "hour")} ${unit(rest, "minute")}`;
  return unit(rest, "minute");
}

/** Latencia: `1,234 ms` / `1234 ms`. */
export function formatMilliseconds(ms: number, locale: string) {
  return cached(
    `ms:${locale}`,
    () => new Intl.NumberFormat(locale, { style: "unit", unit: "millisecond", unitDisplay: "short", maximumFractionDigits: 0 }),
  ).format(ms);
}
