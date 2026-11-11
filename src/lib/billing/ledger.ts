import { and, eq, sql } from "drizzle-orm";

import { apiKeys, creditTransactions, requests, workspaces } from "@/lib/db/schema";

import type { ChargeRequest, GrantCredits } from "./types";

export const chargeRequest: ChargeRequest = async (db, record) => {
  await db.transaction(async (tx) => {
    await tx.insert(requests).values(record);
    const [workspace] = await tx.update(workspaces).set({
      balanceMicroUsd: sql`${workspaces.balanceMicroUsd} - ${record.costMicroUsd}`,
    }).where(eq(workspaces.id, record.workspaceId)).returning({ id: workspaces.id });
    const [key] = await tx.update(apiKeys).set({
      spentMicroUsd: sql`${apiKeys.spentMicroUsd} + ${record.costMicroUsd}`,
      lastUsedAt: sql`now()`,
    }).where(and(eq(apiKeys.id, record.apiKeyId), eq(apiKeys.workspaceId, record.workspaceId)))
      .returning({ id: apiKeys.id });
    // La FK no comprueba que la key pertenezca al workspace del request.
    if (!workspace || !key) throw new Error("Request workspace and API key must match");
  });
};

export const grantCredits: GrantCredits = async (db, input) => {
  if (!input.note.trim()) throw new Error("Credit adjustment note is required");
  await db.transaction(async (tx) => {
    await tx.insert(creditTransactions).values({
      ...input,
      type: "adjustment",
      paymentProvider: null,
      externalId: null,
    });
    await tx.update(workspaces).set({
      balanceMicroUsd: sql`${workspaces.balanceMicroUsd} + ${input.amountMicroUsd}`,
    }).where(eq(workspaces.id, input.workspaceId));
  });
};

/** Los ajustes manuales deben ser exactos: una fracción de µUSD se rechaza, no se redondea. */
export function usdToMicroUsdExact(value: string): bigint {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value);
  const fraction = match?.[3] ?? "";
  if (!match || /[1-9]/.test(fraction.slice(6))) {
    throw new Error("USD amount must be a decimal with at most six non-zero fractional places");
  }
  const amount = BigInt(match[2]) * BigInt(1_000_000)
    + BigInt(fraction.slice(0, 6).padEnd(6, "0"));
  return match[1] === "-" ? -amount : amount;
}
