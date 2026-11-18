import type { UpstreamAccounts } from "./types";

/**
 * Rotación de cuentas en memoria (docs/07 › Varias cuentas por upstream). Cada request empieza en la cuenta
 * siguiente a la del anterior. Una cuenta pausada no se descarta: pasa al final, así que si todas lo están
 * se siguen probando, de la que se libera antes a la que tarda más.
 */
export function createAccountRotation(
  { now = Date.now, random = Math.random }: { now?: () => number; random?: () => number } = {},
): UpstreamAccounts {
  const cursors = new Map<string, number>();
  const pausedUntil = new Map<string, number>();
  const slot = (upstreamId: string, index: number) => `${upstreamId}#${index}`;

  return {
    order(upstreamId, count) {
      if (count <= 0) return [];
      // Al azar al arrancar: si cada instancia nueva empezara en la primera, esa cargaría con más tráfico.
      const start = (cursors.get(upstreamId) ?? Math.floor(random() * count)) % count;
      cursors.set(upstreamId, (start + 1) % count);
      const at = now();
      const until = (index: number) => {
        const value = pausedUntil.get(slot(upstreamId, index)) ?? 0;
        return value > at ? value : 0;
      };
      // `sort` es estable: las activas (0) conservan el orden de la rotación.
      return Array.from({ length: count }, (_, offset) => (start + offset) % count)
        .sort((a, b) => until(a) - until(b));
    },
    pause(upstreamId, index, ms) {
      const key = slot(upstreamId, index);
      pausedUntil.set(key, Math.max(pausedUntil.get(key) ?? 0, now() + ms));
    },
  };
}

/** Sin rotación ni pausas: el orden escrito. Para quien llama a `callUpstream` sin estado (pruebas, scripts). */
export const ACCOUNTS_IN_ORDER: UpstreamAccounts = {
  order: (_upstreamId, count) => Array.from({ length: Math.max(0, count) }, (_, index) => index),
  pause: () => {},
};
