"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { AccountMenu } from "@/components/dashboard/account-menu";
import { DEV_IDENTITY_COOKIE } from "@/lib/auth/cookies";
import type { AuthMode } from "@/lib/auth/mode";
import type { Locale } from "@/lib/i18n/config";


type Labels = { signIn: string; account: string; dashboard: string; keys: string; settings: string; signOut: string };

/**
 * Entrar o el menú de cuenta, a la derecha de la cabecera. Se resuelve en el navegador para que las páginas
 * públicas sigan siendo estáticas (el detalle de modelo exige `ensureStatic`).
 */
export function AccountControl({ mode, locale, labels }: { mode: AuthMode; locale: Locale; labels: Labels }) {
  if (mode === "clerk") return <ClerkAccount locale={locale} labels={labels} />;
  if (mode === "dev") return <DevAccount locale={locale} labels={labels} />;
  return <SignInLink locale={locale} label={labels.signIn} />;
}

function SignInLink({ locale, label }: { locale: Locale; label: string }) {
  return <Link href={`/${locale}/sign-in`} className="nr-account-link">{label}</Link>;
}

function ClerkAccount({ locale, labels }: { locale: Locale; labels: Labels }) {
  const { isSignedIn, user } = useUser();
  if (!isSignedIn) return <SignInLink locale={locale} label={labels.signIn} />;
  const identity = user.primaryEmailAddress?.emailAddress ?? user.fullName ?? user.id;
  return <AccountMenu locale={locale} mode="clerk" identity={identity} labels={labels} />;
}

const noSubscription = () => () => {};
function readDevIdentity(): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${DEV_IDENTITY_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(DEV_IDENTITY_COOKIE.length + 1)) : null;
}

function DevAccount({ locale, labels }: { locale: Locale; labels: Labels }) {
  // Entrar y salir terminan en una navegación: volver a pintar con cada ruta relee la cookie.
  usePathname();
  const identity = useSyncExternalStore(noSubscription, readDevIdentity, () => null);
  if (!identity) return <SignInLink locale={locale} label={labels.signIn} />;
  return <AccountMenu locale={locale} mode="dev" identity={identity} labels={labels} />;
}
