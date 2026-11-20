"use client";

import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClerkDriver, type SignInLike, type SignUpLike } from "@/lib/auth/clerk-flow";
import type { AuthDriver } from "@/lib/auth/flow";
import type { Locale } from "@/lib/i18n/config";

import { type AuthLabels, AuthWindow } from "./auth-window";
import { type AuthTitles, currentRedirectTarget, useAuthView } from "./use-auth-view";

/** La parte de Clerk que avisa cómo va la carga de su script. */
type ClerkEvents = Pick<ReturnType<typeof useClerk>, "on" | "off">;
type Parts = { signIn: SignInLike; signUp: SignUpLike; clerk: ClerkEvents };

/**
 * Clerk carga su script aparte. Se resuelve cuando ya se puede usar, o con `false` si no llegó a cargar
 * (un bloqueador, la red): en ese caso sus métodos no responderían nunca.
 */
function whenLoaded(clerk: ClerkEvents): Promise<boolean> {
  return new Promise((resolve) => {
    const onStatus = (status: string) => {
      if (status === "loading") return;
      // Fuera del reparto del evento: quitar un oyente a mitad hace que Clerk se salte al siguiente.
      queueMicrotask(() => clerk.off("status", onStatus));
      resolve(status !== "error");
    };
    clerk.on("status", onStatus, { notify: true });
  });
}

/**
 * El flujo de una visita a la ventana. Vive fuera de React porque guarda estado entre pasos (qué correo
 * se usó, qué intento quedó completo) y Clerk cambia sus objetos al terminar de cargar: `sync` le pasa
 * los vigentes después de cada render.
 */
function createSession(initial: Parts, locale: Locale, push: (url: string) => void) {
  let parts = initial;
  let started = false;
  let finished = false;
  const flow = createClerkDriver({
    signIn: () => parts.signIn,
    signUp: () => parts.signUp,
    locale,
    loaded: () => whenLoaded(parts.clerk),
    navigate: (decorateUrl) => {
      // Clerk puede devolver una URL absoluta para renovar la cookie en Safari.
      const url = decorateUrl(currentRedirectTarget(locale));
      if (url.startsWith("http")) window.location.href = url;
      else push(url);
    },
    report: (message, detail) => console.error(`[auth] ${message}`, detail),
  });
  const driver: AuthDriver = {
    ...flow,
    start: (identifier) => {
      started = true;
      return flow.start(identifier);
    },
    finish: async () => {
      const result = await flow.finish();
      finished = result.ok;
      return result;
    },
    reset: () => {
      started = false;
      finished = false;
      flow.reset();
    },
  };
  return {
    driver,
    sync: (next: Parts) => { parts = next; },
    /** Con un intento en marcha, quien navega al terminar es el flujo. */
    hasStarted: () => started,
    /** La sesión abrió y la navegación ya salió. */
    hasFinished: () => finished,
  };
}

/** La ventana de acceso con Clerk por debajo: código por correo y cuenta nueva si hace falta (ADR-0063). */
export function ClerkAuthWindow({ locale, labels, titles }: { locale: Locale; labels: AuthLabels; titles: AuthTitles }) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();
  const router = useRouter();
  const [view, setView] = useAuthView(locale, titles);
  const [session] = useState(() => createSession({ signIn, signUp, clerk }, locale, (url) => router.push(url)));

  useEffect(() => {
    session.sync({ signIn, signUp, clerk });
  }, [session, signIn, signUp, clerk]);

  // Con sesión abierta (otra pestaña, volver atrás) esta página no tiene nada que ofrecer.
  useEffect(() => {
    if (isLoaded && isSignedIn && !session.hasStarted()) router.replace(currentRedirectTarget(locale));
  }, [isLoaded, isSignedIn, locale, router, session]);

  // Si se salió con una navegación completa, el navegador puede devolver esta página tal cual al volver
  // atrás, todavía en «Listo». Recargar deja que el servidor decida: con sesión, el proxy manda al destino.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && session.hasFinished()) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [session]);

  return (
    <>
      <AuthWindow
        locale={locale}
        labels={labels}
        driver={session.driver}
        view={view}
        onViewChange={setView}
        autoFocus
        onSignedIn={() => window.location.assign(currentRedirectTarget(locale))}
      />
      {/* Clerk monta aquí su verificación contra bots si la instancia la activa. */}
      <div id="clerk-captcha" />
    </>
  );
}
