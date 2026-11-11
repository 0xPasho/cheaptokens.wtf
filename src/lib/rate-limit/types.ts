/** Rate limit por workspace (ADR-0017). En memoria en desarrollo y pruebas; Upstash en el plan de deploy. */
export type RateLimitDecision = { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Ventana deslizante de 60 s. `key` es el ID del workspace. */
  limit(key: string, perMinute: number): Promise<RateLimitDecision>;
}
