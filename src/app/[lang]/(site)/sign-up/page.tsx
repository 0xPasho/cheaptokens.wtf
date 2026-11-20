import type { Metadata } from "next";

import { AuthScreen } from "@/components/auth/auth-screen";
import { getLocaleAndDictionary } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const [, dict] = await getLocaleAndDictionary();
  return { title: dict.auth.signUpTitle, robots: { index: false } };
}

/** Crear cuenta. La misma ventana que `/sign-in`: solo cambia el texto (ADR-0063). */
export default function Page() {
  return <AuthScreen view="sign-up" />;
}
