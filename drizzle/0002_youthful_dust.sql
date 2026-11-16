CREATE TABLE "partner_idempotency_keys" (
	"partner_id" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" smallint NOT NULL,
	"body_sealed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_idempotency_keys_partner_id_key_pk" PRIMARY KEY("partner_id","key")
);
--> statement-breakpoint
CREATE TABLE "partner_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"external_ref" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"paid_through" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "partner_plans_workspace_id_unique" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "partner_plans" ADD CONSTRAINT "partner_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_idempotency_keys_created_idx" ON "partner_idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_plans_open_ref_unique" ON "partner_plans" USING btree ("partner_id","external_ref") WHERE "partner_plans"."closed_at" is null;