/**
 * La ventana única de acceso (ADR-0063): pones tu correo, te llega un código y entras. Si el correo
 * no tenía cuenta, la cuenta nace al verificar el código. Aquí vive la lógica que no depende de React:
 * los pasos, lo que puede fallar y el contrato con quien de verdad envía y verifica el código
 * (Clerk en producción, el modo de desarrollo en local).
 */

/** Dígitos del código que llega por correo. */
export const CODE_LENGTH = 6;
/** Segundos de espera antes de poder pedir otro código. */
export const RESEND_SECONDS = 30;
/** Lo que se espera a que abra la sesión antes de ofrecer reintentar. Abrirla no depende de la persona. */
export const FINISH_TIMEOUT_MS = 30_000;

export type AuthStep = "email" | "code" | "done";

/** Solo se sabe después de verificar el código: antes, la ventana no revela si el correo tiene cuenta. */
export type AuthOutcome = "existing" | "new";

/** Por qué falló un paso. El texto de cada caso está en el diccionario (`auth.errors` y `auth.code`). */
export type AuthFailure =
  /** El correo (o el nombre, en desarrollo) no tiene un formato válido. */
  | "invalid"
  /** El código no coincide. */
  | "wrong-code"
  /** El código venció, o el intento se cerró por demasiados códigos incorrectos: hay que pedir otro. */
  | "expired-code"
  /** Demasiados intentos seguidos: toca esperar. */
  | "too-many"
  /** La cuenta está bloqueada por intentos fallidos. */
  | "locked"
  /** Este correo no puede crear una cuenta (lista de bloqueo o registro cerrado). */
  | "not-allowed"
  /** La verificación contra bots no terminó: se cerró, caducó o un bloqueador no la dejó cargar. */
  | "challenge"
  /** Ya hay una sesión abierta en este navegador. */
  | "signed-in"
  /** El servicio de acceso no terminó de cargar en esta página (un bloqueador, la red): hay que recargarla. */
  | "not-loaded"
  /** Sin conexión, el servicio no responde o pide algo que esta ventana no sabe resolver. */
  | "unavailable";

export type StartResult = { ok: true } | { ok: false; error: AuthFailure };
export type VerifyResult = { ok: true; outcome: AuthOutcome } | { ok: false; error: AuthFailure };

/** Quien envía y verifica el código. La ventana solo conoce este contrato. */
export interface AuthDriver {
  /** Empieza el intento y envía el código. No dice si el correo ya tiene cuenta. */
  start(identifier: string): Promise<StartResult>;
  /** Envía otro código al mismo correo. Sin él, la ventana no ofrece reenviar (el modo de desarrollo no envía nada). */
  resend?(): Promise<StartResult>;
  /** Verifica el código. Si el correo no tenía cuenta, la crea. */
  verify(code: string): Promise<VerifyResult>;
  /** Abre la sesión y navega a donde iba la persona. */
  finish(): Promise<{ ok: boolean }>;
  /** Descarta el intento para volver al paso del correo. */
  reset(): void;
}

/** Forma mínima de un correo: algo, arroba, dominio con punto y sin espacios. El resto lo valida quien envía. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Lo que se pega como código: `123 456` o `123-456` valen igual que `123456`. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isCompleteCode(value: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value);
}

/** Segundos que faltan para poder pedir otro código. */
export function secondsUntil(target: number, now: number): number {
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/** `promise`, o `fallback` si tarda más de `ms`. No cancela nada: solo deja de esperar. */
export function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
