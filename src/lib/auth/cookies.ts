/**
 * Cookies del modo de desarrollo (ADR-0050). Módulo sin dependencias: lo comparten el proxy,
 * las server actions y el cliente.
 */
/** La sesión: httpOnly. Es lo único que autoriza. */
export const DEV_SESSION_COOKIE = "ct_dev_session";
/** Pista visible para pintar el menú de cuenta en páginas estáticas. No autoriza nada. */
export const DEV_IDENTITY_COOKIE = "ct_dev_identity";
