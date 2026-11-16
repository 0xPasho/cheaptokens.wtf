import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { and, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { getDb } from "@/lib/db/client";
import { apiKeys, workspaces } from "@/lib/db/schema";

/**
 * `user.deleted` de Clerk (ADR-0003, docs/11): el workspace queda borrado y sus keys revocadas.
 * Firma verificada con `CLERK_WEBHOOK_SIGNING_SECRET`. Idempotente: repetir el evento no cambia nada.
 */
export async function POST(request: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.type !== "user.deleted" || !event.data.id) return new Response(null, { status: 204 });

  const userId = event.data.id;
  await getDb().transaction(async (tx) => {
    const [workspace] = await tx.update(workspaces).set({ deletedAt: new Date() })
      .where(and(eq(workspaces.clerkUserId, userId), isNull(workspaces.deletedAt)))
      .returning({ id: workspaces.id });
    if (workspace) {
      await tx.update(apiKeys).set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.workspaceId, workspace.id), isNull(apiKeys.revokedAt)));
    }
  });
  return new Response(null, { status: 204 });
}
