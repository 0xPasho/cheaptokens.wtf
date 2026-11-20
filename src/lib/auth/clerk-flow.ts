/**
 * El flujo de Clerk detrás de la ventana única de acceso (ADR-0063). Es el «sign-in-or-up» con
 * `signUpIfMissing` de la guía de flujos propios de Clerk: el código se envía tenga o no cuenta el
 * correo, y solo después de verificarlo Clerk dice si hay que crear la cuenta.
 *
 * Los tipos son la parte de `SignInFuture` y `SignUpFuture` que se usa aquí: el archivo no importa
 * Clerk, así las pruebas lo ejercitan con objetos falsos y el tipado real se comprueba donde se conecta.
 */
import type { AuthDriver, AuthFailure, StartResult, VerifyResult } from "./flow";

type ClerkResult = Promise<{ error: unknown }>;

/** Lo que Clerk le pasa a `navigate` al cerrar un intento. */
interface FinalizeParams {
  navigate: (params: { session?: { currentTask?: unknown } | null; decorateUrl: (url: string) => string }) => void | Promise<unknown>;
}

export interface SignInLike {
  readonly status: string | null;
  create(params: { identifier: string; signUpIfMissing: boolean }): ClerkResult;
  emailCode: {
    sendCode(): ClerkResult;
    verifyCode(params: { code: string }): ClerkResult;
  };
  finalize(params: FinalizeParams): ClerkResult;
  reset(): Promise<unknown>;
}

export interface SignUpLike {
  readonly status: string | null;
  readonly missingFields: readonly string[];
  create(params: { transfer: boolean; locale?: string }): ClerkResult;
  finalize(params: FinalizeParams): ClerkResult;
  reset(): Promise<unknown>;
}

export interface ClerkFlowDeps {
  /** El intento de entrar vigente. Se pide en cada paso: Clerk lo actualiza en el mismo objeto. */
  signIn(): SignInLike;
  signUp(): SignUpLike;
  /** Lleva a la persona a donde iba. `decorateUrl` es de Clerk: puede devolver una URL absoluta. */
  navigate(decorateUrl: (url: string) => string): void | Promise<unknown>;
  /**
   * Espera a que el script de Clerk termine de cargar: `false` si no cargó (un bloqueador, la red).
   * Sin esto, los métodos de Clerk esperan para siempre a que cargue y la ventana se quedaría ocupada.
   */
  loaded?(): Promise<boolean>;
  /** Idioma de la ruta, para la cuenta nueva. */
  locale?: string;
  /** A dónde avisar lo que la ventana no sabe resolver. */
  report?: (message: string, detail?: unknown) => void;
}

/** El primer código de error de la respuesta de Clerk, o el del error mismo. */
export function clerkErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const { errors, code } = error as { errors?: { code?: unknown }[]; code?: unknown };
  const first = Array.isArray(errors) ? errors[0]?.code : undefined;
  if (typeof first === "string") return first;
  return typeof code === "string" ? code : "unknown";
}

/** Clerk responde así al verificar el código de un correo sin cuenta: toca pasar el intento a registro. */
export const TRANSFER_TO_SIGN_UP = "sign_up_if_missing_transfer";

const FAILURES: Record<string, AuthFailure> = {
  // El correo no sirve.
  form_param_format_invalid: "invalid",
  form_param_value_invalid: "invalid",
  form_param_nil: "invalid",
  form_param_missing: "invalid",
  form_identifier_invalid: "invalid",
  // El código.
  form_code_incorrect: "wrong-code",
  verification_expired: "expired-code",
  verification_failed: "expired-code",
  // Límites.
  too_many_requests: "too-many",
  signup_rate_limit_exceeded: "too-many",
  user_locked: "locked",
  // No puede registrarse.
  not_allowed_access: "not-allowed",
  form_identifier_not_allowed_access: "not-allowed",
  sign_up_mode_restricted: "not-allowed",
  sign_up_restricted_waitlist: "not-allowed",
  // Ya había sesión (la instancia admite una sola).
  session_exists: "signed-in",
  identifier_already_signed_in: "signed-in",
};

/** El mensaje del error, si lo trae. */
function clerkErrorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

export function clerkFailure(error: unknown): AuthFailure {
  const code = clerkErrorCode(error);
  // Al empezar o al crear una cuenta, Clerk puede pedir una verificación contra bots y la resuelve en su propio
  // diálogo. Si no termina (se cerró, caducó o no cargó), llega alguno de estos códigos.
  if (code.startsWith("protect_check") || code.startsWith("captcha_")) return "challenge";
  // Si la verificación ni siquiera arranca, Clerk lanza un error sin código: «Captcha challenge failed».
  if (code === "unknown" && /captcha/i.test(clerkErrorMessage(error))) return "challenge";
  return FAILURES[code] ?? "unavailable";
}

export function createClerkDriver(deps: ClerkFlowDeps): AuthDriver {
  const report = deps.report ?? (() => {});
  let identifier = "";
  /** Qué intento quedó completo y hay que cerrar: entrar o registrarse. */
  let completed: "signIn" | "signUp" | null = null;

  async function start(value: string): Promise<StartResult> {
    identifier = value;
    completed = null;
    if (deps.loaded && !(await deps.loaded())) return { ok: false, error: "not-loaded" };
    const signIn = deps.signIn();
    const created = await signIn.create({ identifier: value, signUpIfMissing: true });
    if (created.error) return { ok: false, error: clerkFailure(created.error) };
    const sent = await signIn.emailCode.sendCode();
    if (sent.error) return { ok: false, error: clerkFailure(sent.error) };
    return { ok: true };
  }

  async function resend(): Promise<StartResult> {
    const { error } = await deps.signIn().emailCode.sendCode();
    if (!error) return { ok: true };
    const failure = clerkFailure(error);
    // Un límite es un límite. Cualquier otra falla suele ser un intento vencido: se empieza otro.
    return failure === "too-many" || failure === "locked" ? { ok: false, error: failure } : start(identifier);
  }

  /** El correo no tenía cuenta: el correo ya verificado pasa a un registro. */
  async function transferToSignUp(): Promise<VerifyResult> {
    const signUp = deps.signUp();
    const { error } = await signUp.create({ transfer: true, locale: deps.locale });
    if (error) return { ok: false, error: clerkFailure(error) };
    if (signUp.status === "complete") {
      completed = "signUp";
      return { ok: true, outcome: "new" };
    }
    // La instancia pide más datos al registrarse (nombre, términos…) y esta ventana solo pide el correo.
    report("Sign-up needs fields this window does not collect", signUp.missingFields);
    return { ok: false, error: "unavailable" };
  }

  async function verify(code: string): Promise<VerifyResult> {
    const signIn = deps.signIn();
    const { error } = await signIn.emailCode.verifyCode({ code });
    if (error) {
      if (clerkErrorCode(error) === TRANSFER_TO_SIGN_UP) return transferToSignUp();
      return { ok: false, error: clerkFailure(error) };
    }
    if (signIn.status === "complete") {
      completed = "signIn";
      return { ok: true, outcome: "existing" };
    }
    // Segundo factor, dispositivo nuevo, contraseña nueva: nada de eso está activo en la instancia.
    report("Sign-in needs a step this window does not handle", signIn.status);
    return { ok: false, error: "unavailable" };
  }

  async function finish(): Promise<{ ok: boolean }> {
    if (!completed) return { ok: false };
    const attempt = completed === "signUp" ? deps.signUp() : deps.signIn();
    let navigated = false;
    const { error } = await attempt.finalize({
      navigate: ({ session, decorateUrl }) => {
        // Una tarea pendiente (elegir organización, activar MFA…) deja la sesión a medias.
        if (session?.currentTask) return report("Session has a pending task", session.currentTask);
        navigated = true;
        return deps.navigate(decorateUrl);
      },
    });
    if (error) report("Unable to finalize the session", error);
    return { ok: !error && navigated };
  }

  function reset(): void {
    completed = null;
    for (const attempt of [deps.signIn(), deps.signUp()]) {
      // Sin cliente todavía, Clerk lanza o rechaza la llamada: no hay nada que descartar.
      try {
        void attempt.reset().catch(() => {});
      } catch { /* Nada que descartar. */ }
    }
  }

  return { start, resend, verify, finish, reset };
}
