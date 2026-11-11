import { fetchUpstream } from "./upstream-fetch";
import type { CallUpstream, LogFields, UpstreamFailure, UpstreamTarget } from "./types";

export const callUpstream: CallUpstream = async (options) => {
  options.signal?.throwIfAborted();
  const startedAt = options.now();
  const targets = options.model.upstreams.slice(0, options.maxAttempts ?? 3);
  let lastTarget: UpstreamTarget | null = null;
  let lastFailure: UpstreamFailure | null = null;
  let allTimedOut = true;
  let attempts = 0;

  for (const target of targets) {
    options.signal?.throwIfAborted();
    const attemptStartedAt = options.now();
    attempts++;
    lastTarget = target;
    const result = await fetchUpstream(options, target);
    if (result.ok) {
      return { ...result, target, attempts, ttfbMs: options.now() - startedAt };
    }
    lastFailure = result.failure;
    allTimedOut &&= result.failure.kind === "timeout";
    const fields: LogFields = {
      upstreamId: target.upstreamId,
      attempt: attempts,
      durationMs: options.now() - attemptStartedAt,
    };
    if (result.failure.kind === "http") {
      const { status, code } = result.failure;
      fields.status = status;
      fields.code = code;
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
