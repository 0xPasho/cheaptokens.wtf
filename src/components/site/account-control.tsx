"use client";

import { useUser } from "@clerk/nextjs";
import LogInIcon from "kubai-icons-react/icons/log-in";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { AccountMenu } from "@/components/dashboard/account-menu";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { DEV_IDENTITY_COOKIE } from "@/lib/auth/cookies";
import type { AuthMode } from "@/lib/auth/mode";
import type { Locale } from "@/lib/i18n/config";


type Labels = { signIn: string; account: string; dashboard: string; keys: string; settings: string; signOut: string };

/** `header`: entrar o el avatar. `menu`: la entrada «Entrar» del menú móvil, o nada si ya hay sesión. */
type Variant = "header" | "menu";

/**
 * Entrar o el menú de cuenta, a la derecha de la cabecera. Se resuelve en el navegador para que las páginas
 * públicas sigan siendo estáticas (el detalle de modelo exige `ensureStatic`).
 */
export function AccountControl({ mode, locale, labels, variant = "header" }: { mode: AuthMode; locale: Locale; labels: Labels; variant?: Variant }) {
  if (mode === "clerk") return <ClerkAccount locale={locale} labels={labels} variant={variant} />;
  if (mode === "dev") return <DevAccount locale={locale} labels={labels} variant={variant} />;
  return <SignInLink locale={locale} label={labels.signIn} variant={variant} />;
}

function SignInLink({ locale, label, variant }: { locale: Locale; label: string; variant: Variant }) {
  const href = `/${locale}/sign-in`;
  if (variant === "menu") {
    return <><DropdownMenuSeparator /><DropdownMenuItem render={<Link href={href} />}><LogInIcon aria-hidden />{label}</DropdownMenuItem></>;
  }
  return <Link href={href} className="nr-account-link">{label}</Link>;
}

function ClerkAccount({ locale, labels, variant }: { locale: Locale; labels: Labels; variant: Variant }) {
  const { isSignedIn, user } = useUser();
  if (!isSignedIn) return <SignInLink locale={locale} label={labels.signIn} variant={variant} />;
  if (variant === "menu") return null;
  const identity = user.primaryEmailAddress?.emailAddress ?? user.fullName ?? user.id;
  return <AccountMenu locale={locale} mode="clerk" identity={identity} seed={user.id} labels={labels} />;
}

const noSubscription = () => () => {};
function readDevIdentity(): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${DEV_IDENTITY_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(DEV_IDENTITY_COOKIE.length + 1)) : null;
}

function DevAccount({ locale, labels, variant }: { locale: Locale; labels: Labels; variant: Variant }) {
  // Entrar y salir terminan en una navegación: volver a pintar con cada ruta relee la cookie.
  usePathname();
  const identity = useSyncExternalStore(noSubscription, readDevIdentity, () => null);
  if (!identity) return <SignInLink locale={locale} label={labels.signIn} variant={variant} />;
  if (variant === "menu") return null;
  return <AccountMenu locale={locale} mode="dev" identity={identity} seed={`dev:${identity}`} labels={labels} />;
}
