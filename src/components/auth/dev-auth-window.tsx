"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { devVerifyAction } from "@/app/[lang]/(site)/sign-in/actions";
import type { AuthDriver } from "@/lib/auth/flow";
import { REDIRECT_PARAM } from "@/lib/auth/redirect";
import type { Locale } from "@/lib/i18n/config";

import { type AuthLabels, AuthWindow } from "./auth-window";
import { type AuthTitles, useAuthView } from "./use-auth-view";

/** El flujo sin Clerk: el nombre se queda aquí hasta el último paso, que lo manda al servidor con el código. */
function createDevDriver(locale: Locale, push: (url: string) => void): AuthDriver {
  let name = "";
  let target = "";
  return {
    async start(identifier) {
      name = identifier;
      return { ok: true };
    },
    async verify(code) {
      const redirectUrl = new URLSearchParams(window.location.search).get(REDIRECT_PARAM);
      const result = await devVerifyAction({ locale, name, code, redirectUrl });
      if (!result.ok) return result;
      target = result.redirectTo;
      return { ok: true, outcome: "existing" };
    },
    async finish() {
      push(target);
      return { ok: true };
    },
    reset() {
      name = "";
    },
  };
}

/**
 * La misma ventana sin Clerk, solo en desarrollo local (ADR-0050): entras con un nombre y cualquier
 * código de seis dígitos. No envía correos; sirve para ver y probar el flujo completo.
 */
export function DevAuthWindow({ locale, labels, titles }: { locale: Locale; labels: AuthLabels; titles: AuthTitles }) {
  const router = useRouter();
  const [view, setView] = useAuthView(locale, titles);
  const [driver] = useState(() => createDevDriver(locale, (url) => router.push(url)));

  return <AuthWindow locale={locale} labels={labels} driver={driver} view={view} onViewChange={setView} kind="dev" autoFocus />;
}
