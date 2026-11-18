CREATE TYPE "public"."sweep_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."credit_transaction_type" ADD VALUE 'purchase';--> statement-breakpoint
CREATE TABLE "deposit_addresses" (
	"workspace_id" uuid NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"unswept_micro_usd" bigint DEFAULT 0 NOT NULL,
	"watch_until" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_addresses_workspace_id_network_pk" PRIMARY KEY("workspace_id","network"),
	CONSTRAINT "deposit_addresses_unswept_check" CHECK ("deposit_addresses"."unswept_micro_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deposit_scans" (
	"network" text PRIMARY KEY NOT NULL,
	"leased_until" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_sweeps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"network" text NOT NULL,
	"address" text NOT NULL,
	"amount_micro_usd" bigint NOT NULL,
	"tx_id" text NOT NULL,
	"status" "sweep_status" DEFAULT 'pending' NOT NULL,
	"last_valid" bigint NOT NULL,
	"auth_nonce" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "deposit_sweeps_amount_check" CHECK ("deposit_sweeps"."amount_micro_usd" > 0)
);
--> statement-breakpoint
ALTER TABLE "deposit_addresses" ADD CONSTRAINT "deposit_addresses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_sweeps" ADD CONSTRAINT "deposit_sweeps_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_addresses_network_address_unique" ON "deposit_addresses" USING btree ("network","address");--> statement-breakpoint
CREATE INDEX "deposit_addresses_network_checked_idx" ON "deposit_addresses" USING btree ("network","checked_at" NULLS FIRST);--> statement-breakpoint
CREATE INDEX "deposit_addresses_network_watch_idx" ON "deposit_addresses" USING btree ("network","watch_until");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_sweeps_network_tx_unique" ON "deposit_sweeps" USING btree ("network","tx_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_sweeps_pending_address_unique" ON "deposit_sweeps" USING btree ("network","address") WHERE "deposit_sweeps"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "deposit_sweeps_workspace_created_idx" ON "deposit_sweeps" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "deposit_sweeps_open_idx" ON "deposit_sweeps" USING btree ("network","settled_at" DESC NULLS LAST) WHERE "deposit_sweeps"."status" <> 'confirmed';