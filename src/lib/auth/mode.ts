import { type EnvSource, readServerEnv } from "@/lib/env";

/**
 * Cómo se inicia sesión (ADR-0003, ADR-0050):
 * - `clerk`: con las dos claves de Clerk. Es el único modo de preview y producción.
 * - `dev`: sin Clerk y solo en desarrollo local (`isLocalDevelopment`). Entras con un nombre; para trabajar en local y en las pruebas.
 * - `none`: preview o producción sin Clerk. No se puede entrar.
 */
export type AuthMode = "clerk" | "dev" | "none";

export function getAuthMode(source: EnvSource = process.env): AuthMode {
  if (source.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && source.CLERK_SECRET_KEY) return "clerk";
  return isLocalDevelopment(source) ? "dev" : "none";
}

/**
 * Desarrollo local de verdad: `APP_ENV=development` explícito, o `next dev` sin APP_ENV, y nunca en Vercel.
 * No basta con el default de `readServerEnv` (development si falta todo): un deploy propio sin APP_ENV
 * quedaría con el login y los pagos de desarrollo.
 */
export function isLocalDevelopment(source: EnvSource = process.env): boolean {
  if (source.VERCEL_ENV || readServerEnv(source).appEnv !== "development") return false;
  return source.APP_ENV === "development" || (!source.APP_ENV && source.NODE_ENV === "development");
}

/** Nombre del modo de desarrollo: letras, números, `.`, `_`, `-`, `@`. El workspace queda como `dev:<nombre>`, igual que en `pnpm keys:create`. */
export const DEV_IDENTITY_PATTERN = /^[a-z0-9._@-]{1,64}$/;
