CREATE TYPE "public"."broker_type" AS ENUM('iol', 'ppi');--> statement-breakpoint
CREATE TABLE "broker_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"broker_type" "broker_type" NOT NULL,
	"username" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "broker_connections" ADD CONSTRAINT "broker_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broker_connections_user_idx" ON "broker_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "broker_connections_user_broker_unique" ON "broker_connections" USING btree ("user_id","broker_type");--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "broker_type" "broker_type";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "broker_account_number" text;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_broker_account_unique" ON "accounts" USING btree ("user_id","broker_type","broker_account_number");--> statement-breakpoint
-- Backfill: iol_connections → broker_connections con broker_type='iol' (idempotente)
INSERT INTO "broker_connections" ("user_id", "broker_type", "username", "password_encrypted", "refresh_token_encrypted", "is_active", "created_at", "updated_at")
SELECT "user_id", 'iol'::"broker_type", "iol_username", "iol_password_encrypted", "refresh_token_encrypted", "is_active", "created_at", "updated_at"
FROM "iol_connections"
ON CONFLICT ("user_id", "broker_type") DO NOTHING;--> statement-breakpoint
-- Backfill accounts: copiar iolAccountNumber → brokerAccountNumber con broker_type='iol' donde null
UPDATE "accounts" SET "broker_type" = 'iol'::"broker_type", "broker_account_number" = "iol_account_number" WHERE "broker_type" IS NULL;--> statement-breakpoint
