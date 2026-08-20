// ============================================================
// bondAnalyticsSnapshot.ts — Snapshot diario de analytics+curvas
//
// Corre lun-vie 17:10 ART (después del cierre BYMA 17:00, antes del
// reconciliation). Persiste en bond_analytics_snapshots (market, assetType,
// snapshotDate) payload {analytics, curves} para stale-fallback de
// routes/bonds.ts.
//
// Diseño (replica quotesSnapshot.ts):
// - Deps inyectables → testeable con fakes.
// - Un panel que falla se loguea y no detiene el resto.
// - Idempotente: ON CONFLICT (market,asset_type,snapshotDate) DO UPDATE
// - Usa maeFlujo como fuente H/B; fallback BYMA public-bonds para LECAP/BONCAP/CER
//   cuando MAE no cubre (curva local se completa con buildCurve).
// ============================================================

import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { getAllMaeAnalytics } from "../services/market/bonds/maeFlujo.js";
import { buildCurve } from "../services/market/bonds/curve.js";
import type { BondAnalytics, CurvePoint } from "../services/market/bonds/types.js";
import { artTodayKey } from "../services/reports/art-time.js";

export interface BondAnalyticsSnapshotPayload {
  analytics: BondAnalytics[];
  curves: Record<string, CurvePoint[]>;
  panelSnapshot?: import("../services/market/bonds/types.js").BondPanelResponse | null;
}

export interface BondAnalyticsSnapshotDeps {
  fetchAnalytics: () => Promise<BondAnalytics[]>;
  saveSnapshot: (
    market: string,
    assetType: string,
    payload: BondAnalyticsSnapshotPayload,
  ) => Promise<void>;
  log: Pick<Console, "log" | "warn" | "error">;
}

export interface BondAnalyticsSnapshotOutcome {
  ok: boolean;
  analyticsCount: number;
  curvesCount: number;
  error?: string;
}

// ------------------------------------------------------------
// Default deps
// ------------------------------------------------------------

async function defaultFetchAnalytics(): Promise<BondAnalytics[]> {
  // Fuente primaria: MAE H/B (cubre hard dollar + BOPREAL)
  // Para LECAP/BONCAP/CER, MAE no expone; se cubrirá en Fase local
  // (por ahora snapshot guarda lo que MAE tiene; curve.ts agrupará).
  const analytics = await getAllMaeAnalytics();
  return analytics;
}

async function defaultSaveSnapshot(
  market: string,
  assetType: string,
  payload: BondAnalyticsSnapshotPayload,
): Promise<void> {
  const snapshotDate = artTodayKey();
  const capturedAt = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO bond_analytics_snapshots (market, asset_type, snapshot_date, payload, captured_at)
    VALUES (${market}, ${assetType}, ${snapshotDate}, ${JSON.stringify(payload)}::jsonb, ${capturedAt}::timestamptz)
    ON CONFLICT (market, asset_type, snapshot_date)
    DO UPDATE SET payload = EXCLUDED.payload, captured_at = EXCLUDED.captured_at
  `);
}

export function makeBondAnalyticsSnapshotDeps(
  overrides: Partial<BondAnalyticsSnapshotDeps> = {},
): BondAnalyticsSnapshotDeps {
  return {
    fetchAnalytics: defaultFetchAnalytics,
    saveSnapshot: defaultSaveSnapshot,
    log: console,
    ...overrides,
  };
}

// ------------------------------------------------------------
// Core job
// ------------------------------------------------------------

/**
 * Captura analytics+curvas y persiste snapshot diario.
 * Idempotente por (market, assetType, snapshotDate).
 */
export async function runBondAnalyticsSnapshot(
  deps: BondAnalyticsSnapshotDeps = makeBondAnalyticsSnapshotDeps(),
): Promise<BondAnalyticsSnapshotOutcome> {
  try {
    const analytics = await deps.fetchAnalytics();

    if (!analytics || analytics.length === 0) {
      deps.log.warn("⚠️ bond-analytics-snapshot: sin analytics (MAE vacío o BYMA caído) — no se guarda snapshot");
      return { ok: false, analyticsCount: 0, curvesCount: 0, error: "sin analytics" };
    }

    const curves = buildCurve(analytics);

    const payload: BondAnalyticsSnapshotPayload = {
      analytics,
      curves,
    };

    // Persistir como bonos: market=bonds, assetType=bonds (único panel por ahora)
    // Futuro: separar por segmento si se requiere granularidad
    await deps.saveSnapshot("bonds", "bonds", payload);

    const totalCurvePoints = Object.values(curves).reduce((s, arr) => s + arr.length, 0);
    deps.log.log(
      `📸 bond-analytics-snapshot: ${analytics.length} analytics, ${totalCurvePoints} puntos de curva guardados`,
    );

    return {
      ok: true,
      analyticsCount: analytics.length,
      curvesCount: totalCurvePoints,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log.warn(`⚠️ bond-analytics-snapshot: ${message}`);
    return { ok: false, analyticsCount: 0, curvesCount: 0, error: message };
  }
}

/**
 * Helper para routes: lee último snapshot (stale fallback).
 * Reutiliza art-time cutoff de 7 días.
 */
export async function getLatestBondAnalyticsSnapshot(
  maxAgeDays = 7,
): Promise<{ payload: BondAnalyticsSnapshotPayload; snapshotDate: string; capturedAt: string } | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const { artDateKeyFromUtc } = await import("../services/reports/art-time.js");
  const cutoffKey = artDateKeyFromUtc(cutoff);

  const rows = await db.execute(sql`
    SELECT payload, snapshot_date, captured_at
    FROM bond_analytics_snapshots
    WHERE asset_type = 'bonds' AND market = 'bonds' AND snapshot_date >= ${cutoffKey}
    ORDER BY snapshot_date DESC, captured_at DESC
    LIMIT 1
  `);
  const r = (rows as unknown as { rows: Array<{ payload: BondAnalyticsSnapshotPayload; snapshot_date: string; captured_at: string }> }).rows?.[0];
  if (!r) return null;
  return { payload: r.payload as BondAnalyticsSnapshotPayload, snapshotDate: r.snapshot_date, capturedAt: r.captured_at };
}
