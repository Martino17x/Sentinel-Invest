CREATE TYPE "public"."created_by" AS ENUM('user', 'agent');--> statement-breakpoint
CREATE TABLE "portfolio_investment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"objective" text,
	"allocation_target" jsonb NOT NULL,
	"rationale" text,
	"constraints" jsonb,
	"created_by" "created_by" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_version_positive" CHECK (version > 0)
);
--> statement-breakpoint
ALTER TABLE "portfolio_investment_plans" ADD CONSTRAINT "portfolio_investment_plans_portfolio_id_virtual_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."virtual_portfolios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_investment_plans" ADD CONSTRAINT "portfolio_investment_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plans_portfolio_idx" ON "portfolio_investment_plans" USING btree ("portfolio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_portfolio_version_unique" ON "portfolio_investment_plans" USING btree ("portfolio_id","version");--> statement-breakpoint
INSERT INTO "portfolio_investment_plans" ("portfolio_id", "user_id", "version", "title", "objective", "allocation_target", "rationale", "constraints", "created_by")
SELECT 'f4948001-3807-404c-bca0-b08f9d803404', user_id, 1, 'Cartera Moderada CER+ Diversificada v1', 'Superar CER con diversificacion moderada 40% CER / 35% equity global y local / 15% dollar-linked / 10% cash', '{"T2X5":20,"TX26":20,"SPY":10,"AAPL":10,"MSFT":7,"META":5,"YPFD":3,"cash":10,"dollar_linked":15}'::jsonb, 'Plan base v1: 40% CER (T2X5/TX26) para cobertura inflacion, 35% equity diversificado global y local (SPY/AAPL/MSFT/META/YPFD), 15% dollar-linked y 10% cash para liquidez. Objetivo superar CER con volatilidad moderada.', '{"maxPorActivo":25,"maxSector":40,"betaMax":1.2}'::jsonb, 'user'::created_by
FROM virtual_portfolios WHERE id = 'f4948001-3807-404c-bca0-b08f9d803404'
ON CONFLICT (portfolio_id, version) DO NOTHING;
