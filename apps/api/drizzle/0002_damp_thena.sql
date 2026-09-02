CREATE TYPE "public"."cash_movement_source" AS ENUM('manual', 'imported', 'detected');--> statement-breakpoint
CREATE TYPE "public"."cash_movement_status" AS ENUM('confirmed', 'pending', 'rejected');--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"date" date NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"type" text DEFAULT 'deposit' NOT NULL,
	"source" "cash_movement_source" DEFAULT 'manual' NOT NULL,
	"status" "cash_movement_status" DEFAULT 'pending' NOT NULL,
	"description" text,
	"iol_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "cash_movements_type_check" CHECK (type IN ('deposit', 'withdrawal', 'dividend', 'caucion', 'adjustment'))
);
--> statement-breakpoint
CREATE TABLE "snapshot_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"market" "market" NOT NULL,
	"asset_type" text,
	"quantity" numeric(20, 6) NOT NULL,
	"avg_price" numeric(20, 6),
	"last_price" numeric(20, 6),
	"total_value" numeric(20, 2) NOT NULL,
	"currency" "currency" DEFAULT 'ARS' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD COLUMN "source" text DEFAULT 'real' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_positions" ADD CONSTRAINT "snapshot_positions_snapshot_id_portfolio_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."portfolio_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_account_idx" ON "cash_movements" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "cash_movements_date_idx" ON "cash_movements" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_movements_dedup_unique" ON "cash_movements" USING btree ("account_id","date","amount","currency","type","source");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_movements_detected_1per_day" ON "cash_movements" USING btree ("account_id","date") WHERE source = 'detected';--> statement-breakpoint
CREATE INDEX "snapshot_positions_snapshot_idx" ON "snapshot_positions" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_positions_snapshot_symbol_market_unique" ON "snapshot_positions" USING btree ("snapshot_id","symbol","market");--> statement-breakpoint
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "snapshots_source_check" CHECK (source IN ('real', 'reconstructed'));