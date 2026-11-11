import { eq } from "drizzle-orm";

import { hashKey, validateKeyFormat } from "@/lib/api-keys";
import { apiKeys, workspaces } from "@/lib/db/schema";

import type { Authenticate, CheckAccount } from "./types";

export const authenticate: Authenticate = async (authorization, db) => {
  const key = authorization?.trim().match(/^Bearer[ \t]+(\S+)$/i)?.[1];
  if (!key || !validateKeyFormat(key)) {
    return { ok: false, code: "invalid_api_key" };
  }

  // Sin caché: la revocación debe afectar al siguiente request.
  const [record] = await db.select({
    apiKeyId: apiKeys.id,
    workspaceId: workspaces.id,
    balanceMicroUsd: workspaces.balanceMicroUsd,
    spendLimitMicroUsd: apiKeys.spendLimitMicroUsd,
    spentMicroUsd: apiKeys.spentMicroUsd,
    rateLimitRpm: workspaces.rateLimitRpm,
    suspendedAt: workspaces.suspendedAt,
    revokedAt: apiKeys.revokedAt,
    deletedAt: workspaces.deletedAt,
  }).from(apiKeys)
    .innerJoin(workspaces, eq(apiKeys.workspaceId, workspaces.id))
    .where(eq(apiKeys.hash, hashKey(key)))
    .limit(1);

  // El mismo error evita revelar si la key existió.
  if (!record || record.revokedAt !== null || record.deletedAt !== null) {
    return { ok: false, code: "invalid_api_key" };
  }

  return {
    ok: true,
    context: {
      apiKeyId: record.apiKeyId,
      workspaceId: record.workspaceId,
      balanceMicroUsd: record.balanceMicroUsd,
      spendLimitMicroUsd: record.spendLimitMicroUsd,
      spentMicroUsd: record.spentMicroUsd,
      suspended: record.suspendedAt !== null,
      rateLimitRpm: record.rateLimitRpm,
    },
  };
};

export const checkAccount: CheckAccount = (context) => {
  if (context.suspended) return "account_suspended";
  if (context.balanceMicroUsd <= BigInt(0)) return "insufficient_credits";
  if (context.spendLimitMicroUsd !== null && context.spentMicroUsd >= context.spendLimitMicroUsd) {
    return "key_limit_exceeded";
  }
  return null;
};
