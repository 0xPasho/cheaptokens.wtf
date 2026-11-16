CREATE TYPE "public"."billing_source" AS ENUM('plan_then_prepaid', 'plan_only', 'prepaid_only');--> statement-breakpoint
CREATE TYPE "public"."overflow_mode" AS ENUM('continue', 'stop');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('topup', 'subscription', 'pack');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'past_due', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."usage_window_kind" AS ENUM('five_hour', 'week');--> statement-breakpoint
CREATE TABLE "model_packs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"paid_micro_usd" bigint NOT NULL,
	"granted_micro_usd" bigint NOT NULL,
	"balance_micro_usd" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_packs_balance_check" CHECK ("model_packs"."balance_micro_usd" between 0 and "model_packs"."granted_micro_usd")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"amount_micro_usd" bigint NOT NULL,
	"item" text,
	"payment_provider" text NOT NULL,
	"external_id" text NOT NULL,
	"receipt_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_id" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"next_plan_id" text,
	"payment_provider" text NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
CREATE TABLE "usage_windows" (
	"workspace_id" uuid NOT NULL,
	"kind" "usage_window_kind" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"resets_at" timestamp with time zone NOT NULL,
	"used_micro_usd" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_windows_workspace_id_kind_pk" PRIMARY KEY("workspace_id","kind")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "billing_source" "billing_source" DEFAULT 'plan_then_prepaid' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "allowed_models" text[];--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "plan_micro_usd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "pack_micro_usd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "credits_micro_usd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "absorbed_micro_usd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "pack_id" uuid;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "overflow_mode" "overflow_mode" DEFAULT 'continue' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "overflow_packs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "overflow_credits" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "overflow_cap_micro_usd" bigint DEFAULT 25000000 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "overflow_month" date;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "overflow_spent_micro_usd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "model_packs" ADD CONSTRAINT "model_packs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_packs" ADD CONSTRAINT "model_packs_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_windows" ADD CONSTRAINT "usage_windows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_packs_workspace_model_idx" ON "model_packs" USING btree ("workspace_id","model_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_external_id_unique" ON "payments" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "payments_workspace_created_idx" ON "payments" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_external_id_unique" ON "subscriptions" USING btree ("external_id");--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_pack_id_model_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."model_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Antes de ADR-0049 todo request se cobraba de créditos.
UPDATE "requests" SET "credits_micro_usd" = "cost_micro_usd";--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_cost_split_check" CHECK ("requests"."plan_micro_usd" + "requests"."pack_micro_usd" + "requests"."credits_micro_usd" + "requests"."absorbed_micro_usd" = "requests"."cost_micro_usd");