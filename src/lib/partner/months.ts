/** Meses UTC de la puerta de socios (docs/17): `YYYY-MM` en la API, el primer día (`YYYY-MM-01`) en la base. */

/** Un mes como lo nombra `?month=`: `2026-11`. */
export const USAGE_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function usageMonth(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/** La columna `date` de las tablas por mes. */
export function monthDate(month: string): string {
  return `${month}-01`;
}

/** Del primer instante del mes al primero del siguiente, sin incluirlo. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [year, index] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(year, index - 1, 1)), end: new Date(Date.UTC(year, index, 1)) };
}
