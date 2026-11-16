import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { CatalogEntry } from "@/lib/catalog/types";

import { uuidv7 } from "./uuid";

export const modelStatus = pgEnum("model_status", ["active", "hidden", "deprecated", "retired"]);
export const requestStatus = pgEnum("request_status", [
  "success",
  "client_cancelled",
  "upstream_error",
  "upstream_timeout",
  "invalid_request",
]);
export const creditTransactionType = pgEnum("credit_transaction_type", ["topup", "refund", "adjustment"]);
/** De dónde cobra una key (ADR-0049): el plan con prepago de respaldo, solo el plan o solo el prepago. */
export const billingSource = pgEnum("billing_source", ["plan_then_prepaid", "plan_only", "prepaid_only"]);
/** Qué pasa al agotar el límite del plan: seguir con paquetes y créditos, o detenerse con 429. */
export const overflowMode = pgEnum("overflow_mode", ["continue", "stop"]);
export const usageWindowKind = pgEnum("usage_window_kind", ["five_hour", "week"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "past_due", "canceled"]);
export const paymentKind = pgEnum("payment_kind", ["topup", "subscription", "pack"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  balanceMicroUsd: bigint("balance_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  rateLimitRpm: integer("rate_limit_rpm"),
  overflowMode: overflowMode("overflow_mode").notNull().default("continue"),
  overflowPacks: boolean("overflow_packs").notNull().default(true),
  overflowCredits: boolean("overflow_credits").notNull().default(true),
  /** Tope mensual de créditos usados al pasar el límite del plan. */
  overflowCapMicroUsd: bigint("overflow_cap_micro_usd", { mode: "bigint" }).notNull().default(sql`25000000`),
  /** Primer día del mes al que corresponde `overflow_spent_micro_usd`. */
  overflowMonth: date("overflow_month"),
  overflowSpentMicroUsd: bigint("overflow_spent_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  name: text("name").notNull(),
  hash: text("hash").notNull(),
  hint: text("hint").notNull(),
  spendLimitMicroUsd: bigint("spend_limit_micro_usd", { mode: "bigint" }),
  spentMicroUsd: bigint("spent_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  billingSource: billingSource("billing_source").notNull().default("plan_then_prepaid"),
  /** Null: todos los modelos. */
  allowedModels: text("allowed_models").array(),
  /** Fin del periodo de gracia de una key rotada. Null: no vence. */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("api_keys_hash_unique").on(table.hash),
  index("api_keys_workspace_revoked_idx").on(table.workspaceId, table.revokedAt),
]);

export const models = pgTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  author: text("author").notNull(),
  description: jsonb("description").$type<CatalogEntry["description"]>().notNull(),
  contextLength: integer("context_length").notNull(),
  maxOutputTokens: integer("max_output_tokens"),
  officialInputPriceMicroUsd: bigint("official_input_price_micro_usd", { mode: "bigint" }).notNull(),
  officialOutputPriceMicroUsd: bigint("official_output_price_micro_usd", { mode: "bigint" }).notNull(),
  officialPriceSourceUrl: text("official_price_source_url").notNull(),
  // El catálogo de ejemplo todavía no tiene una fecha de verificación (contrato de CatalogEntry).
  officialPriceVerifiedAt: date("official_price_verified_at"),
  discountBps: integer("discount_bps").notNull(),
  inputPriceMicroUsd: bigint("input_price_micro_usd", { mode: "bigint" }).notNull(),
  outputPriceMicroUsd: bigint("output_price_micro_usd", { mode: "bigint" }).notNull(),
  tags: text("tags").array().notNull(),
  status: modelStatus("status").notNull(),
  deprecatedAt: date("deprecated_at"),
  retiresAt: date("retires_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check("models_discount_bps_check", sql`${table.discountBps} between 0 and 9999`),
]);

export const upstreams = pgTable("upstreams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  apiKeyEnv: text("api_key_env"),
  sendsPriceCap: boolean("sends_price_cap").notNull().default(false),
  enabled: boolean("enabled").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modelUpstreams = pgTable("model_upstreams", {
  modelId: text("model_id").notNull().references(() => models.id),
  upstreamId: text("upstream_id").notNull().references(() => upstreams.id),
  upstreamModel: text("upstream_model").notNull(),
  costInputMicroUsd: bigint("cost_input_micro_usd", { mode: "bigint" }).notNull(),
  costOutputMicroUsd: bigint("cost_output_micro_usd", { mode: "bigint" }).notNull(),
  priority: integer("priority").notNull(),
  enabled: boolean("enabled").notNull(),
  opsDisabledAt: timestamp("ops_disabled_at", { withTimezone: true }),
  opsDisabledReason: text("ops_disabled_reason"),
}, (table) => [
  primaryKey({ columns: [table.modelId, table.upstreamId] }),
]);

export const requests = pgTable("requests", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  apiKeyId: uuid("api_key_id").notNull().references(() => apiKeys.id),
  modelId: text("model_id").notNull().references(() => models.id),
  upstreamId: text("upstream_id").references(() => upstreams.id),
  attempts: smallint("attempts").notNull(),
  stream: boolean("stream").notNull(),
  status: requestStatus("status").notNull(),
  httpStatus: smallint("http_status").notNull(),
  errorCode: text("error_code"),
  promptTokens: integer("prompt_tokens").notNull(),
  completionTokens: integer("completion_tokens").notNull(),
  cachedTokens: integer("cached_tokens"),
  usageEstimated: boolean("usage_estimated").notNull(),
  costMicroUsd: bigint("cost_micro_usd", { mode: "bigint" }).notNull(),
  /** Reparto de `cost_micro_usd` (ADR-0049). Siempre suman el costo. */
  planMicroUsd: bigint("plan_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  packMicroUsd: bigint("pack_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  creditsMicroUsd: bigint("credits_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  absorbedMicroUsd: bigint("absorbed_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  packId: uuid("pack_id").references(() => modelPacks.id),
  upstreamCostMicroUsd: bigint("upstream_cost_micro_usd", { mode: "bigint" }).notNull(),
  officialCostMicroUsd: bigint("official_cost_micro_usd", { mode: "bigint" }).notNull(),
  ttfbMs: integer("ttfb_ms"),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("requests_workspace_created_idx").on(table.workspaceId, table.createdAt.desc()),
  index("requests_api_key_created_idx").on(table.apiKeyId, table.createdAt.desc()),
  index("requests_upstream_created_idx").on(table.upstreamId, table.createdAt),
  check("requests_cost_split_check", sql`${table.planMicroUsd} + ${table.packMicroUsd} + ${table.creditsMicroUsd} + ${table.absorbedMicroUsd} = ${table.costMicroUsd}`),
]);

export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  type: creditTransactionType("type").notNull(),
  amountMicroUsd: bigint("amount_micro_usd", { mode: "bigint" }).notNull(),
  paymentProvider: text("payment_provider"),
  externalId: text("external_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("credit_transactions_external_id_unique").on(table.externalId),
]);

/** Suscripción vigente de un workspace (ADR-0049). Una fila por workspace; los cobros quedan en `payments`. */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id).unique(),
  planId: text("plan_id").notNull(),
  status: subscriptionStatus("status").notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  /** Plan que entra al renovar (bajar de plan). Null: el mismo. */
  nextPlanId: text("next_plan_id"),
  paymentProvider: text("payment_provider").notNull(),
  externalId: text("external_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("subscriptions_external_id_unique").on(table.externalId),
]);

/** Ventana de 5 horas y semana del plan. Empiezan con el primer request y se reinician al vencer. */
export const usageWindows = pgTable("usage_windows", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: usageWindowKind("kind").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
  usedMicroUsd: bigint("used_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.kind] }),
]);

/** Uso prepagado de un modelo concreto, con bono y vencimiento. */
export const modelPacks = pgTable("model_packs", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  modelId: text("model_id").notNull().references(() => models.id),
  paidMicroUsd: bigint("paid_micro_usd", { mode: "bigint" }).notNull(),
  grantedMicroUsd: bigint("granted_micro_usd", { mode: "bigint" }).notNull(),
  balanceMicroUsd: bigint("balance_micro_usd", { mode: "bigint" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("model_packs_workspace_model_idx").on(table.workspaceId, table.modelId, table.expiresAt),
  check("model_packs_balance_check", sql`${table.balanceMicroUsd} between 0 and ${table.grantedMicroUsd}`),
]);

/** Cada cobro del Merchant of Record: recargas, suscripciones y paquetes. El saldo vive en `credit_transactions`. */
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  kind: paymentKind("kind").notNull(),
  amountMicroUsd: bigint("amount_micro_usd", { mode: "bigint" }).notNull(),
  /** `planId` en suscripciones, `modelId` en paquetes. */
  item: text("item"),
  paymentProvider: text("payment_provider").notNull(),
  externalId: text("external_id").notNull(),
  receiptUrl: text("receipt_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("payments_external_id_unique").on(table.externalId),
  index("payments_workspace_created_idx").on(table.workspaceId, table.createdAt.desc()),
]);

/**
 * Un plan abierto por un socio por la puerta de socios (docs/17): un workspace propio con su suscripción.
 * El plan está abierto mientras `closed_at` sea null; solo puede haber uno abierto por `external_ref`.
 */
export const partnerPlans = pgTable("partner_plans", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  partnerId: text("partner_id").notNull(),
  /** La referencia del socio (en Deska, `deska:team:<teamId>:user:<userId>` o `deska:solo:<userId>`). */
  externalRef: text("external_ref").notNull(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id).unique(),
  /** Fin del periodo que pagó el socio. La suscripción vale unos días más (docs/17 › Decisiones). */
  paidThrough: timestamp("paid_through", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("partner_plans_open_ref_unique").on(table.partnerId, table.externalRef).where(sql`${table.closedAt} is null`),
]);

/**
 * Respuestas guardadas por `Idempotency-Key` de la puerta de socios (docs/17). El cuerpo va cifrado: el de
 * `POST /plans/{id}/keys` lleva la key. Se borran a las 24 horas.
 */
export const partnerIdempotencyKeys = pgTable("partner_idempotency_keys", {
  partnerId: text("partner_id").notNull(),
  key: text("key").notNull(),
  /** SHA-256 del método, la ruta y el body: la misma key con otro body se rechaza. */
  fingerprint: text("fingerprint").notNull(),
  status: smallint("status").notNull(),
  /** AES-256-GCM. Null en las respuestas sin cuerpo (204). */
  bodySealed: text("body_sealed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.partnerId, table.key] }),
  index("partner_idempotency_keys_created_idx").on(table.createdAt),
]);

/**
 * Corridas de Deska por plan y mes (docs/17): el digest opaco de `x-deska-run` (32 hex), nunca un nombre ni
 * un prompt. Una fila por corrida distinta en el mes; `runsThisMonth` las cuenta.
 */
export const partnerRuns = pgTable("partner_runs", {
  planId: uuid("plan_id").notNull().references(() => partnerPlans.id),
  /** Primer día del mes (UTC). */
  month: date("month").notNull(),
  run: text("run").notNull(),
}, (table) => [
  primaryKey({ columns: [table.planId, table.month, table.run] }),
]);

/**
 * El tope de excedente de un plan de socio en cada mes en que se cambió (docs/17). El de un mes pasado es la
 * fila de ese mes o, si no hubo cambios, la última anterior. Null: apagado.
 */
export const partnerPlanCaps = pgTable("partner_plan_caps", {
  planId: uuid("plan_id").notNull().references(() => partnerPlans.id),
  /** Primer día del mes (UTC). */
  month: date("month").notNull(),
  capMicroUsd: bigint("cap_micro_usd", { mode: "bigint" }),
}, (table) => [
  primaryKey({ columns: [table.planId, table.month] }),
]);
