import type { RateLimiter } from "./types";

const WINDOW_MS = 60_000;

export function createMemoryRateLimiter(options: { now?: () => number } = {}): RateLimiter {
  const now = options.now ?? Date.now;
  const windows = new Map<string, number[]>();

  return {
    async limit(key, perMinute) {
      if (!Number.isSafeInteger(perMinute) || perMinute < 1) {
        throw new RangeError("perMinute must be a positive safe integer");
      }

      const currentTime = now();
      const cutoff = currentTime - WINDOW_MS;

      // También borramos workspaces inactivos: limpiar solo la key actual acumularía entradas.
      for (const [storedKey, timestamps] of windows) {
        if (timestamps[timestamps.length - 1] <= cutoff) windows.delete(storedKey);
      }

      const timestamps = (windows.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
      windows.set(key, timestamps);

      if (timestamps.length >= perMinute) {
        return {
          ok: false,
          retryAfterSeconds: Math.max(1, Math.ceil((timestamps[0] + WINDOW_MS - currentTime) / 1000)),
        };
      }

      // Se registra antes de devolver la promesa para que llamadas simultáneas compartan el límite.
      timestamps.push(currentTime);
      return { ok: true, remaining: perMinute - timestamps.length };
    },
  };
}
