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
/** `purchase`: un plan o un paquete pagado con el saldo; va en negativo (ADR-0058). */
export const creditTransactionType = pgEnum("credit_transaction_type", ["topup", "refund", "adjustment", "purchase"]);
/** De dónde cobra una key (ADR-0049): el plan con prepago de respaldo, solo el plan o solo el prepago. */
export const billingSource = pgEnum("billing_source", ["plan_then_prepaid", "plan_only", "prepaid_only"]);
/** Qué pasa al agotar el límite del plan: seguir con paquetes y créditos, o detenerse con 429. */
export const overflowMode = pgEnum("overflow_mode", ["continue", "stop"]);
export const usageWindowKind = pgEnum("usage_window_kind", ["five_hour", "week"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "past_due", "canceled"]);
export const paymentKind = pgEnum("payment_kind", ["topup", "subscription", "pack"]);
/** Un barrido se acredita solo cuando su transacción queda confirmada en la cadena (ADR-0058). */
export const sweepStatus = pgEnum("sweep_status", ["pending", "confirmed", "failed"]);
/** Para qué es una cotización en Bitcoin (ADR-0065): créditos o un plan. */
export const bitcoinOrderIntent = pgEnum("bitcoin_order_intent", ["topup", "plan"]);
/** `seen`: está en la red y su precio ya quedó fijo. `credited`: confirmado y acreditado. `dropped`: desapareció sin confirmarse. */
export const bitcoinReceiptStatus = pgEnum("bitcoin_receipt_status", ["seen", "credited", "dropped"]);

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
  reasoningLevels: text("reasoning_levels").array(),
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

/** Cada cobro confirmado: recargas, suscripciones y paquetes. El saldo vive en `credit_transactions`. */
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
 * La dirección de depósito de un workspace en una red (ADR-0058). Es solo suya y no cambia: su llave sale de
 * `CRYPTO_DEPOSIT_SEED` y del id del workspace, así que aquí no se guarda ningún secreto.
 */
export const depositAddresses = pgTable("deposit_addresses", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  /** `solana` o `base`. */
  network: text("network").notNull(),
  address: text("address").notNull(),
  /** USDC que había en la dirección sin barrer la última vez que se miró. */
  unsweptMicroUsd: bigint("unswept_micro_usd", { mode: "bigint" }).notNull().default(sql`0`),
  /** Mientras no pase, la dirección se revisa en cada barrido: su dueño abrió el depósito hace poco. */
  watchUntil: timestamp("watch_until", { withTimezone: true }),
  /** La última vez que se leyó su saldo en la cadena. Las demás direcciones se revisan por turnos, de la más vieja a la más nueva. */
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.workspaceId, table.network] }),
  uniqueIndex("deposit_addresses_network_address_unique").on(table.network, table.address),
  index("deposit_addresses_network_checked_idx").on(table.network, table.checkedAt.asc().nullsFirst()),
  index("deposit_addresses_network_watch_idx").on(table.network, table.watchUntil),
  check("deposit_addresses_unswept_check", sql`${table.unsweptMicroUsd} >= 0`),
]);

/**
 * Un barrido: la transacción que mueve el USDC de una dirección de depósito a la wallet principal (ADR-0058).
 * Se guarda antes de enviarla y el saldo se acredita cuando queda confirmada: lo acreditado es siempre lo que
 * llegó a la wallet principal. USDC tiene 6 decimales: 1 unidad = 1 µUSD.
 */
export const depositSweeps = pgTable("deposit_sweeps", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  /** `solana`, `base` o `dev` (el depósito simulado de desarrollo local). */
  network: text("network").notNull(),
  address: text("address").notNull(),
  amountMicroUsd: bigint("amount_micro_usd", { mode: "bigint" }).notNull(),
  /** La firma en Solana o el hash en Base. `<red>:<tx_id>` es el `external_id` del pago. */
  txId: text("tx_id").notNull(),
  status: sweepStatus("status").notNull().default("pending"),
  /** Hasta cuándo puede entrar: en Solana, la última altura de bloque válida; en Base, el `validBefore` de la autorización (segundos). */
  lastValid: bigint("last_valid", { mode: "bigint" }).notNull(),
  /** Base: el nonce de la autorización EIP-3009. */
  authNonce: text("auth_nonce"),
  /** Por qué falló: `expired`, `reverted` o el error del RPC al enviarla. */
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("deposit_sweeps_network_tx_unique").on(table.network, table.txId),
  // Un solo barrido en vuelo por dirección: dos procesos no mandan el mismo saldo dos veces.
  uniqueIndex("deposit_sweeps_pending_address_unique").on(table.network, table.address).where(sql`${table.status} = 'pending'`),
  index("deposit_sweeps_workspace_created_idx").on(table.workspaceId, table.createdAt.desc()),
  index("deposit_sweeps_open_idx").on(table.network, table.settledAt.desc()).where(sql`${table.status} <> 'confirmed'`),
  check("deposit_sweeps_amount_check", sql`${table.amountMicroUsd} > 0`),
]);

/** Quién está barriendo cada red: un solo proceso a la vez, para no cruzar los nonces del relayer de Base. */
export const depositScans = pgTable("deposit_scans", {
  network: text("network").primaryKey(),
  leasedUntil: timestamp("leased_until", { withTimezone: true }).notNull(),
  /** La última vez que el cron revisó los fondos de la wallet de comisiones. */
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/**
 * Una dirección de Bitcoin de un workspace (ADR-0065): la de recibir número `derivation_index` de la xpub. Sale
 * de la xpub, así que aquí no hay ningún secreto. Cada workspace tiene a lo más una sin usar: cuando recibe un
 * pago, la siguiente cotización usa otra. Las usadas se siguen revisando y lo que llega se acredita igual.
 */
export const bitcoinAddresses = pgTable("bitcoin_addresses", {
  /** `mainnet`, `testnet4` o `signet`. */
  network: text("network").notNull(),
  /** `m/84'/<moneda>'/<cuenta>'/0/<índice>`. Se asignan en orden, sin saltos. */
  derivationIndex: integer("derivation_index").notNull(),
  address: text("address").notNull(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  /** La primera vez que se vio un pago: desde entonces deja de ser la dirección vigente. */
  usedAt: timestamp("used_at", { withTimezone: true }),
  /** Mientras no pase, se revisa en cada corrida del cron: hay una cotización o un pago reciente. */
  watchUntil: timestamp("watch_until", { withTimezone: true }),
  /** La última vez que se leyó en la cadena. */
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.network, table.derivationIndex] }),
  uniqueIndex("bitcoin_addresses_address_unique").on(table.address),
  // Una sola dirección sin usar por workspace: así el hueco de índices sin uso de la wallet no crece solo.
  uniqueIndex("bitcoin_addresses_unused_unique").on(table.network, table.workspaceId).where(sql`${table.usedAt} is null`),
  index("bitcoin_addresses_workspace_idx").on(table.workspaceId, table.network),
  index("bitcoin_addresses_watch_idx").on(table.network, table.watchUntil),
  index("bitcoin_addresses_checked_idx").on(table.network, table.checkedAt.asc().nullsFirst()),
  check("bitcoin_addresses_index_check", sql`${table.derivationIndex} >= 0`),
]);

/**
 * Una cotización en Bitcoin (ADR-0065): cuánto en USD, cuántos sats, a qué precio y para qué. El precio vale
 * hasta `expires_at`. Una cotización nueva del workspace reemplaza a la anterior.
 */
export const bitcoinOrders = pgTable("bitcoin_orders", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  network: text("network").notNull(),
  address: text("address").notNull(),
  intent: bitcoinOrderIntent("intent").notNull(),
  /** Con `intent = plan`: el plan y lo que iba a pasar al comprarlo (`activate`, `extend` o `upgrade`). */
  planId: text("plan_id"),
  planMode: text("plan_mode"),
  amountMicroUsd: bigint("amount_micro_usd", { mode: "bigint" }).notNull(),
  amountSats: bigint("amount_sats", { mode: "bigint" }).notNull(),
  /** µUSD por BTC. */
  rateMicroUsd: bigint("rate_micro_usd", { mode: "bigint" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  replacedAt: timestamp("replaced_at", { withTimezone: true }),
  /** `plan`: se compró el plan. `balance`: lo recibido quedó como saldo. `replaced`: otra cotización la reemplazó. */
  outcome: text("outcome"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("bitcoin_orders_workspace_created_idx").on(table.workspaceId, table.createdAt.desc()),
  index("bitcoin_orders_address_created_idx").on(table.address, table.createdAt.desc()),
  check("bitcoin_orders_amount_check", sql`${table.amountMicroUsd} > 0 and ${table.amountSats} > 0 and ${table.rateMicroUsd} > 0`),
  check("bitcoin_orders_plan_check", sql`(${table.intent} = 'plan') = (${table.planId} is not null and ${table.planMode} is not null)`),
]);

/**
 * Una salida de una transacción que paga una dirección nuestra (ADR-0065). El precio queda fijo al verla; se
 * acredita una sola vez, cuando tiene las confirmaciones. `bitcoin:<txid>:<vout>` es el `external_id` del pago.
 */
export const bitcoinReceipts = pgTable("bitcoin_receipts", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id),
  network: text("network").notNull(),
  address: text("address").notNull(),
  /** La cotización a la que corresponde; null si llegó sin ninguna. */
  orderId: uuid("order_id").references(() => bitcoinOrders.id),
  txid: text("txid").notNull(),
  vout: integer("vout").notNull(),
  amountSats: bigint("amount_sats", { mode: "bigint" }).notNull(),
  /** µUSD por BTC: el de la cotización (`quote`) o el del momento en que se vio (`market`). */
  rateMicroUsd: bigint("rate_micro_usd", { mode: "bigint" }).notNull(),
  rateSource: text("rate_source").notNull(),
  /** Lo que se acredita: los sats a ese precio, hacia abajo. */
  amountMicroUsd: bigint("amount_micro_usd", { mode: "bigint" }).notNull(),
  status: bitcoinReceiptStatus("status").notNull().default("seen"),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull(),
  blockHeight: integer("block_height"),
  /** Sin confirmar y ya no aparece en la red: a los 30 minutos se da por perdido. */
  missingSince: timestamp("missing_since", { withTimezone: true }),
  creditedAt: timestamp("credited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("bitcoin_receipts_output_unique").on(table.network, table.txid, table.vout),
  index("bitcoin_receipts_workspace_seen_idx").on(table.workspaceId, table.seenAt.desc()),
  index("bitcoin_receipts_order_idx").on(table.orderId),
  index("bitcoin_receipts_open_idx").on(table.network, table.address).where(sql`${table.status} = 'seen'`),
  check("bitcoin_receipts_amount_check", sql`${table.amountSats} > 0 and ${table.rateMicroUsd} > 0 and ${table.amountMicroUsd} >= 0`),
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
