// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clerkErrorCode, clerkFailure, createClerkDriver, type SignInLike, type SignUpLike, TRANSFER_TO_SIGN_UP } from "@/lib/auth/clerk-flow";
import { DEV_SESSION_COOKIE, DEV_IDENTITY_COOKIE } from "@/lib/auth/cookies";
import { DEV_WRONG_CODE, isDevIdentity, normalizeDevIdentity } from "@/lib/auth/dev-identity";
import { CODE_LENGTH, isCompleteCode, isEmail, onlyDigits, secondsUntil, withDeadline } from "@/lib/auth/flow";
import { authHref, getKeyHref, isAuthPath, safeRedirectPath, viewFromPath, viewPath } from "@/lib/auth/redirect";
import { en } from "@/lib/i18n/dictionaries/en";
import { es } from "@/lib/i18n/dictionaries/es";

/** La ventana única de acceso (ADR-0063): la lógica que no depende de React. */

describe("correo y código", () => {
  it("un correo necesita arroba, dominio con punto y nada de espacios", () => {
    for (const ok of ["ana@example.com", "  ana@example.com  ", "a.b+c@sub.dominio.mx"]) expect(isEmail(ok), ok).toBe(true);
    for (const bad of ["", "ana", "ana@", "ana@example", "@example.com", "ana @example.com", "ana@exa mple.com"]) expect(isEmail(bad), bad).toBe(false);
  });

  it("el código pegado se queda con sus dígitos, hasta seis", () => {
    expect(CODE_LENGTH).toBe(6);
    expect(onlyDigits("123-456")).toBe("123456");
    expect(onlyDigits(" 123 456 ")).toBe("123456");
    expect(onlyDigits("Tu código es 9876543210")).toBe("987654");
    expect(isCompleteCode("123456")).toBe(true);
    for (const bad of ["12345", "1234567", "12345a", ""]) expect(isCompleteCode(bad), bad).toBe(false);
  });

  it("la espera para reenviar redondea hacia arriba y nunca es negativa", () => {
    expect(secondsUntil(30_000, 0)).toBe(30);
    expect(secondsUntil(30_000, 29_100)).toBe(1);
    expect(secondsUntil(30_000, 30_000)).toBe(0);
    expect(secondsUntil(30_000, 99_000)).toBe(0);
  });

  it("una espera con límite responde lo que llegue a tiempo y, si no llega, deja de esperar", async () => {
    vi.useFakeTimers();
    await expect(withDeadline(Promise.resolve("a tiempo"), 1000, "tarde")).resolves.toBe("a tiempo");
    // Al responder a tiempo no queda ningún temporizador pendiente.
    expect(vi.getTimerCount()).toBe(0);
    await expect(withDeadline(Promise.reject(new Error("falló")), 1000, "tarde")).rejects.toThrow("falló");

    const slow = withDeadline(new Promise<string>(() => {}), 1000, "tarde");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(slow).resolves.toBe("tarde");
  });

  it("los textos dicen cuántos dígitos con un marcador, no con un número fijo", () => {
    for (const auth of [en.auth, es.auth]) {
      for (const text of [auth.email.hint, auth.code.description, auth.code.incomplete, auth.dev.codeDescription]) expect(text).toContain("{digits}");
      expect(auth.code.description).toContain("{email}");
      expect(auth.code.resendIn).toContain("{time}");
      // El modo de desarrollo dice cuál es el código que rechaza.
      expect(auth.dev.codeDescription).toContain(DEV_WRONG_CODE);
    }
  });
});

describe("a dónde se va después de entrar", () => {
  it("solo acepta rutas propias del mismo idioma", () => {
    expect(safeRedirectPath("/es/dashboard/keys", "es")).toBe("/es/dashboard/keys");
    expect(safeRedirectPath("/es/models?tags=coding", "es")).toBe("/es/models?tags=coding");
    for (const bad of [null, undefined, "", "https://evil.example", "//evil.example", "/en/dashboard", "/es\\evil", "dashboard", "/es"]) {
      expect(safeRedirectPath(bad, "es"), String(bad)).toBe("/es/dashboard");
    }
  });

  it("revisa la ruta ya resuelta, como la va a leer el navegador", () => {
    // Los puntos (también codificados) no sirven para salir del idioma ni para volver a la ventana.
    for (const bad of ["/es/../en/dashboard", "/es/%2e%2e/en/dashboard", "/es/models/../../en", "/es/./sign-in", "/es/x/../sign-up?a=1"]) {
      expect(safeRedirectPath(bad, "es"), bad).toBe("/es/dashboard");
    }
    // El navegador descarta tabuladores y saltos de línea: esto sería `//evil.example`.
    expect(safeRedirectPath("/\t/evil.example", "es")).toBe("/es/dashboard");
    expect(safeRedirectPath("/\n/evil.example", "es")).toBe("/es/dashboard");
    // Lo que se queda dentro del idioma sale resuelto, con sus parámetros y su ancla.
    expect(safeRedirectPath("/es/models/../dashboard/keys", "es")).toBe("/es/dashboard/keys");
    expect(safeRedirectPath("/es/docs?tab=api#streaming", "es")).toBe("/es/docs?tab=api#streaming");
  });

  it("no vuelve a la propia ventana de acceso", () => {
    expect(safeRedirectPath("/es/sign-in", "es")).toBe("/es/dashboard");
    expect(safeRedirectPath("/es/sign-up?redirect_url=%2Fes%2Fsign-in", "es")).toBe("/es/dashboard");
    expect(isAuthPath("/es/sign-in")).toBe(true);
    expect(isAuthPath("/en/sign-up?redirect_url=x")).toBe(true);
    expect(isAuthPath("/es/sign-in/factor-one")).toBe(false);
    expect(isAuthPath("/es/models")).toBe(false);
  });

  it("«Obtén tu API key» abre la ventana en modo crear cuenta y vuelve a las keys", () => {
    expect(getKeyHref("es")).toBe("/es/sign-up?redirect_url=%2Fes%2Fdashboard%2Fkeys");
    expect(authHref("en", "sign-in")).toBe("/en/sign-in");
  });

  it("la vista sale de la URL y cambiarla conserva los parámetros", () => {
    expect(viewFromPath("/es/sign-up")).toBe("sign-up");
    expect(viewFromPath("/es/sign-in")).toBe("sign-in");
    expect(viewFromPath("/es/dashboard")).toBe("sign-in");
    expect(viewPath("es", "sign-up", "?redirect_url=%2Fes%2Fdashboard")).toBe("/es/sign-up?redirect_url=%2Fes%2Fdashboard");
  });
});

describe("nombre del modo de desarrollo", () => {
  it("se guarda sin espacios y en minúsculas", () => {
    expect(normalizeDevIdentity("  Ana@Example.com ")).toBe("ana@example.com");
    expect(isDevIdentity("ana")).toBe(true);
    expect(isDevIdentity("ana@example.com")).toBe(true);
    for (const bad of ["", "Ana", "ana maria", "ana!", "a".repeat(65), "../.."]) expect(isDevIdentity(bad), bad).toBe(false);
  });
});

// ── Clerk ──

type Result = { error: unknown };
const ok: Result = { error: null };
/** Un error con la forma de `ClerkAPIResponseError`: el código real va en `errors[0].code`. */
const apiError = (code: string): Result => ({ error: { code: "api_response_error", errors: [{ code }] } });

function fakeClerk(script: {
  create?: Result; send?: Result[]; verify?: Result[]; signInStatus?: string;
  transfer?: Result; signUpStatus?: string; missingFields?: string[];
  finalize?: Result; task?: unknown;
  /** Si el script de Clerk cargó. Sin él, el flujo no pregunta. */
  loaded?: boolean;
  /** Cómo falla descartar un intento cuando Clerk todavía no tiene cliente. */
  reset?: "throws" | "rejects";
} = {}) {
  const calls: string[] = [];
  const session = { currentTask: script.task };
  const finalize = (name: string) => async ({ navigate }: { navigate: (params: { session: typeof session; decorateUrl: (url: string) => string }) => unknown }) => {
    calls.push(name);
    const result = script.finalize ?? ok;
    if (!result.error) await navigate({ session, decorateUrl: (url) => `decorated:${url}` });
    return result;
  };
  const sends = [...(script.send ?? [])];
  const verifies = [...(script.verify ?? [])];
  let signInStatus = "needs_identifier";
  let signUpStatus: string | null = null;
  const signIn: SignInLike = {
    get status() { return signInStatus; },
    async create(params) {
      calls.push(`signIn.create:${params.identifier}:${params.signUpIfMissing}`);
      signInStatus = "needs_first_factor";
      return script.create ?? ok;
    },
    emailCode: {
      async sendCode() { calls.push("sendCode"); return sends.shift() ?? ok; },
      async verifyCode({ code }) {
        calls.push(`verifyCode:${code}`);
        const result = verifies.shift() ?? ok;
        if (!result.error) signInStatus = script.signInStatus ?? "complete";
        return result;
      },
    },
    finalize: finalize("signIn.finalize"),
    reset() {
      calls.push("signIn.reset");
      // Así falla el `reset` real de Clerk sin cliente: lanza en el acto, no devuelve una promesa rechazada.
      if (script.reset === "throws") throw new Error("Cannot reset sign-in without a client.");
      return script.reset === "rejects" ? Promise.reject(new Error("Cannot reset sign-in without a client.")) : Promise.resolve(ok);
    },
  };
  const signUp: SignUpLike = {
    get status() { return signUpStatus; },
    get missingFields() { return script.missingFields ?? []; },
    async create(params) {
      calls.push(`signUp.create:transfer=${params.transfer}:${params.locale}`);
      const result = script.transfer ?? ok;
      if (!result.error) signUpStatus = script.signUpStatus ?? "complete";
      return result;
    },
    finalize: finalize("signUp.finalize"),
    reset() {
      calls.push("signUp.reset");
      return script.reset === "rejects" ? Promise.reject(new Error("Cannot reset sign-up without a client.")) : Promise.resolve(ok);
    },
  };
  const navigated: string[] = [];
  const reports: string[] = [];
  const driver = createClerkDriver({
    signIn: () => signIn,
    signUp: () => signUp,
    locale: "es",
    navigate: (decorateUrl) => { navigated.push(decorateUrl("/es/dashboard")); },
    report: (message) => { reports.push(message); },
    ...(script.loaded === undefined ? {} : { loaded: async () => script.loaded! }),
  });
  return { driver, calls, navigated, reports };
}

describe("flujo de Clerk: entrar o crear cuenta con el mismo código", () => {
  it("envía el código sin preguntar si el correo tiene cuenta (signUpIfMissing)", async () => {
    const { driver, calls } = fakeClerk();
    expect(await driver.start("ana@example.com")).toEqual({ ok: true });
    expect(calls).toEqual(["signIn.create:ana@example.com:true", "sendCode"]);
  });

  it("correo con cuenta: verifica, cierra el intento de entrar y navega", async () => {
    const { driver, calls, navigated } = fakeClerk();
    await driver.start("ana@example.com");
    expect(await driver.verify("424242")).toEqual({ ok: true, outcome: "existing" });
    expect(await driver.finish()).toEqual({ ok: true });
    expect(calls.slice(2)).toEqual(["verifyCode:424242", "signIn.finalize"]);
    // La ruta pasa por decorateUrl de Clerk antes de navegar.
    expect(navigated).toEqual(["decorated:/es/dashboard"]);
  });

  it("correo sin cuenta: el código verificado pasa a un registro y la cuenta nace ahí", async () => {
    const { driver, calls, navigated } = fakeClerk({ verify: [apiError(TRANSFER_TO_SIGN_UP)] });
    await driver.start("nuevo@example.com");
    expect(await driver.verify("424242")).toEqual({ ok: true, outcome: "new" });
    expect(await driver.finish()).toEqual({ ok: true });
    expect(calls.slice(2)).toEqual(["verifyCode:424242", "signUp.create:transfer=true:es", "signUp.finalize"]);
    expect(navigated).toEqual(["decorated:/es/dashboard"]);
  });

  it("si la instancia pide más datos al registrarse, no deja la cuenta a medias y lo avisa", async () => {
    const { driver, reports, calls } = fakeClerk({ verify: [apiError(TRANSFER_TO_SIGN_UP)], signUpStatus: "missing_requirements", missingFields: ["password"] });
    await driver.start("nuevo@example.com");
    expect(await driver.verify("424242")).toEqual({ ok: false, error: "unavailable" });
    expect(reports).toEqual(["Sign-up needs fields this window does not collect"]);
    expect(await driver.finish()).toEqual({ ok: false });
    expect(calls).not.toContain("signUp.finalize");
  });

  it("traduce los errores de Clerk a lo que la ventana sabe explicar", async () => {
    expect(clerkErrorCode(apiError("form_code_incorrect").error)).toBe("form_code_incorrect");
    expect(clerkErrorCode({ code: "clerk_offline" })).toBe("clerk_offline");
    expect(clerkErrorCode(null)).toBe("unknown");
    const cases: [string, string][] = [
      ["form_code_incorrect", "wrong-code"], ["verification_expired", "expired-code"], ["verification_failed", "expired-code"],
      ["too_many_requests", "too-many"], ["user_locked", "locked"], ["form_param_format_invalid", "invalid"],
      ["not_allowed_access", "not-allowed"], ["session_exists", "signed-in"],
      ["protect_check_aborted", "challenge"], ["captcha_invalid", "challenge"],
      ["algo_nuevo", "unavailable"],
    ];
    for (const [code, failure] of cases) expect(clerkFailure(apiError(code).error), code).toBe(failure);
  });

  it("si la verificación contra bots ni arranca, Clerk lanza un error sin código: también es esa verificación", () => {
    expect(clerkFailure(new Error("Captcha challenge failed"))).toBe("challenge");
    expect(clerkFailure({ code: "captcha_unavailable" })).toBe("challenge");
    // Un error cualquiera sin código sigue siendo «no disponible».
    expect(clerkFailure(new Error("Failed to fetch"))).toBe("unavailable");
    expect(clerkFailure("texto suelto")).toBe("unavailable");
  });

  it("si el script de Clerk no llegó a cargar, lo dice en vez de esperar una respuesta que no va a llegar", async () => {
    const blocked = fakeClerk({ loaded: false });
    expect(await blocked.driver.start("ana@example.com")).toEqual({ ok: false, error: "not-loaded" });
    expect(blocked.calls).toEqual([]);

    const ready = fakeClerk({ loaded: true });
    expect(await ready.driver.start("ana@example.com")).toEqual({ ok: true });
    expect(ready.calls).toEqual(["signIn.create:ana@example.com:true", "sendCode"]);
  });

  it("un código incorrecto no cierra el intento: el siguiente puede entrar", async () => {
    const { driver } = fakeClerk({ verify: [apiError("form_code_incorrect"), ok] });
    await driver.start("ana@example.com");
    expect(await driver.verify("000000")).toEqual({ ok: false, error: "wrong-code" });
    expect(await driver.verify("424242")).toEqual({ ok: true, outcome: "existing" });
  });

  it("los errores al empezar llegan tal cual: correo inválido, límite, sesión abierta", async () => {
    expect(await fakeClerk({ create: apiError("form_param_format_invalid") }).driver.start("x@y.z")).toEqual({ ok: false, error: "invalid" });
    expect(await fakeClerk({ send: [apiError("too_many_requests")] }).driver.start("ana@example.com")).toEqual({ ok: false, error: "too-many" });
    expect(await fakeClerk({ create: apiError("session_exists") }).driver.start("ana@example.com")).toEqual({ ok: false, error: "signed-in" });
  });

  it("reenviar usa el mismo intento y, si ya venció, empieza otro con el mismo correo", async () => {
    const fresh = fakeClerk();
    await fresh.driver.start("ana@example.com");
    expect(await fresh.driver.resend!()).toEqual({ ok: true });
    expect(fresh.calls).toEqual(["signIn.create:ana@example.com:true", "sendCode", "sendCode"]);

    const expired = fakeClerk({ send: [ok, apiError("client_state_invalid"), ok] });
    await expired.driver.start("ana@example.com");
    expect(await expired.driver.resend!()).toEqual({ ok: true });
    expect(expired.calls).toEqual(["signIn.create:ana@example.com:true", "sendCode", "sendCode", "signIn.create:ana@example.com:true", "sendCode"]);

    const limited = fakeClerk({ send: [ok, apiError("too_many_requests")] });
    await limited.driver.start("ana@example.com");
    expect(await limited.driver.resend!()).toEqual({ ok: false, error: "too-many" });
    expect(limited.calls).toHaveLength(3);
  });

  it("un paso que la ventana no resuelve (segundo factor) no se da por bueno", async () => {
    const { driver, reports } = fakeClerk({ signInStatus: "needs_second_factor" });
    await driver.start("ana@example.com");
    expect(await driver.verify("424242")).toEqual({ ok: false, error: "unavailable" });
    expect(reports).toEqual(["Sign-in needs a step this window does not handle"]);
  });

  it("no navega con la sesión a medias ni si cerrar el intento falla", async () => {
    const pending = fakeClerk({ task: { key: "choose-organization" } });
    await pending.driver.start("ana@example.com");
    await pending.driver.verify("424242");
    expect(await pending.driver.finish()).toEqual({ ok: false });
    expect(pending.navigated).toEqual([]);

    const failing = fakeClerk({ finalize: apiError("network_error") });
    await failing.driver.start("ana@example.com");
    await failing.driver.verify("424242");
    expect(await failing.driver.finish()).toEqual({ ok: false });
    expect(failing.navigated).toEqual([]);
  });

  it("sin código verificado no hay nada que cerrar, y volver al correo descarta los dos intentos", async () => {
    const { driver, calls } = fakeClerk();
    expect(await driver.finish()).toEqual({ ok: false });
    driver.reset();
    expect(calls).toEqual(["signIn.reset", "signUp.reset"]);
  });

  it("descartar un intento no rompe la ventana si Clerk todavía no tiene cliente", async () => {
    for (const reset of ["throws", "rejects"] as const) {
      const { driver, calls } = fakeClerk({ reset });
      expect(() => driver.reset()).not.toThrow();
      // Los dos intentos se descartan aunque el primero falle.
      expect(calls).toEqual(["signIn.reset", "signUp.reset"]);
      // Una promesa rechazada sin atender haría fallar la prueba.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
});

// ── Modo de desarrollo ──

const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => { jar.set(name, { value, options }); },
    delete: (name: string) => { jar.delete(name); },
  }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

describe("modo de desarrollo: el último paso abre la sesión", () => {
  beforeEach(() => jar.clear());
  afterEach(() => vi.unstubAllEnvs());

  const verify = async (input: Partial<{ locale: string; name: string; code: string; redirectUrl: string | null }>) => {
    const { devVerifyAction } = await import("@/app/[lang]/(site)/sign-in/actions");
    return devVerifyAction({ locale: "es", name: "ana", code: "123456", redirectUrl: null, ...input });
  };

  it("con un nombre válido y seis dígitos deja las dos cookies y dice a dónde ir", async () => {
    vi.stubEnv("APP_ENV", "development");
    expect(await verify({ name: " Ana@Example.com ", redirectUrl: "/es/dashboard/keys" })).toEqual({ ok: true, redirectTo: "/es/dashboard/keys" });
    expect(jar.get(DEV_SESSION_COOKIE)).toMatchObject({ value: "ana@example.com", options: { httpOnly: true, sameSite: "lax", path: "/" } });
    // La de identidad solo pinta el menú: no es httpOnly y no autoriza nada.
    expect(jar.get(DEV_IDENTITY_COOKIE)?.value).toBe("ana@example.com");
    expect(jar.get(DEV_IDENTITY_COOKIE)?.options.httpOnly).toBeUndefined();
  });

  it("rechaza el código de prueba, los incompletos y los nombres inválidos sin abrir sesión", async () => {
    vi.stubEnv("APP_ENV", "development");
    expect(await verify({ code: DEV_WRONG_CODE })).toEqual({ ok: false, error: "wrong-code" });
    expect(await verify({ code: "12345" })).toEqual({ ok: false, error: "wrong-code" });
    expect(await verify({ name: "no vale!" })).toEqual({ ok: false, error: "invalid" });
    expect(jar.size).toBe(0);
  });

  it("no acepta rutas ajenas como regreso ni un idioma que no existe", async () => {
    vi.stubEnv("APP_ENV", "development");
    expect(await verify({ redirectUrl: "https://evil.example" })).toEqual({ ok: true, redirectTo: "/es/dashboard" });
    expect(await verify({ locale: "fr", redirectUrl: "/fr/dashboard" })).toEqual({ ok: true, redirectTo: "/en/dashboard" });
  });

  it("fuera de desarrollo local no abre ninguna sesión", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("INTERNAL_REVALIDATE_SECRET", "0123456789abcdef");
    expect(await verify({})).toEqual({ ok: false, error: "unavailable" });
    expect(jar.size).toBe(0);
  });
});
