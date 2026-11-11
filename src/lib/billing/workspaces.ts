import { and, count, eq, isNull } from "drizzle-orm";

import { generateKey } from "@/lib/api-keys";
import { apiKeys, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

export async function ensureDevWorkspace(db: Db, name: string): Promise<{ id: string }> {
  if (!name.trim()) throw new Error("Workspace name is required");
  const clerkUserId = `dev:${name}`;
  const [workspace] = await db.insert(workspaces).values({ clerkUserId })
    .onConflictDoUpdate({ target: workspaces.clerkUserId, set: { clerkUserId } })
    .returning({ id: workspaces.id });
  return workspace;
}

export async function createApiKey(db: Db, input: {
  workspaceId: string;
  name: string;
  spendLimitMicroUsd: bigint | null;
}): Promise<{ id: string; key: string; hint: string }> {
  if (!input.name.trim()) throw new Error("API key name is required");
  if (input.spendLimitMicroUsd !== null && input.spendLimitMicroUsd < BigInt(0)) {
    throw new Error("API key spend limit must not be negative");
  }
  return db.transaction(async (tx) => {
    // Serializa la creación por workspace para que dos altas no superen el límite.
    const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces)
      .where(eq(workspaces.id, input.workspaceId)).for("update");
    if (!workspace) throw new Error("Workspace not found");
    const [{ active }] = await tx.select({ active: count() }).from(apiKeys)
      .where(and(eq(apiKeys.workspaceId, input.workspaceId), isNull(apiKeys.revokedAt)));
    if (active >= 25) throw new Error("Workspace already has 25 active API keys");

    const generated = generateKey();
    const [saved] = await tx.insert(apiKeys).values({
      ...input,
      hash: generated.hash,
      hint: generated.hint,
    }).returning({ id: apiKeys.id });
    return { id: saved.id, key: generated.key, hint: generated.hint };
  });
}
