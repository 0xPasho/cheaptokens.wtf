import { and, eq, isNull } from "drizzle-orm";

import { workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

/** El workspace del usuario, creado la primera vez que entra (docs/11 › Clerk: creación perezosa). */
export async function getOrCreateWorkspace(db: Db, userId: string): Promise<{ id: string }> {
  await db.insert(workspaces).values({ clerkUserId: userId }).onConflictDoNothing({ target: workspaces.clerkUserId });
  const [workspace] = await db.select({ id: workspaces.id }).from(workspaces)
    .where(and(eq(workspaces.clerkUserId, userId), isNull(workspaces.deletedAt)));
  if (!workspace) throw new Error("This account was deleted");
  return workspace;
}
