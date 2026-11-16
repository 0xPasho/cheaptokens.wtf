"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DEV_IDENTITY_PATTERN, getAuthMode } from "@/lib/auth/mode";
import { DEV_IDENTITY_COOKIE, DEV_SESSION_COOKIE } from "@/lib/auth/cookies";
import { DEFAULT_LOCALE, hasLocale, type Locale } from "@/lib/i18n/config";

export type DevSignInState = { error: "devInvalid" } | null;

function formLocale(value: FormDataEntryValue | null): Locale {
  const text = String(value ?? "");
  return hasLocale(text) ? text : DEFAULT_LOCALE;
}

/** Solo rutas propias del mismo idioma: nada de redirecciones abiertas. */
function safeRedirect(value: FormDataEntryValue | null, locale: Locale): string {
  const text = String(value ?? "");
  return text.startsWith(`/${locale}/`) && !text.startsWith("//") && !text.includes("\\") ? text : `/${locale}/dashboard`;
}

export async function devSignInAction(_previous: DevSignInState, form: FormData): Promise<DevSignInState> {
  if (getAuthMode() !== "dev") return { error: "devInvalid" };
  const locale = formLocale(form.get("locale"));
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  if (!DEV_IDENTITY_PATTERN.test(name)) return { error: "devInvalid" };
  const jar = await cookies();
  const options = { sameSite: "lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60 };
  jar.set(DEV_SESSION_COOKIE, name, { ...options, httpOnly: true });
  // Solo para pintar el menú de cuenta en páginas estáticas: no autoriza nada.
  jar.set(DEV_IDENTITY_COOKIE, name, options);
  redirect(safeRedirect(form.get("redirect_url"), locale));
}

export async function devSignOutAction(form: FormData): Promise<void> {
  const jar = await cookies();
  jar.delete(DEV_SESSION_COOKIE);
  jar.delete(DEV_IDENTITY_COOKIE);
  redirect(`/${formLocale(form.get("locale"))}`);
}
