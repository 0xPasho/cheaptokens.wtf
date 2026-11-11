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

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  balanceMicroUsd: bigint("balance_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  rateLimitRpm: integer("rate_limit_rpm"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  description: jsonb("description").$type<{ en: string; es: string }>().notNull(),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  upstreamCostMicroUsd: bigint("upstream_cost_micro_usd", { mode: "bigint" }).notNull(),
  officialCostMicroUsd: bigint("official_cost_micro_usd", { mode: "bigint" }).notNull(),
  ttfbMs: integer("ttfb_ms"),
  latencyMs: integer("latency_ms").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("requests_workspace_created_idx").on(table.workspaceId, table.createdAt.desc()),
  index("requests_api_key_created_idx").on(table.apiKeyId, table.createdAt.desc()),
  index("requests_upstream_created_idx").on(table.upstreamId, table.createdAt),
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
