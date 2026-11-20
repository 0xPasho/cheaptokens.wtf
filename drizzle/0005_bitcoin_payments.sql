CREATE TYPE "public"."bitcoin_order_intent" AS ENUM('topup', 'plan');--> statement-breakpoint
CREATE TYPE "public"."bitcoin_receipt_status" AS ENUM('seen', 'credited', 'dropped');--> statement-breakpoint
CREATE TABLE "bitcoin_addresses" (
	"network" text NOT NULL,
	"derivation_index" integer NOT NULL,
	"address" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"used_at" timestamp with time zone,
	"watch_until" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bitcoin_addresses_network_derivation_index_pk" PRIMARY KEY("network","derivation_index"),
	CONSTRAINT "bitcoin_addresses_index_check" CHECK ("bitcoin_addresses"."derivation_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bitcoin_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"intent" bitcoin_order_intent NOT NULL,
	"plan_id" text,
	"plan_mode" text,
	"amount_micro_usd" bigint NOT NULL,
	"amount_sats" bigint NOT NULL,
	"rate_micro_usd" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"replaced_at" timestamp with time zone,
	"outcome" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bitcoin_orders_amount_check" CHECK ("bitcoin_orders"."amount_micro_usd" > 0 and "bitcoin_orders"."amount_sats" > 0 and "bitcoin_orders"."rate_micro_usd" > 0),
	CONSTRAINT "bitcoin_orders_plan_check" CHECK (("bitcoin_orders"."intent" = 'plan') = ("bitcoin_orders"."plan_id" is not null and "bitcoin_orders"."plan_mode" is not null))
);
--> statement-breakpoint
CREATE TABLE "bitcoin_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"order_id" uuid,
	"txid" text NOT NULL,
	"vout" integer NOT NULL,
	"amount_sats" bigint NOT NULL,
	"rate_micro_usd" bigint NOT NULL,
	"rate_source" text NOT NULL,
	"amount_micro_usd" bigint NOT NULL,
	"status" bitcoin_receipt_status DEFAULT 'seen' NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	"block_height" integer,
	"missing_since" timestamp with time zone,
	"credited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bitcoin_receipts_amount_check" CHECK ("bitcoin_receipts"."amount_sats" > 0 and "bitcoin_receipts"."rate_micro_usd" > 0 and "bitcoin_receipts"."amount_micro_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bitcoin_addresses" ADD CONSTRAINT "bitcoin_addresses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitcoin_orders" ADD CONSTRAINT "bitcoin_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitcoin_receipts" ADD CONSTRAINT "bitcoin_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bitcoin_receipts" ADD CONSTRAINT "bitcoin_receipts_order_id_bitcoin_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."bitcoin_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bitcoin_addresses_address_unique" ON "bitcoin_addresses" USING btree ("address");--> statement-breakpoint
CREATE UNIQUE INDEX "bitcoin_addresses_unused_unique" ON "bitcoin_addresses" USING btree ("network","workspace_id") WHERE "bitcoin_addresses"."used_at" is null;--> statement-breakpoint
CREATE INDEX "bitcoin_addresses_workspace_idx" ON "bitcoin_addresses" USING btree ("workspace_id","network");--> statement-breakpoint
CREATE INDEX "bitcoin_addresses_watch_idx" ON "bitcoin_addresses" USING btree ("network","watch_until");--> statement-breakpoint
CREATE INDEX "bitcoin_addresses_checked_idx" ON "bitcoin_addresses" USING btree ("network","checked_at" NULLS FIRST);--> statement-breakpoint
CREATE INDEX "bitcoin_orders_workspace_created_idx" ON "bitcoin_orders" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bitcoin_orders_address_created_idx" ON "bitcoin_orders" USING btree ("address","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "bitcoin_receipts_output_unique" ON "bitcoin_receipts" USING btree ("network","txid","vout");--> statement-breakpoint
CREATE INDEX "bitcoin_receipts_workspace_seen_idx" ON "bitcoin_receipts" USING btree ("workspace_id","seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bitcoin_receipts_order_idx" ON "bitcoin_receipts" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "bitcoin_receipts_open_idx" ON "bitcoin_receipts" USING btree ("network","address") WHERE "bitcoin_receipts"."status" = 'seen';