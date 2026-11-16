import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";

import { getAuthMode } from "@/lib/auth/mode";
import type { Locale } from "@/lib/i18n/config";

/** ClerkProvider solo cuando Clerk está configurado (ADR-0050). Sin claves, el sitio no carga nada de Clerk. */
export function AuthProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  if (getAuthMode() !== "clerk") return children;
  return (
    <ClerkProvider
      localization={locale === "es" ? esES : undefined}
      signInUrl={`/${locale}/sign-in`}
      signUpUrl={`/${locale}/sign-up`}
      signInFallbackRedirectUrl={`/${locale}/dashboard`}
      signUpFallbackRedirectUrl={`/${locale}/dashboard`}
      afterSignOutUrl={`/${locale}`}
    >
      {children}
    </ClerkProvider>
  );
}
