import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { hashKey, validateKeyFormat } from "@/lib/api-keys";
import { admissionBudget, admit, planRemaining, prepaidRules } from "@/lib/billing/limits";
import { packBalance } from "@/lib/billing/packs";
import { overflowSettings, planUsage, storedWindow } from "@/lib/billing/state";
import { apiKeys, subscriptions, usageWindows, workspaces } from "@/lib/db/schema";
import { admissionBalance } from "@/lib/partner/postpaid";

import type { AdmitUsage, Authenticate, CheckAccount } from "./types";

const fiveHourWindow = alias(usageWindows, "five_hour_window");
const weekWindow = alias(usageWindows, "week_window");

export const authenticate: Authenticate = async (authorization, db, now = Date.now()) => {
  const key = authorization?.trim().match(/^Bearer[ \t]+(\S+)$/i)?.[1];
  if (!key || !validateKeyFormat(key)) {
    return { ok: false, code: "invalid_api_key" };
  }

  // Sin caché: la revocación debe afectar al siguiente request. El plan y sus ventanas vienen en la misma query.
  const [record] = await db.select({
    apiKeyId: apiKeys.id,
    workspaceId: workspaces.id,
    balanceMicroUsd: workspaces.balanceMicroUsd,
    spendLimitMicroUsd: apiKeys.spendLimitMicroUsd,
    spentMicroUsd: apiKeys.spentMicroUsd,
    rateLimitRpm: workspaces.rateLimitRpm,
    suspendedAt: workspaces.suspendedAt,
    revokedAt: apiKeys.revokedAt,
    expiresAt: apiKeys.expiresAt,
    deletedAt: workspaces.deletedAt,
    billingSource: apiKeys.billingSource,
    allowedModels: apiKeys.allowedModels,
    overflowMode: workspaces.overflowMode,
    overflowPacks: workspaces.overflowPacks,
    overflowCredits: workspaces.overflowCredits,
    overflowCapMicroUsd: workspaces.overflowCapMicroUsd,
    overflowMonth: workspaces.overflowMonth,
    overflowSpentMicroUsd: workspaces.overflowSpentMicroUsd,
    planId: subscriptions.planId,
    subscriptionStatus: subscriptions.status,
    currentPeriodEnd: subscriptions.currentPeriodEnd,
    fiveHourUsed: fiveHourWindow.usedMicroUsd,
    fiveHourResetsAt: fiveHourWindow.resetsAt,
    weekUsed: weekWindow.usedMicroUsd,
    weekResetsAt: weekWindow.resetsAt,
  }).from(apiKeys)
    .innerJoin(workspaces, eq(apiKeys.workspaceId, workspaces.id))
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .leftJoin(fiveHourWindow, and(eq(fiveHourWindow.workspaceId, workspaces.id), eq(fiveHourWindow.kind, "five_hour")))
    .leftJoin(weekWindow, and(eq(weekWindow.workspaceId, workspaces.id), eq(weekWindow.kind, "week")))
    .where(eq(apiKeys.hash, hashKey(key)))
    .limit(1);

  // El mismo error evita revelar si la key existió, si se revocó o si venció su periodo de gracia.
  if (!record || record.revokedAt !== null || record.deletedAt !== null || (record.expiresAt !== null && record.expiresAt.getTime() <= now)) {
    return { ok: false, code: "invalid_api_key" };
  }

  const subscription = record.planId !== null && record.subscriptionStatus !== null && record.currentPeriodEnd !== null
    ? { planId: record.planId, status: record.subscriptionStatus, currentPeriodEnd: record.currentPeriodEnd }
    : null;
  const plan = planUsage(
    subscription,
    storedWindow({ usedMicroUsd: record.fiveHourUsed, resetsAt: record.fiveHourResetsAt }),
    storedWindow({ usedMicroUsd: record.weekUsed, resetsAt: record.weekResetsAt }),
    now,
  );

  return {
    ok: true,
    context: {
      apiKeyId: record.apiKeyId,
      workspaceId: record.workspaceId,
      balanceMicroUsd: record.balanceMicroUsd,
      spendLimitMicroUsd: record.spendLimitMicroUsd,
      spentMicroUsd: record.spentMicroUsd,
      suspended: record.suspendedAt !== null,
      rateLimitRpm: record.rateLimitRpm ?? plan?.plan.rateLimitRpm ?? null,
      billingSource: record.billingSource,
      allowedModels: record.allowedModels,
      plan,
      overflow: overflowSettings(record, now),
    },
  };
};

export const checkAccount: CheckAccount = (context, modelId) => {
  if (context.suspended) return "account_suspended";
  if (context.allowedModels !== null && !context.allowedModels.includes(modelId)) return "model_not_allowed_for_key";
  if (context.spendLimitMicroUsd !== null && context.spentMicroUsd >= context.spendLimitMicroUsd) {
    return "key_limit_exceeded";
  }
  return null;
};

export const admitUsage: AdmitUsage = async (context, modelId, db, now, planMustCoverMicroUsd) => {
  const { billingSource: source, plan, overflow } = context;
  // El plan alcanza solo si cubre lo máximo que puede costar el request más lo que ya reservan los requests en
  // curso (ADR-0066): entonces sobran las dos queries.
  const planCovers = planMustCoverMicroUsd !== null && source !== "prepaid_only" && plan !== null
    && planRemaining(plan, now) >= planMustCoverMicroUsd;
  const needsPacks = !planCovers && prepaidRules(source, plan !== null, overflow).packs;
  const input = {
    source, plan, overflow, now,
    // Un plan de socio paga su excedente después: se admite con lo que queda del tope (docs/17).
    balanceMicroUsd: planCovers ? context.balanceMicroUsd : await admissionBalance(db, context),
    packBalanceMicroUsd: needsPacks ? await packBalance(db, context.workspaceId, modelId, now) : BigInt(0),
  };
  const admission = admit(input);
  return admission.ok ? { ...admission, budgetMicroUsd: admissionBudget(input), planOnly: planCovers } : admission;
};
