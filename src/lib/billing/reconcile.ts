import { eq, sql } from "drizzle-orm";

import { apiKeys, creditTransactions, requests, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

export async function reconcile(db: Db) {
  // Una instantánea evita falsos desajustes si se cobra entre las tres consultas.
  return db.transaction(async (tx) => {
    const credits = tx.select({
      workspaceId: creditTransactions.workspaceId,
      amount: sql`sum(${creditTransactions.amountMicroUsd})`.as("amount"),
    }).from(creditTransactions).groupBy(creditTransactions.workspaceId).as("credits");
    const workspaceCosts = tx.select({
      workspaceId: requests.workspaceId,
      cost: sql`sum(${requests.costMicroUsd})`.as("cost"),
    }).from(requests).groupBy(requests.workspaceId).as("workspace_costs");
    const expectedBalance = sql`coalesce(${credits.amount}, 0) - coalesce(${workspaceCosts.cost}, 0)`;
    const balanceMismatches = await tx.select({
      workspaceId: workspaces.id,
      expected: sql`${expectedBalance}`.mapWith(BigInt),
      actual: workspaces.balanceMicroUsd,
    }).from(workspaces)
      .leftJoin(credits, eq(workspaces.id, credits.workspaceId))
      .leftJoin(workspaceCosts, eq(workspaces.id, workspaceCosts.workspaceId))
      .where(sql`${workspaces.balanceMicroUsd} <> ${expectedBalance}`)
      .orderBy(workspaces.id);

    const keyCosts = tx.select({
      apiKeyId: requests.apiKeyId,
      cost: sql`sum(${requests.costMicroUsd})`.as("cost"),
    }).from(requests).groupBy(requests.apiKeyId).as("key_costs");
    const expectedSpend = sql`coalesce(${keyCosts.cost}, 0)`;
    const keySpendMismatches = await tx.select({
      apiKeyId: apiKeys.id,
      expected: sql`${expectedSpend}`.mapWith(BigInt),
      actual: apiKeys.spentMicroUsd,
    }).from(apiKeys).leftJoin(keyCosts, eq(apiKeys.id, keyCosts.apiKeyId))
      .where(sql`${apiKeys.spentMicroUsd} <> ${expectedSpend}`)
      .orderBy(apiKeys.id);

    const day = sql<string>`to_char(${requests.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const upstreamDaily = await tx.select({
      upstreamId: requests.upstreamId,
      day,
      upstreamCostMicroUsd: sql`sum(${requests.upstreamCostMicroUsd})`.mapWith(BigInt),
      requestCount: sql`count(*)`.mapWith(BigInt),
    }).from(requests).groupBy(requests.upstreamId, day).orderBy(day, requests.upstreamId);

    return { balanceMismatches, keySpendMismatches, upstreamDaily };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
