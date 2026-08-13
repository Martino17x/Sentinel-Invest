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
 * Aplica las migraciones idempotentes. Llamar al boot del server.
 * Nunca debe romper el arranque: cualquier fallo queda registrado
 * como warning (los reportes se degradan, la app sigue viva).
 */
export async function ensureSchema(): Promise<void> {
  for (const statement of SNAPSHOT_COLUMN_MIGRATIONS) {
    await db.execute(statement);
  }
}
