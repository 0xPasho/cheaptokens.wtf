CREATE TYPE "public"."credit_transaction_type" AS ENUM('topup', 'refund', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."model_status" AS ENUM('active', 'hidden', 'deprecated', 'retired');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('success', 'client_cancelled', 'upstream_error', 'upstream_timeout', 'invalid_request');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"hint" text NOT NULL,
	"spend_limit_micro_usd" bigint,
	"spent_micro_usd" bigint DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "credit_transaction_type" NOT NULL,
	"amount_micro_usd" bigint NOT NULL,
	"payment_provider" text,
	"external_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_upstreams" (
	"model_id" text NOT NULL,
	"upstream_id" text NOT NULL,
	"upstream_model" text NOT NULL,
	"cost_input_micro_usd" bigint NOT NULL,
	"cost_output_micro_usd" bigint NOT NULL,
	"priority" integer NOT NULL,
	"enabled" boolean NOT NULL,
	"ops_disabled_at" timestamp with time zone,
	"ops_disabled_reason" text,
	CONSTRAINT "model_upstreams_model_id_upstream_id_pk" PRIMARY KEY("model_id","upstream_id")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"author" text NOT NULL,
	"description" jsonb NOT NULL,
	"context_length" integer NOT NULL,
	"max_output_tokens" integer,
	"official_input_price_micro_usd" bigint NOT NULL,
	"official_output_price_micro_usd" bigint NOT NULL,
	"official_price_source_url" text NOT NULL,
	"official_price_verified_at" date,
	"discount_bps" integer NOT NULL,
	"input_price_micro_usd" bigint NOT NULL,
	"output_price_micro_usd" bigint NOT NULL,
	"tags" text[] NOT NULL,
	"status" "model_status" NOT NULL,
	"deprecated_at" date,
	"retires_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_discount_bps_check" CHECK ("models"."discount_bps" between 0 and 9999)
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"upstream_id" text,
	"attempts" smallint NOT NULL,
	"stream" boolean NOT NULL,
	"status" "request_status" NOT NULL,
	"http_status" smallint NOT NULL,
	"error_code" text,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"cached_tokens" integer,
	"usage_estimated" boolean NOT NULL,
	"cost_micro_usd" bigint NOT NULL,
	"upstream_cost_micro_usd" bigint NOT NULL,
	"official_cost_micro_usd" bigint NOT NULL,
	"ttfb_ms" integer,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upstreams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_env" text,
	"sends_price_cap" boolean DEFAULT false NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"balance_micro_usd" bigint DEFAULT 0 NOT NULL,
	"rate_limit_rpm" integer,
	"suspended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_upstreams" ADD CONSTRAINT "model_upstreams_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_upstreams" ADD CONSTRAINT "model_upstreams_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_upstream_id_upstreams_id_fk" FOREIGN KEY ("upstream_id") REFERENCES "public"."upstreams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_unique" ON "api_keys" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "api_keys_workspace_revoked_idx" ON "api_keys" USING btree ("workspace_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_external_id_unique" ON "credit_transactions" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "requests_workspace_created_idx" ON "requests" USING btree ("workspace_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_api_key_created_idx" ON "requests" USING btree ("api_key_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "requests_upstream_created_idx" ON "requests" USING btree ("upstream_id","created_at");