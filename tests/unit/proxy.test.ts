// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getAuthMode } from "@/lib/auth/mode";
import { proxy } from "@/proxy";

const event = { waitUntil() {} } as never;
const run = (path: string, cookie?: string, method = "GET") =>
  proxy(new NextRequest(`http://localhost${path}`, { method, headers: cookie ? { cookie } : {} }), event) as Response | undefined;

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

describe("la ventana de acceso con sesión abierta (ADR-0063)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const location = (path: string, cookie?: string) => run(path, cookie)?.headers.get("location");

  it("manda a donde ibas, o al dashboard si no ibas a ningún lado", () => {
    vi.stubEnv("APP_ENV", "development");
    expect(location("/es/sign-in", "ct_dev_session=ana")).toBe("http://localhost/es/dashboard");
    expect(location("/en/sign-up", "ct_dev_session=ana")).toBe("http://localhost/en/dashboard");
    // «Obtén tu API key» apunta a /sign-up con la ruta de las keys: quien ya entró llega directo.
    expect(location("/es/sign-up?redirect_url=%2Fes%2Fdashboard%2Fkeys", "ct_dev_session=ana")).toBe("http://localhost/es/dashboard/keys");
  });

  it("nunca sale del sitio ni vuelve a la propia ventana", () => {
    vi.stubEnv("APP_ENV", "development");
    expect(location("/es/sign-in?redirect_url=https%3A%2F%2Fevil.example", "ct_dev_session=ana")).toBe("http://localhost/es/dashboard");
    expect(location("/es/sign-in?redirect_url=%2F%2Fevil.example", "ct_dev_session=ana")).toBe("http://localhost/es/dashboard");
    expect(location("/es/sign-in?redirect_url=%2Fes%2Fsign-up", "ct_dev_session=ana")).toBe("http://localhost/es/dashboard");
    expect(location("/es/sign-in?redirect_url=%2Fen%2Fdashboard", "ct_dev_session=ana")).toBe("http://localhost/es/dashboard");
  });

  it("solo redirige las visitas: una server action enviada desde la ventana llega aunque ya haya sesión", () => {
    vi.stubEnv("APP_ENV", "development");
    // Clerk envía una al abrir la sesión, y el modo de desarrollo la suya: redirigirlas las rompería.
    expect(run("/es/sign-in?redirect_url=%2Fes%2Fmodels", "ct_dev_session=ana", "POST")).toBeUndefined();
    expect(run("/es/sign-up", "ct_dev_session=ana", "POST")).toBeUndefined();
    expect(location("/es/sign-in", "ct_dev_session=ana")).toBe("http://localhost/es/dashboard");
    expect(run("/es/sign-in", "ct_dev_session=ana", "HEAD")?.status).toBe(307);
  });

  it("sin sesión, o con una cookie inválida, la ventana se queda", () => {
    vi.stubEnv("APP_ENV", "development");
    expect(run("/es/sign-in")).toBeUndefined();
    expect(run("/es/sign-up?redirect_url=%2Fes%2Fdashboard", "ct_dev_session=..%2F..")).toBeUndefined();
  });

  it("fuera de desarrollo local la cookie de desarrollo no cuenta como sesión", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(run("/es/sign-in", "ct_dev_session=ana")).toBeUndefined();
  });
});
