/**
 * Errores de la puerta de socios (docs/17). El socio solo lee el status. El cuerpo es fijo: nunca lleva una
 * key, un dato del request ni el nombre de un upstream.
 */

export const PARTNER_ERROR_STATUS = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  method_not_allowed: 405,
  /** Un plan cerrado, o una `Idempotency-Key` que todavía no se puede contestar. */
  conflict: 409,
  request_too_large: 413,
  idempotency_key_reused: 422,
  internal_error: 500,
} as const;

export type PartnerErrorCode = keyof typeof PARTNER_ERROR_STATUS;

const MESSAGES: Record<PartnerErrorCode, string> = {
  invalid_request: "The request is invalid.",
  unauthorized: "The partner credential is missing or invalid.",
  not_found: "Not found.",
  method_not_allowed: "Method not allowed.",
  conflict: "The request conflicts with the current state of the plan.",
  request_too_large: "The request body is too large.",
  idempotency_key_reused: "This Idempotency-Key was already used with a different request.",
  internal_error: "The request could not be completed.",
};

export class PartnerDoorError extends Error {
  constructor(readonly code: PartnerErrorCode) {
    super(MESSAGES[code]);
    this.name = "PartnerDoorError";
  }
}

export function partnerErrorResponse(code: PartnerErrorCode): Response {
  return Response.json({ error: { code, message: MESSAGES[code] } }, {
    status: PARTNER_ERROR_STATUS[code],
    headers: { "cache-control": "no-store" },
  });
}
