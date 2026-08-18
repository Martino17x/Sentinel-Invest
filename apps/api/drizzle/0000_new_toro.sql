CREATE TYPE "public"."currency" AS ENUM('ARS', 'USD');--> statement-breakpoint
CREATE TYPE "public"."market" AS ENUM('bcba', 'nyse', 'nasdaq', 'bonds', 'fci', 'crypto');--> statement-breakpoint
CREATE TYPE "public"."operation_status" AS ENUM('pending', 'accepted', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."operation_type" AS ENUM('buy', 'sell', 'subscription', 'redemption');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"iol_account_number" text NOT NULL,
	"name" text,
	"currency" "currency" DEFAULT 'ARS' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "iol_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"iol_username" text NOT NULL,
	"iol_password_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"iol_operation_id" text NOT NULL,
	"symbol" text NOT NULL,
	"market" "market" NOT NULL,
	"type" "operation_type" NOT NULL,
	"status" "operation_status" DEFAULT 'accepted' NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"price" numeric(20, 6) NOT NULL,
	"total" numeric(20, 2) NOT NULL,
	"commission" numeric(20, 2) DEFAULT '0',
	"currency" "currency" DEFAULT 'ARS' NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"total_value" numeric(20, 2) NOT NULL,
	"cash" numeric(20, 2) NOT NULL,
	"currency" "currency" DEFAULT 'ARS' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"market" "market" NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"avg_price" numeric(20, 6),
	"last_price" numeric(20, 6),
	"currency" "currency" DEFAULT 'ARS' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text NOT NULL,
	"market" "market" NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"open" numeric(20, 6),
	"high" numeric(20, 6),
	"low" numeric(20, 6),
	"close" numeric(20, 6) NOT NULL,
	"volume" integer,
	"currency" "currency" DEFAULT 'ARS' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iol_connections" ADD CONSTRAINT "iol_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_iol_number_unique" ON "accounts" USING btree ("user_id","iol_account_number");--> statement-breakpoint
CREATE INDEX "iol_connections_user_idx" ON "iol_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "iol_connections_user_unique" ON "iol_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "operations_account_idx" ON "operations" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "operations_symbol_idx" ON "operations" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "operations_date_idx" ON "operations" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_iol_id_unique" ON "operations" USING btree ("iol_operation_id");--> statement-breakpoint
CREATE INDEX "snapshots_account_idx" ON "portfolio_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "snapshots_captured_at_idx" ON "portfolio_snapshots" USING btree ("captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_account_time_unique" ON "portfolio_snapshots" USING btree ("account_id","captured_at");--> statement-breakpoint
CREATE INDEX "positions_account_idx" ON "positions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_symbol_unique" ON "positions" USING btree ("account_id","symbol","market");--> statement-breakpoint
CREATE INDEX "price_history_symbol_idx" ON "price_history" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "price_history_symbol_date_unique" ON "price_history" USING btree ("symbol","market","date");