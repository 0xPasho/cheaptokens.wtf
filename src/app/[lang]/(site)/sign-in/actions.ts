"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DEV_IDENTITY_COOKIE, DEV_SESSION_COOKIE } from "@/lib/auth/cookies";
import { DEV_WRONG_CODE, isDevIdentity, normalizeDevIdentity } from "@/lib/auth/dev-identity";
import { type AuthFailure, isCompleteCode } from "@/lib/auth/flow";
import { getAuthMode } from "@/lib/auth/mode";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { DEFAULT_LOCALE, hasLocale, type Locale } from "@/lib/i18n/config";

export type DevVerifyResult = { ok: true; redirectTo: string } | { ok: false; error: AuthFailure };

function localeOf(value: unknown): Locale {
  const text = String(value ?? "");
  return hasLocale(text) ? text : DEFAULT_LOCALE;
}

/**
 * El último paso de la ventana de acceso en modo de desarrollo (ADR-0050, ADR-0063): con un nombre válido
 * y seis dígitos abre la sesión. No hay correo ni código real; fuera de desarrollo local no hace nada.
 * Lo que llega del navegador no es de fiar: todo se vuelve a validar aquí.
 */
export async function devVerifyAction(input: { locale: string; name: string; code: string; redirectUrl: string | null }): Promise<DevVerifyResult> {
  if (getAuthMode() !== "dev") return { ok: false, error: "unavailable" };
  const locale = localeOf(input?.locale);
  const name = normalizeDevIdentity(String(input?.name ?? ""));
  if (!isDevIdentity(name)) return { ok: false, error: "invalid" };
  const code = String(input?.code ?? "");
  if (!isCompleteCode(code) || code === DEV_WRONG_CODE) return { ok: false, error: "wrong-code" };

  const jar = await cookies();
  const options = { sameSite: "lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60 };
  jar.set(DEV_SESSION_COOKIE, name, { ...options, httpOnly: true });
  // Solo para pintar el menú de cuenta en páginas estáticas: no autoriza nada.
  jar.set(DEV_IDENTITY_COOKIE, name, options);
  // Solo rutas propias del mismo idioma: nada de redirecciones abiertas.
  const redirectUrl = typeof input?.redirectUrl === "string" ? input.redirectUrl : null;
  return { ok: true, redirectTo: safeRedirectPath(redirectUrl, locale) };
}

export async function devSignOutAction(form: FormData): Promise<void> {
  const jar = await cookies();
  jar.delete(DEV_SESSION_COOKIE);
  jar.delete(DEV_IDENTITY_COOKIE);
  redirect(`/${localeOf(form.get("locale"))}`);
}
