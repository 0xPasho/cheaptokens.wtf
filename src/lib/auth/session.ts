import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { Locale } from "@/lib/i18n/config";

import { DEV_SESSION_COOKIE } from "./cookies";
import { DEV_IDENTITY_PATTERN, getAuthMode } from "./mode";

/** Lo mínimo que el dashboard necesita del usuario. `id` es `workspaces.clerk_user_id`. */
export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

/** El usuario de la sesión, o null. Lee cookies: siempre dentro de un `<Suspense>` (cacheComponents). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const mode = getAuthMode();
  if (mode === "clerk") {
    const { userId } = await auth();
    if (!userId) return null;
    const user = await currentUser();
    return { id: userId, email: user?.primaryEmailAddress?.emailAddress ?? null, name: user?.fullName ?? null };
  }
  if (mode === "dev") {
    const value = (await cookies()).get(DEV_SESSION_COOKIE)?.value ?? "";
    return DEV_IDENTITY_PATTERN.test(value) ? { id: `dev:${value}`, email: value.includes("@") ? value : null, name: value } : null;
  }
  return null;
}

/** Para páginas privadas: sin sesión manda a iniciar sesión y vuelve a `next` después. */
export async function requireSessionUser(locale: Locale, next: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/${locale}/sign-in?redirect_url=${encodeURIComponent(next)}`);
  return user;
}
