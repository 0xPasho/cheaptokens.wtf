import { z } from "zod";

/**
 * Variables de entorno del servidor (ADR-0028, ADR-0032). Nunca se importa desde un Client Component.
 * Los nombres de las keys de upstream no están aquí: cada upstream declara su `apiKeyEnv` y se lee con `readSecret`.
 */
const appEnvSchema = z.enum(["development", "preview", "production"]);

const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().optional(),
  /** Lo pone Vercel. Fuera de Vercel, `APP_ENV`. `NODE_ENV` no sirve: `next start` lo pone en production. */
  VERCEL_ENV: appEnvSchema.optional(),
  APP_ENV: appEnvSchema.optional(),
  INTERNAL_REVALIDATE_SECRET: z.string().min(16).optional(),
  /** Host del gateway (`api.cheaptokens.wtf`). Si falta, se acepta cualquier host. */
  API_HOST: z.string().min(1).optional(),
  GATEWAY_RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

export interface ServerEnv {
  appEnv: AppEnv;
  isProduction: boolean;
  databaseUrl: string | null;
  databasePoolMax: number | null;
  internalRevalidateSecret: string | null;
  apiHost: string | null;
  rateLimitRpm: number;
}

export type EnvSource = Record<string, string | undefined>;

export function readServerEnv(source: EnvSource = process.env): ServerEnv {
  // Una variable vacía (`API_HOST=` en .env.local) cuenta como ausente, igual que en `readSecret`.
  const present = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const parsed = schema.parse(present);
  const appEnv = parsed.VERCEL_ENV ?? parsed.APP_ENV ?? "development";
  const isProduction = appEnv === "production";

  if (isProduction) {
    const missing = (["DATABASE_URL", "INTERNAL_REVALIDATE_SECRET"] as const).filter((name) => !parsed[name]);
    if (missing.length > 0) throw new Error(`Missing required env vars in production: ${missing.join(", ")}`);
    // El mock nunca existe en producción (docs/07 › Tests automáticos).
    if (source.UPSTREAM_MOCK_BASE_URL) throw new Error("UPSTREAM_MOCK_BASE_URL must not be set in production");
  }

  return {
    appEnv,
    isProduction,
    databaseUrl: parsed.DATABASE_URL ?? null,
    databasePoolMax: parsed.DATABASE_POOL_MAX ?? null,
    internalRevalidateSecret: parsed.INTERNAL_REVALIDATE_SECRET ?? null,
    apiHost: parsed.API_HOST ?? null,
    rateLimitRpm: parsed.GATEWAY_RATE_LIMIT_RPM,
  };
}

/** Lee un secreto por nombre (por ejemplo `UPSTREAM_INFERHUB_API_KEY`). Vacío cuenta como ausente. */
export function readSecret(name: string, source: EnvSource = process.env): string | null {
  const value = source[name];
  return value ? value : null;
}

/** `UPSTREAM_<ID>_BASE_URL`: permite apuntar un upstream a otra URL (los tests apuntan el mock a su puerto). */
export function upstreamBaseUrlOverride(upstreamId: string, source: EnvSource = process.env): string | null {
  const name = `UPSTREAM_${upstreamId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_BASE_URL`;
  return readSecret(name, source);
}
