import { sql } from "drizzle-orm";
import { db } from "./index.js";

/**
 * Migraciones idempotentes que se ejecutan al arrancar el server.
 * No reemplazan drizzle-kit: cubren cambios ad-hoc que no queremos
 * versionar en una migración formal (o bases donde el schema ya vive).
 * Cada statement es idempotente (IF NOT EXISTS) — se puede correr N veces.
 */
const SNAPSHOT_COLUMN_MIGRATIONS = [
  sql`ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS total_value_usd numeric(20,2) NOT NULL DEFAULT 0`,
  sql`ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS cash_ars numeric(20,2) NOT NULL DEFAULT 0`,
  sql`ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS cash_usd numeric(20,2) NOT NULL DEFAULT 0`,
  sql`ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS positions_value numeric(20,2) NOT NULL DEFAULT 0`,
  sql`ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS unrealized_gain numeric(20,2) NOT NULL DEFAULT 0`,
  sql`ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS day_change_pct numeric(10,4) NOT NULL DEFAULT 0`,
];

/**
 * Tipos enum del motor de agente (idempotentes: Postgres no tiene
 * CREATE TYPE IF NOT EXISTS, así que el DO block traga duplicate_object).
 */
const AGENT_ENUM_MIGRATIONS = [
  sql`DO $$ BEGIN
        CREATE TYPE chat_role AS ENUM ('user', 'assistant', 'tool');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`,
  sql`DO $$ BEGIN
        CREATE TYPE api_key_scope AS ENUM ('read', 'trade');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`,
  sql`DO $$ BEGIN
        CREATE TYPE pending_order_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`,
];

/**
 * Tablas del motor de agente — ADDITIVE, sin tocar tablas existentes.
 * Espejan server/src/db/schema.ts (ai_chat_sessions, ai_chat_messages,
 * api_keys, agent_actions). Re-correr N veces = no-op.
 */
const AGENT_TABLE_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS ai_chat_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE INDEX IF NOT EXISTS ai_chat_sessions_user_idx ON ai_chat_sessions (user_id)`,
  sql`CREATE TABLE IF NOT EXISTS ai_chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES ai_chat_sessions(id) ON DELETE CASCADE,
        role chat_role NOT NULL,
        content text,
        tool_calls jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE INDEX IF NOT EXISTS ai_chat_messages_session_idx ON ai_chat_messages (session_id, created_at)`,
  sql`CREATE TABLE IF NOT EXISTS api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL,
        prefix text NOT NULL,
        key_hash text NOT NULL UNIQUE,
        scope api_key_scope NOT NULL DEFAULT 'read',
        enabled boolean NOT NULL DEFAULT true,
        last_used_at timestamptz,
        expires_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id)`,
  sql`CREATE TABLE IF NOT EXISTS agent_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tool text NOT NULL,
        args_sanitized jsonb,
        result_status text NOT NULL,
        client_name text NOT NULL DEFAULT 'chat',
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE INDEX IF NOT EXISTS agent_actions_user_idx ON agent_actions (user_id, created_at)`,
  sql`CREATE TABLE IF NOT EXISTS pending_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tool text NOT NULL,
        args jsonb NOT NULL,
        summary text NOT NULL,
        status pending_order_status NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz
      )`,
  sql`CREATE INDEX IF NOT EXISTS pending_orders_user_idx ON pending_orders (user_id, status, created_at)`,
];

/**
 * Aplica las migraciones idempotentes. Llamar al boot del server.
 * Nunca debe romper el arranque: cualquier fallo queda registrado
 * como warning (los reportes se degradan, la app sigue viva).
 */
export async function ensureSchema(): Promise<void> {
  for (const statement of [
    ...SNAPSHOT_COLUMN_MIGRATIONS,
    ...AGENT_ENUM_MIGRATIONS,
    ...AGENT_TABLE_MIGRATIONS,
  ]) {
    await db.execute(statement);
  }
}
