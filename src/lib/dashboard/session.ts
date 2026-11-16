import { connection } from "next/server";

import { getSessionUser, requireSessionUser, type SessionUser } from "@/lib/auth/session";
import { getOrCreateWorkspace } from "@/lib/auth/workspace";
import { getDb } from "@/lib/db/client";
import type { Locale } from "@/lib/i18n/config";

export interface DashboardSession {
  user: SessionUser;
  workspaceId: string;
  /** El instante de la lectura: todas las cifras de la vista se calculan con el mismo. */
  now: number;
}

/** Para páginas del dashboard: sesión obligatoria y workspace creado la primera vez. */
export async function requireDashboard(locale: Locale, path: string): Promise<DashboardSession> {
  // Todo el dashboard depende del instante (ventanas, uuid v7): siempre se renderiza por request.
  await connection();
  const user = await requireSessionUser(locale, `/${locale}/dashboard${path}`);
  const { id } = await getOrCreateWorkspace(getDb(), user.id);
  return { user, workspaceId: id, now: Date.now() };
}

/** Para server actions: relee la sesión en cada llamada (no confía en el cliente). */
export async function actionSession(): Promise<DashboardSession> {
  const user = await getSessionUser();
  if (!user) throw new Error("Not signed in");
  const { id } = await getOrCreateWorkspace(getDb(), user.id);
  return { user, workspaceId: id, now: Date.now() };
}
