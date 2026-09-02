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
  // Origen del snapshot (real | reconstructed) — el CHECK viaja con la columna
  // y el ADD COLUMN IF NOT EXISTS hace el statement idempotente completo.
  sql`ALTER TABLE portfolio_snapshots ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'real' CHECK (source IN ('real', 'reconstructed'))`,
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
 * Enums del cash ledger (reportes). Mismo patrón idempotente: Postgres
 * no tiene CREATE TYPE IF NOT EXISTS, el DO block traga duplicate_object.
 * Deben correr ANTES de las tablas que los referencian.
 */
const CASH_ENUM_MIGRATIONS = [
  sql`DO $$ BEGIN
        CREATE TYPE cash_movement_source AS ENUM ('manual', 'imported', 'detected');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`,
  sql`DO $$ BEGIN
        CREATE TYPE cash_movement_status AS ENUM ('confirmed', 'pending', 'rejected');
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
        enabled_categories jsonb,
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
 * Tablas del cash ledger y composición de snapshots — ADDITIVE.
 * Espejan db/schema.ts. Re-correr N veces = no-op.
 */
const REPORT_TABLE_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS snapshot_positions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        snapshot_id uuid NOT NULL REFERENCES portfolio_snapshots(id) ON DELETE CASCADE,
        symbol text NOT NULL,
        market market NOT NULL,
        asset_type text,
        quantity numeric(20,6) NOT NULL,
        avg_price numeric(20,6),
        last_price numeric(20,6),
        total_value numeric(20,2) NOT NULL,
        currency currency NOT NULL DEFAULT 'ARS',
        UNIQUE (snapshot_id, symbol, market)
      )`,
  sql`CREATE INDEX IF NOT EXISTS snapshot_positions_snapshot_idx ON snapshot_positions (snapshot_id)`,
  sql`CREATE TABLE IF NOT EXISTS cash_movements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        date date NOT NULL,
        amount numeric(20,2) NOT NULL,
        currency currency NOT NULL,
        type text NOT NULL DEFAULT 'deposit' CHECK (type IN ('deposit', 'withdrawal', 'dividend', 'caucion', 'adjustment')),
        source cash_movement_source NOT NULL DEFAULT 'manual',
        status cash_movement_status NOT NULL DEFAULT 'pending',
        description text,
        iol_reference text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        decided_at timestamptz,
        UNIQUE (account_id, date, amount, currency, type, source)
      )`,
  sql`CREATE INDEX IF NOT EXISTS cash_movements_account_idx ON cash_movements (account_id)`,
  sql`CREATE INDEX IF NOT EXISTS cash_movements_date_idx ON cash_movements (date)`,
  // Partial unique: los detected son 1/día por definición (design D5)
  sql`CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_detected_1per_day ON cash_movements (account_id, date) WHERE source = 'detected'`,
];

/** Tabla de snapshots de cotizaciones al cierre (BYMA) — ADDITIVE. */
const QUOTES_SNAPSHOT_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS quotes_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        market text NOT NULL,
        asset_type text NOT NULL,
        snapshot_date date NOT NULL,
        payload jsonb NOT NULL,
        captured_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (market, asset_type, snapshot_date)
      )`,
  sql`CREATE INDEX IF NOT EXISTS quotes_snapshots_market_idx ON quotes_snapshots (market, asset_type)`,
  sql`CREATE INDEX IF NOT EXISTS quotes_snapshots_date_idx ON quotes_snapshots (snapshot_date)`,
];

/** Tabla de snapshots de analytics de bonos al cierre — ADDITIVE, idempotente. */
const BOND_ANALYTICS_SNAPSHOT_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS bond_analytics_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        market text NOT NULL,
        asset_type text NOT NULL,
        snapshot_date date NOT NULL,
        payload jsonb NOT NULL,
        captured_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (market, asset_type, snapshot_date)
      )`,
  sql`CREATE INDEX IF NOT EXISTS bond_analytics_snapshots_market_idx ON bond_analytics_snapshots (market, asset_type)`,
  sql`CREATE INDEX IF NOT EXISTS bond_analytics_snapshots_date_idx ON bond_analytics_snapshots (snapshot_date)`,
];

/** Tabla de histórico CER diario — ADDITIVE, idempotente. Fallback offline para T-001. */
const BCRA_CER_HISTORY_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS bcra_cer_history (
        fecha date PRIMARY KEY,
        valor numeric(20,6) NOT NULL,
        source text NOT NULL DEFAULT 'bcra.gob.ar',
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE INDEX IF NOT EXISTS bcra_cer_history_fecha_idx ON bcra_cer_history (fecha)`,
];

/** Columna enabled_categories en api_keys — ADDITIVE, idempotente. F1 agent-connect. */
const API_KEYS_CAPABILITIES_MIGRATIONS = [
  sql`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS enabled_categories jsonb`,
];

/** Portafolios virtuales (Opción A) — ADDITIVE, idempotente. */
const VIRTUAL_PORTFOLIO_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS virtual_portfolios (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 50),
        description text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE INDEX IF NOT EXISTS virtual_portfolios_user_idx ON virtual_portfolios (user_id)`,
  sql`CREATE TABLE IF NOT EXISTS virtual_positions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        portfolio_id uuid NOT NULL REFERENCES virtual_portfolios(id) ON DELETE CASCADE,
        symbol text NOT NULL,
        quantity numeric(20,6) NOT NULL,
        avg_price numeric(20,6) NOT NULL,
        currency currency NOT NULL DEFAULT 'ARS',
        market market NOT NULL DEFAULT 'bcba',
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (portfolio_id, symbol, market)
      )`,
  sql`CREATE INDEX IF NOT EXISTS virtual_positions_portfolio_idx ON virtual_positions (portfolio_id)`,
];

/**
 * Enums del perfil inversor (risk_tolerance, horizon) — idempotentes
 * vía DO block (Postgres no tiene CREATE TYPE IF NOT EXISTS).
 */
const INVESTOR_ENUM_MIGRATIONS = [
  sql`DO $$ BEGIN
        CREATE TYPE risk_tolerance AS ENUM ('conservador', 'moderado', 'agresivo');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`,
  sql`DO $$ BEGIN
        CREATE TYPE horizon AS ENUM ('corto', 'medio', 'largo');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`,
];

/**
 * Enum created_by para portfolio_investment_plans — idempotente
 * vía DO block (Postgres no tiene CREATE TYPE IF NOT EXISTS).
 */
const INVESTMENT_PLAN_ENUM_MIGRATIONS = [
  sql`DO $$ BEGIN
        CREATE TYPE created_by AS ENUM ('user', 'agent');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`,
];

/**
 * Tabla portfolio_investment_plans — ADDITIVE, idempotente.
 * Espeja apps/api/src/db/schema.ts (portfolioInvestmentPlans).
 * Incluye CREATE TABLE IF NOT EXISTS + índices + ALTER ADD COLUMN
 * para drift, y seed v1 idempotente para f4948001-... (ON CONFLICT DO NOTHING).
 */
const INVESTMENT_PLAN_TABLE_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS portfolio_investment_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        portfolio_id uuid NOT NULL REFERENCES virtual_portfolios(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        version integer NOT NULL CHECK (version > 0),
        title text NOT NULL,
        objective text,
        allocation_target jsonb NOT NULL,
        rationale text,
        constraints jsonb,
        created_by created_by NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (portfolio_id, version)
      )`,
  sql`CREATE INDEX IF NOT EXISTS plans_portfolio_idx ON portfolio_investment_plans (portfolio_id)`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS plans_portfolio_version_unique ON portfolio_investment_plans (portfolio_id, version)`,
  // Drift guards — ALTER ADD COLUMN IF NOT EXISTS para cada columna
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS portfolio_id uuid`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS user_id uuid`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS version integer`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS title text`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS objective text`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS allocation_target jsonb`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS rationale text`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS constraints jsonb`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS created_by created_by`,
  sql`ALTER TABLE portfolio_investment_plans ADD COLUMN IF NOT EXISTS created_at timestamptz`,
  // Seed v1 idempotente — 40/35/15/10 (CER 40, equity global/local 35, dollar_linked 15, cash 10)
  // allocation_target: T2X5 20 + TX26 20 = 40 CER, SPY 10 + AAPL 10 + MSFT 7 + META 5 + YPFD 3 = 35 equity, dollar_linked 15, cash 10
  sql`INSERT INTO portfolio_investment_plans (portfolio_id, user_id, version, title, objective, allocation_target, rationale, constraints, created_by)
      SELECT 'f4948001-3807-404c-bca0-b08f9d803404', user_id, 1, 'Cartera Moderada CER+ Diversificada v1', 'Superar CER con diversificacion moderada 40% CER / 35% equity global y local / 15% dollar-linked / 10% cash', '{"T2X5":20,"TX26":20,"SPY":10,"AAPL":10,"MSFT":7,"META":5,"YPFD":3,"cash":10,"dollar_linked":15}'::jsonb, 'Plan base v1: 40% CER (T2X5/TX26) para cobertura inflacion, 35% equity diversificado global y local (SPY/AAPL/MSFT/META/YPFD), 15% dollar-linked y 10% cash para liquidez. Objetivo superar CER con volatilidad moderada.', '{"maxPorActivo":25,"maxSector":40,"betaMax":1.2}'::jsonb, 'user'::created_by
      FROM virtual_portfolios WHERE id = 'f4948001-3807-404c-bca0-b08f9d803404'
      ON CONFLICT (portfolio_id, version) DO NOTHING`,
];

/**
 * Tablas del perfil inversor + stubs advisory — ADDITIVE, idempotente.
 * Espejan apps/api/src/db/schema.ts (investor_profiles, analysis_runs,
 * portfolio_proposals). Re-correr N veces = no-op.
 */
const INVESTOR_TABLE_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS investor_profiles (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        risk_tolerance risk_tolerance NOT NULL,
        horizon horizon NOT NULL,
        knowledge_level text NOT NULL,
        loss_tolerance_pct integer NOT NULL,
        investment_goal text NOT NULL,
        risk_score integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
        profile_version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE TABLE IF NOT EXISTS analysis_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        payload jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE INDEX IF NOT EXISTS analysis_runs_user_idx ON analysis_runs (user_id)`,
  sql`CREATE TABLE IF NOT EXISTS portfolio_proposals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        analysis_run_id uuid REFERENCES analysis_runs(id) ON DELETE SET NULL,
        payload jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now()
      )`,
  sql`CREATE INDEX IF NOT EXISTS portfolio_proposals_user_idx ON portfolio_proposals (user_id)`,
  sql`CREATE INDEX IF NOT EXISTS portfolio_proposals_analysis_run_idx ON portfolio_proposals (analysis_run_id)`,
  sql`ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS risk_tolerance risk_tolerance`,
  sql`ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS horizon horizon`,
  sql`ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS knowledge_level text`,
  sql`ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS loss_tolerance_pct integer`,
  sql`ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS investment_goal text`,
  sql`ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS risk_score integer`,
  sql`ALTER TABLE investor_profiles ADD COLUMN IF NOT EXISTS profile_version integer`,
  sql`ALTER TABLE portfolio_proposals ADD COLUMN IF NOT EXISTS analysis_run_id uuid`,
];

/**
 * Enum broker_type + tabla broker_connections + columnas accounts (Req 2).
 * Idempotente: DO block para enum, CREATE TABLE IF NOT EXISTS + IF NOT EXISTS cols.
 * Backfill desde iol_connections con broker_type='iol' se hace en ensureSchema
 * con INSERT ... ON CONFLICT DO NOTHING (no bloquea si tabla vacía).
 */
const BROKER_ENUM_MIGRATIONS = [
  sql`DO $$ BEGIN
        CREATE TYPE broker_type AS ENUM ('iol', 'ppi');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$`,
];

const BROKER_TABLE_MIGRATIONS = [
  sql`CREATE TABLE IF NOT EXISTS broker_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        broker_type broker_type NOT NULL,
        username text NOT NULL,
        password_encrypted text NOT NULL,
        refresh_token_encrypted text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, broker_type)
      )`,
  sql`CREATE INDEX IF NOT EXISTS broker_connections_user_idx ON broker_connections (user_id)`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS broker_connections_user_broker_unique ON broker_connections (user_id, broker_type)`,
  sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS broker_type broker_type`,
  sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS broker_account_number text`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_broker_account_unique ON accounts (user_id, broker_type, broker_account_number)`,
  // Backfill idempotente desde iol_connections (si existe y tiene datos)
  sql`INSERT INTO broker_connections (user_id, broker_type, username, password_encrypted, refresh_token_encrypted, is_active, created_at, updated_at)
      SELECT user_id, 'iol'::broker_type, iol_username, iol_password_encrypted, refresh_token_encrypted, is_active, created_at, updated_at
      FROM iol_connections
      ON CONFLICT (user_id, broker_type) DO NOTHING`,
  sql`UPDATE accounts SET broker_type = 'iol'::broker_type, broker_account_number = iol_account_number WHERE broker_type IS NULL`,
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
    ...CASH_ENUM_MIGRATIONS,
    ...AGENT_TABLE_MIGRATIONS,
    ...REPORT_TABLE_MIGRATIONS,
    ...QUOTES_SNAPSHOT_MIGRATIONS,
    ...BOND_ANALYTICS_SNAPSHOT_MIGRATIONS,
    ...BCRA_CER_HISTORY_MIGRATIONS,
    ...API_KEYS_CAPABILITIES_MIGRATIONS,
    ...VIRTUAL_PORTFOLIO_MIGRATIONS,
    ...INVESTOR_ENUM_MIGRATIONS,
    ...INVESTOR_TABLE_MIGRATIONS,
    ...INVESTMENT_PLAN_ENUM_MIGRATIONS,
    ...INVESTMENT_PLAN_TABLE_MIGRATIONS,
    ...BROKER_ENUM_MIGRATIONS,
    ...BROKER_TABLE_MIGRATIONS,
  ]) {
    await db.execute(statement);
  }
}
