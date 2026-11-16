// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getAuthMode } from "@/lib/auth/mode";
import { proxy } from "@/proxy";

const event = { waitUntil() {} } as never;
const run = (path: string, cookie?: string) =>
  proxy(new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }), event) as Response | undefined;

describe("modo de inicio de sesión", () => {
  it("Clerk con sus dos claves; desarrollo sin ellas; nada en preview o producción", () => {
    expect(getAuthMode({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk", CLERK_SECRET_KEY: "sk", APP_ENV: "production" })).toBe("clerk");
    expect(getAuthMode({ APP_ENV: "development" })).toBe("dev");
    expect(getAuthMode({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk", APP_ENV: "development" })).toBe("dev");
    expect(getAuthMode({ VERCEL_ENV: "preview" })).toBe("none");
    // Un deploy propio sin APP_ENV no hereda el modo de desarrollo; `next dev` sí.
    expect(getAuthMode({ NODE_ENV: "production" })).toBe("none");
    expect(getAuthMode({ NODE_ENV: "development" })).toBe("dev");
    expect(getAuthMode({ VERCEL_ENV: "development", APP_ENV: "development" })).toBe("none");
  });
});

describe("proxy sin Clerk (modo de desarrollo)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("manda el dashboard a iniciar sesión y conserva a dónde ibas", () => {
    vi.stubEnv("APP_ENV", "development");
    const response = run("/es/dashboard/usage?range=30d");
    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe("http://localhost/es/sign-in?redirect_url=%2Fes%2Fdashboard%2Fusage%3Frange%3D30d");
  });

  it("deja pasar el dashboard con sesión y no toca las páginas públicas", () => {
    vi.stubEnv("APP_ENV", "development");
    expect(run("/es/dashboard", "ct_dev_session=ana")).toBeUndefined();
    expect(run("/es/models")).toBeUndefined();
    expect(run("/es/dashboard", "ct_dev_session=..%2F..")?.status).toBe(307);
  });

  it("sigue redirigiendo las rutas sin idioma", () => {
    vi.stubEnv("APP_ENV", "development");
    expect(run("/dashboard")?.headers.get("location")).toMatch(/\/(en|es)\/dashboard$/);
  });
});
