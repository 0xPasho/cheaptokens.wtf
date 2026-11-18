import { ACCOUNTS_IN_ORDER } from "./accounts";
import { fetchUpstream } from "./upstream-fetch";
import type { CallUpstream, LogFields, UpstreamFailure, UpstreamTarget } from "./types";

/** Cuánto pasa al final de la rotación una cuenta que falló por algo suyo (docs/07 › Varias cuentas por upstream). */
export const ACCOUNT_PAUSE_MS = {
  /** `429`: el rate limit de InferHub es por cuenta y por minuto. */
  rateLimited: 60_000,
  /** `401`, `403` o `402` por saldo: se arregla a mano. Se vuelve a probar en 5 minutos por si ya se arregló. */
  rejected: 300_000,
} as const;

/** Null si el fallo es del upstream y no de la cuenta: con otra key del mismo upstream sería igual. */
function accountPauseMs(failure: UpstreamFailure): number | null {
  if (failure.kind !== "http") return null;
  if (failure.status === 429) return ACCOUNT_PAUSE_MS.rateLimited;
  if (failure.status === 401 || failure.status === 403) return ACCOUNT_PAUSE_MS.rejected;
  // `no_provider_under_bid` es del mercado, no del saldo: ninguna otra cuenta encontraría vendedor.
  if (failure.status === 402 && failure.code !== "no_provider_under_bid") return ACCOUNT_PAUSE_MS.rejected;
  return null;
}

export const callUpstream: CallUpstream = async (options) => {
  options.signal?.throwIfAborted();
  const startedAt = options.now();
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const accounts = options.accounts ?? ACCOUNTS_IN_ORDER;
  let lastTarget: UpstreamTarget | null = null;
  let lastFailure: UpstreamFailure | null = null;
  let allTimedOut = true;
  let attempts = 0;

  for (const target of options.model.upstreams) {
    if (attempts >= maxAttempts) break;
    // Sin keys (el mock) hay un solo intento, sin `Authorization`.
    const order = target.apiKeys.length === 0 ? [null] : accounts.order(target.upstreamId, target.apiKeys.length);
    for (const index of order) {
      if (attempts >= maxAttempts) break;
      options.signal?.throwIfAborted();
      const attemptStartedAt = options.now();
      attempts++;
      lastTarget = target;
      options.onAttempt?.(target);
      const result = await fetchUpstream(options, target, index === null ? null : target.apiKeys[index]);
      if (result.ok) {
        return { ...result, target, attempts, ttfbMs: options.now() - startedAt };
      }
      lastFailure = result.failure;
      allTimedOut &&= result.failure.kind === "timeout";
      const fields: LogFields = {
        upstreamId: target.upstreamId,
        attempt: attempts,
        kind: result.failure.kind,
        durationMs: options.now() - attemptStartedAt,
      };
      // La posición de la key, empezando en 1: dice qué cuenta revisar sin mostrar la key.
      if (index !== null) fields.account = index + 1;
      if (result.failure.kind === "http") {
        const { status, code } = result.failure;
        fields.status = status;
        fields.code = code?.slice(0, 64) ?? null;
        if (status === 400 || status === 422) {
          return {
            ok: false, attempts, target, failure: result.failure,
            errorCode: "invalid_request", clientMessage: result.clientMessage,
          };
        }
        if (status === 401 || status === 403 || status === 404 || (status === 402 && code !== "no_provider_under_bid")) {
          options.log.error("upstream_alert", { ...fields, severity: status === 402 ? "critical" : "warning" });
        } else {
          options.log.warn("upstream_failure", fields);
        }
      } else {
        if (result.failure.kind === "timeout") fields.phase = result.failure.phase;
        options.log.warn("upstream_failure", fields);
      }
      const pauseMs = accountPauseMs(result.failure);
      // Red, timeout, 5xx o 404 serían iguales con otra cuenta: se pasa al siguiente upstream.
      if (pauseMs === null || index === null) break;
      accounts.pause(target.upstreamId, index, pauseMs);
    }
  }

  return {
    ok: false,
    attempts,
    target: lastTarget,
    failure: lastFailure,
    errorCode: attempts === 0 ? "no_upstream_available" : allTimedOut ? "upstream_timeout" : "upstream_error",
    clientMessage: null,
  };
};
