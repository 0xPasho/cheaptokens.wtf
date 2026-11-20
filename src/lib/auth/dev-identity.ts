/**
 * Nombre del modo de desarrollo (ADR-0050): letras, números, `.`, `_`, `-`, `@`. El workspace queda
 * como `dev:<nombre>`, igual que en `pnpm keys:create`. Módulo sin dependencias: lo usan el proxy,
 * las server actions y la ventana de acceso en el navegador.
 */
export const DEV_IDENTITY_PATTERN = /^[a-z0-9._@-]{1,64}$/;

/** Como se guarda: sin espacios alrededor y en minúsculas. */
export function normalizeDevIdentity(value: string): string {
  return value.trim().toLowerCase();
}

export function isDevIdentity(value: string): boolean {
  return DEV_IDENTITY_PATTERN.test(value);
}

/** El código que el modo de desarrollo rechaza, para poder ver el error de código incorrecto. Cualquier otro entra. */
export const DEV_WRONG_CODE = "000000";
