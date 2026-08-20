// ============================================================
// QUOTES SNAPSHOT STORE — persistencia del panel al cierre
//
// Guarda snapshots del panel de BYMA (quotes + summary) en
// quotes_snapshots para servirlos cuando BYMA da 502 fuera de
// horario. Un snapshot por (market, assetType, snapshotDate ART).
//
// La tabla es compartida (dato de mercado, no por usuario).
// ============================================================

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { artDateKeyFromUtc, artTodayKey } from "../reports/art-time.js";
import type { PanelQuote, PanelSummary } from "../iol/types.js";

export interface QuotesSnapshotPayload {
  summary: PanelSummary;
  quotes: PanelQuote[];
  total: number;
}

/** Tupada cruda de la tabla (drizzle la infiere, pero la tipamos explícita) */
export interface QuotesSnapshotRow {
  id: string;
  market: string;
  assetType: string;
  snapshotDate: string;
  payload: QuotesSnapshotPayload;
  capturedAt: string;
}

// ============================================================
// Helpers de fecha ART
// ============================================================

/** Convierte un ISO de capturedAt a DD/MM para el mensaje "Datos al cierre del DD/MM" */
export function formatSnapshotDate(capturedAt: string | Date): string {
  const d = typeof capturedAt === "string" ? new Date(capturedAt) : capturedAt;
  // La fecha ya está en ART como snapshot_date, pero capturedAt es UTC.
  // Usamos ART para derivar el día correcto.
  const key = artDateKeyFromUtc(d); // YYYY-MM-DD en ART
  const [y, m, day] = key.split("-");
  return `${day}/${m}/${y}`;
}

// ============================================================
// Persistencia
// ============================================================

/**
 * Guarda el snapshot del día para (market, assetType). Idempotente por
 * UNIQUE(market, asset_type, snapshot_date): ON CONFLICT UPDATE.
 * Si el snapshot del día ya existe, lo pisa con los datos más frescos
 * (el cierre puede refinarse si el job corre dos veces).
 */
export async function saveQuotesSnapshot(
  market: string,
  assetType: string,
  payload: QuotesSnapshotPayload
): Promise<void> {
  const snapshotDate = artTodayKey();
  const capturedAt = new Date();

  await db.execute(sql`
    INSERT INTO quotes_snapshots (market, asset_type, snapshot_date, payload, captured_at)
    VALUES (${market}, ${assetType}, ${snapshotDate}, ${JSON.stringify(payload)}::jsonb, ${capturedAt.toISOString()}::timestamptz)
    ON CONFLICT (market, asset_type, snapshot_date)
    DO UPDATE SET payload = EXCLUDED.payload, captured_at = EXCLUDED.captured_at
  `);
}

/**
 * Snapshot más reciente para (market, assetType) dentro de los últimos N días hábiles.
 * Por defecto N=7 para cubrir feriados largos (ej. Semana Santa).
 * Devuelve null si no hay snapshot.
 */
export async function getLatestQuotesSnapshot(
  market: string,
  assetType: string,
  maxAgeDays = 7
): Promise<QuotesSnapshotRow | null> {
  // Filtro temporal: snapshot_date >= hoy - maxAgeDays (server UTC, pero date es ART ya)
  // Calculamos la fecha límite en ART.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffKey = artDateKeyFromUtc(cutoff);

  const rows = await db
    .select()
    .from(schema.quotesSnapshots)
    .where(
      and(
        eq(schema.quotesSnapshots.market, market),
        eq(schema.quotesSnapshots.assetType, assetType),
        gte(schema.quotesSnapshots.snapshotDate, cutoffKey)
      )
    )
    .orderBy(desc(schema.quotesSnapshots.snapshotDate), desc(schema.quotesSnapshots.capturedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0] as unknown as {
    id: string;
    market: string;
    assetType: string;
    snapshotDate: string;
    payload: QuotesSnapshotPayload;
    capturedAt: Date | string;
  };
  return {
    id: r.id,
    market: r.market,
    assetType: r.assetType,
    snapshotDate: r.snapshotDate,
    payload: r.payload,
    capturedAt: r.capturedAt instanceof Date ? r.capturedAt.toISOString() : (r.capturedAt as string),
  };
}

/**
 * Busca un símbolo en todos los snapshots recientes (últimos 7 días).
 * Útil para fallback de GET /quotes/:symbol cuando BYMA falla.
 */
export async function getCachedQuoteBySymbol(
  symbol: string,
  maxAgeDays = 7
): Promise<{ quote: PanelQuote; capturedAt: string; message: string } | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffKey = artDateKeyFromUtc(cutoff);
  const target = symbol.toUpperCase();

  const rows = await db
    .select()
    .from(schema.quotesSnapshots)
    .where(gte(schema.quotesSnapshots.snapshotDate, cutoffKey))
    .orderBy(desc(schema.quotesSnapshots.snapshotDate), desc(schema.quotesSnapshots.capturedAt));

  for (const r of rows) {
    const raw = r as unknown as {
      payload: QuotesSnapshotPayload;
      capturedAt: Date | string;
    };
    const quotes = (raw.payload?.quotes ?? []) as PanelQuote[];
    const found = quotes.find((q) => q.symbol.toUpperCase() === target);
    if (found) {
      const capturedAt =
        raw.capturedAt instanceof Date ? raw.capturedAt.toISOString() : (raw.capturedAt as string);
      return {
        quote: found,
        capturedAt,
        message: `Datos al cierre del ${formatSnapshotDate(capturedAt)}`,
      };
    }
  }
  return null;
}

/**
 * Totales por panel — útil para el job que lista qué combinaciones snapshotea.
 */
export async function listRecentSnapshots(): Promise<QuotesSnapshotRow[]> {
  const rows = await db
    .select()
    .from(schema.quotesSnapshots)
    .orderBy(desc(schema.quotesSnapshots.snapshotDate))
    .limit(20);
  return rows.map((r) => ({
    id: (r as unknown as { id: string }).id,
    market: (r as unknown as { market: string }).market,
    assetType: (r as unknown as { assetType: string }).assetType,
    snapshotDate: (r as unknown as { snapshotDate: string }).snapshotDate,
    payload: (r as unknown as { payload: QuotesSnapshotPayload }).payload,
    capturedAt:
      (r as unknown as { capturedAt: Date | string }).capturedAt instanceof Date
        ? ((r as unknown as { capturedAt: Date }).capturedAt as Date).toISOString()
        : ((r as unknown as { capturedAt: string }).capturedAt as string),
  }));
}
