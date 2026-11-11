// @vitest-environment node
import { describe, expect, it } from "vitest";

import { readSecret, readServerEnv, upstreamBaseUrlOverride } from "@/lib/env";

describe("readServerEnv", () => {
  it("las variables vacías cuentan como ausentes, así .env.example se puede copiar tal cual", () => {
    const env = readServerEnv({ API_HOST: "", INTERNAL_REVALIDATE_SECRET: "", DATABASE_URL: "postgres://x" });
    expect(env).toMatchObject({ apiHost: null, internalRevalidateSecret: null, databaseUrl: "postgres://x" });
  });

  it("VERCEL_ENV manda sobre APP_ENV, y NODE_ENV no cuenta", () => {
    expect(readServerEnv({ NODE_ENV: "production" }).isProduction).toBe(false);
    expect(readServerEnv({ APP_ENV: "preview" }).appEnv).toBe("preview");
    expect(readServerEnv({ APP_ENV: "development", VERCEL_ENV: "preview" }).appEnv).toBe("preview");
  });

  it("en producción exige la base y el secreto, y rechaza el mock", () => {
    expect(() => readServerEnv({ APP_ENV: "production" })).toThrow(/DATABASE_URL, INTERNAL_REVALIDATE_SECRET/);
    const ok = { APP_ENV: "production", DATABASE_URL: "postgres://x", INTERNAL_REVALIDATE_SECRET: "s".repeat(16) };
    expect(readServerEnv(ok).isProduction).toBe(true);
    expect(() => readServerEnv({ ...ok, UPSTREAM_MOCK_BASE_URL: "http://127.0.0.1:4010/v1" })).toThrow(/mock/i);
  });

  it("el rate limit tiene default de 60 y acepta override", () => {
    expect(readServerEnv({}).rateLimitRpm).toBe(60);
    expect(readServerEnv({ GATEWAY_RATE_LIMIT_RPM: "120" }).rateLimitRpm).toBe(120);
  });
});

describe("secretos y overrides", () => {
  it("readSecret trata vacío como ausente", () => {
    expect(readSecret("X", { X: "" })).toBeNull();
    expect(readSecret("X", { X: "v" })).toBe("v");
  });

  it("el override de base URL sigue la convención UPSTREAM_<ID>_BASE_URL", () => {
    expect(upstreamBaseUrlOverride("mock", { UPSTREAM_MOCK_BASE_URL: "http://127.0.0.1:1/v1" })).toBe("http://127.0.0.1:1/v1");
    expect(upstreamBaseUrlOverride("my-up.1", { UPSTREAM_MY_UP_1_BASE_URL: "u" })).toBe("u");
  });
});
