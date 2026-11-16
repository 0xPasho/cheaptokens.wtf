CREATE TABLE "partner_plan_caps" (
	"plan_id" uuid NOT NULL,
	"month" date NOT NULL,
	"cap_micro_usd" bigint,
	CONSTRAINT "partner_plan_caps_plan_id_month_pk" PRIMARY KEY("plan_id","month")
);
--> statement-breakpoint
CREATE TABLE "partner_runs" (
	"plan_id" uuid NOT NULL,
	"month" date NOT NULL,
	"run" text NOT NULL,
	CONSTRAINT "partner_runs_plan_id_month_run_pk" PRIMARY KEY("plan_id","month","run")
);
--> statement-breakpoint
ALTER TABLE "partner_plan_caps" ADD CONSTRAINT "partner_plan_caps_plan_id_partner_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."partner_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_runs" ADD CONSTRAINT "partner_runs_plan_id_partner_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."partner_plans"("id") ON DELETE no action ON UPDATE no action;