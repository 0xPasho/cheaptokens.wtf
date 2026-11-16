import { and, asc, eq, gt, sql } from "drizzle-orm";

import { modelPacks } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

/** Saldo vigente de los paquetes de un modelo. Solo se consulta cuando el plan no alcanza. */
export async function packBalance(db: Db, workspaceId: string, modelId: string, now: number): Promise<bigint> {
  const [row] = await db.select({
    balance: sql<string | null>`sum(${modelPacks.balanceMicroUsd})`,
  }).from(modelPacks).where(and(
    eq(modelPacks.workspaceId, workspaceId),
    eq(modelPacks.modelId, modelId),
    gt(modelPacks.expiresAt, new Date(now)),
    gt(modelPacks.balanceMicroUsd, BigInt(0)),
  ));
  return BigInt(row?.balance ?? 0);
}

/** El paquete que vence primero y todavía tiene saldo, bloqueado para descontarlo en la transacción del cobro. */
export async function lockNextPack(tx: Db, workspaceId: string, modelId: string, now: number) {
  const [pack] = await tx.select({ id: modelPacks.id, balance: modelPacks.balanceMicroUsd }).from(modelPacks)
    .where(and(
      eq(modelPacks.workspaceId, workspaceId),
      eq(modelPacks.modelId, modelId),
      gt(modelPacks.expiresAt, new Date(now)),
      gt(modelPacks.balanceMicroUsd, BigInt(0)),
    ))
    .orderBy(asc(modelPacks.expiresAt), asc(modelPacks.id))
    .limit(1)
    .for("update");
  return pack ?? null;
}
