// ============================================================
// bondsQueries.ts — Reusable bond query helpers extracted from
// routes/bonds.ts for sharing between REST routes and agent tools.
//
// Preserves SwrCache TTLs, inFlight dedup, bgInFlight, and snapshot
// fallback (bondAnalyticsSnapshot 7d) exactly as in the route layer.
// ============================================================

import { z } from "zod";
import { SwrCache } from "../cache.js";
import { DISCLAIMER } from "../radar.js";
import { pool } from "../../../db/index.js";
import { BymaDataProvider, parseInteresToCouponRate } from "../../iol/BymaDataProvider.js";
import { getAllMaeAnalytics, getMaeAnalyticsForSymbol } from "./maeFlujo.js";
import { buildCurve, VALID_SEGMENTS, inferSegment } from "./curve.js";
import { projectCashflow } from "./cashflow.js";
import { getLatestBondAnalyticsSnapshot } from "../../../jobs/bondAnalyticsSnapshot.js";
import { calcTIR } from "./tir.js";
import { calcDurations } from "./duration.js";
import { calcParidad, calcCuadroTecnico, calcAccruedFromFicha } from "./paridad.js";
import type { BondAnalytics, CurvePoint, CashflowMonth, BondPanelRow, BondPanelResponse, BondCuadroTecnico, BondMarketData } from "./types.js";

// Re-export canonical disclaimer and segment constants for consumers
export { DISCLAIMER, VALID_SEGMENTS, inferSegment };

// ---------------------------------------------------------------------------
// Caches — SwrCache 5-15min (spec + design)
// analytics 10min, curve 15min, cashflow 5min, panel 5min
// ---------------------------------------------------------------------------

const ANALYTICS_TTL_MS = 10 * 60 * 1000;
const CURVE_TTL_MS = 15 * 60 * 1000;
const CASHFLOW_TTL_MS = 5 * 60 * 1000;
const PANEL_TTL_MS = 5 * 60 * 1000;

export const bondsAnalyticsCache = new SwrCache<BondAnalytics>(ANALYTICS_TTL_MS);
export const bondsCurveCache = new SwrCache<{ points: CurvePoint[]; generatedAt: string }>(CURVE_TTL_MS);
export const bondsCashflowCache = new SwrCache<{ months: CashflowMonth[] }>(CASHFLOW_TTL_MS);
export const bondsPanelCache = new SwrCache<{ rows: BondPanelRow[]; generatedAt: string }>(PANEL_TTL_MS);

const inFlightAnalytics = new Map<string, Promise<BondAnalytics>>();
const inFlightCurve = new Map<string, Promise<CurvePoint[]>>();
const bgInFlight = new Map<string, Promise<void>>();
const inFlightPanel = new Map<string, Promise<{ rows: BondPanelRow[]; generatedAt: string }>>();
const bgPanelInFlight = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Helpers: analytics fetch (MAE + local fallback)
// ---------------------------------------------------------------------------

export async function fetchBondAnalytics(symbol: string, signal?: AbortSignal): Promise<BondAnalytics> {
  const sym = symbol.toUpperCase().trim();

  // 1) MAE direct — covers ~50 hard-dollar + BOPREAL
  try {
    const mae = await getMaeAnalyticsForSymbol(sym, signal);
    if (mae) {
      return { ...mae, disclaimer: DISCLAIMER };
    }
  } catch {
    // fall through to local
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  }

  // 2) Local fallback: ficha BYMA + price + calcTIR/duration/paridad
  const provider = new BymaDataProvider();
  const schedule = await provider.getBondSchedule(sym);

  // Price: try panel public-bonds first, fallback to provider.getQuote placeholder
  let dirtyPrice = 0;
  let lastPriceCurrency: string | undefined;
  try {
    const q = await provider.getQuote({ id: "", email: "" } as never, sym, "bcba");
    dirtyPrice = q.lastPrice ?? 0;
    lastPriceCurrency = q.currency;
  } catch {
    dirtyPrice = 0;
  }

  if (!dirtyPrice || dirtyPrice <= 0) {
    throw new Error(`BYMA price not available for ${sym}`);
  }

  const settlement = new Date().toISOString().slice(0, 10);
  const dayCount: "30/360" | "Actual/365" = schedule.moneda === "USD" ? "30/360" : "Actual/365";

  let tir: number | null = null;
  let md: number | null = null;
  let duration: number | null = null;
  try {
    tir = calcTIR(dirtyPrice, schedule.cashflows, { dayCount, settlement });
    const d = calcDurations(tir, schedule.cashflows, { settlement, dayCount, periodsPerYear: schedule.moneda === "USD" ? 2 : 1 });
    duration = d.duration;
    md = d.modifiedDuration;
  } catch {
    // keep nulls — still return analytics with null tir/md (spec allows tir null)
  }

  let paridad: number | null = null;
  try {
    const lastVr = schedule.cashflows.length > 0 ? (schedule.cashflows[schedule.cashflows.length - 1]?.vr ?? 100) : 100;
    const vt = lastVr + 0;
    paridad = calcParidad(dirtyPrice, vt);
  } catch {
    paridad = null;
  }

  if (tir != null) {
    const accruedPlaceholder = 0;
    if (accruedPlaceholder > 0) {
      const clean = dirtyPrice - accruedPlaceholder;
      void clean;
    }
  }

  const analytics: BondAnalytics = {
    symbol: sym,
    precio: dirtyPrice,
    precioDirty: dirtyPrice,
    tir,
    md,
    duration,
    paridad,
    interesCorrido: 0,
    schedule,
    isRealtime: true,
    source: "local",
    disclaimer: DISCLAIMER,
  };

  void lastPriceCurrency;
  return analytics;
}

export function refreshAnalyticsInBackground(symbol: string): void {
  const key = `bonds:analytics:${symbol}`;
  if (inFlightAnalytics.has(key) || bgInFlight.has(key)) return;
  const p = fetchBondAnalytics(symbol)
    .then((data) => {
      bondsAnalyticsCache.set(key, data);
    })
    .catch(() => {
      // keep stale
    })
    .finally(() => bgInFlight.delete(key));
  bgInFlight.set(key, p as Promise<void>);
}

// ---------------------------------------------------------------------------
// Helpers: curve
// ---------------------------------------------------------------------------

export async function fetchCurvePoints(segment: string, signal?: AbortSignal): Promise<CurvePoint[]> {
  const all = await getAllMaeAnalytics(signal);
  const grouped = buildCurve(all);
  const points = grouped[segment] ?? [];
  return points;
}

export function refreshCurveInBackground(segment: string): void {
  const key = `bonds:curve:${segment}`;
  if (inFlightCurve.has(key) || bgInFlight.has(key)) return;
  const p = fetchCurvePoints(segment)
    .then((points) => {
      if (points.length === 0) return;
      bondsCurveCache.set(key, { points, generatedAt: new Date().toISOString() });
    })
    .catch(() => {})
    .finally(() => bgInFlight.delete(key));
  bgInFlight.set(key, p as Promise<void>);
}

// ---------------------------------------------------------------------------
// Snapshot fallback helpers
// ---------------------------------------------------------------------------

export async function trySnapshotAnalytics(symbol: string): Promise<BondAnalytics | null> {
  try {
    const snap = await getLatestBondAnalyticsSnapshot(7);
    if (!snap) return null;
    const found = (snap.payload.analytics as BondAnalytics[]).find((a) => a.symbol.toUpperCase() === symbol.toUpperCase());
    if (!found) return null;
    return { ...found, isRealtime: false, disclaimer: DISCLAIMER } as BondAnalytics;
  } catch {
    return null;
  }
}

export async function trySnapshotCurve(segment: string): Promise<CurvePoint[] | null> {
  try {
    const snap = await getLatestBondAnalyticsSnapshot(7);
    if (!snap) return null;
    const curves = snap.payload.curves as Record<string, CurvePoint[]>;
    const points = curves[segment];
    if (!points || points.length === 0) return null;
    return points;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Panel bulk helpers — SwrCache 5min + inFlight dedup
// ---------------------------------------------------------------------------

export const PANEL_CACHE_KEY = "bonds:panel:full";

export const panelQuerySchema = z.object({
  segment: z.enum(VALID_SEGMENTS as unknown as [string, ...string[]]).optional(),
  sort: z.enum(["tir", "md", "duration", "paridad", "precio", "vencimiento", "volumeEfectivo"]).default("tir"),
  order: z.enum(["desc", "asc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function getSortValue(row: BondPanelRow, sort: string): number | string | null {
  switch (sort) {
    case "tir": return row.tir;
    case "md": return row.md;
    case "duration": return row.duration;
    case "paridad": return row.cuadroTecnico?.paridad ?? row.paridad;
    case "precio": return row.precio;
    case "vencimiento": return row.vencimiento ?? row.schedule?.vencimiento ?? null;
    case "volumeEfectivo": return row.marketData?.volumeEfectivo ?? null;
    default: return row.tir;
  }
}

export function sortRowsNullsLast(rows: BondPanelRow[], sort: string, order: "asc" | "desc"): BondPanelRow[] {
  const dir = order === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, sort);
    const bv = getSortValue(b, sort);
    const aNull = av == null || (typeof av === "number" && !Number.isFinite(av));
    const bNull = bv == null || (typeof bv === "number" && !Number.isFinite(bv));
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof av === "string" && typeof bv === "string") {
      return dir * av.localeCompare(bv);
    }
    return dir * ((av as number) - (bv as number));
  });
}

export async function fetchBondPanel(signal?: AbortSignal): Promise<{ rows: BondPanelRow[]; generatedAt: string }> {
  const generatedAt = new Date().toISOString();
  const provider = new BymaDataProvider();

  const [panelResult, maeAnalytics] = await Promise.all([
    provider.getPanel({ id: "", email: "" } as unknown as import("../../iol/types.js").IolCredentials, "bcba", "bono", 1, 5000).catch(() => ({ quotes: [] as import("../../iol/types.js").PanelQuote[], total: 0, summary: null as unknown as import("../../iol/types.js").PanelSummary })),
    getAllMaeAnalytics(signal).catch(() => [] as BondAnalytics[]),
  ]);

  const quotes = (panelResult as { quotes: import("../../iol/types.js").PanelQuote[] }).quotes ?? [];
  const maeBySymbol = new Map<string, BondAnalytics>();
  for (const a of maeAnalytics) maeBySymbol.set(a.symbol.toUpperCase(), a);

  const rows: BondPanelRow[] = quotes.map((q) => {
    const sym = q.symbol.toUpperCase();
    const mae = maeBySymbol.get(sym);

    const marketData: BondMarketData = {
      bid: q.bid ?? null,
      ask: q.ask ?? null,
      spread: q.bid != null && q.ask != null ? Number(q.ask) - Number(q.bid) : null,
      volumeNominal: (q as unknown as { volumeNominal?: number | null }).volumeNominal ?? q.volume ?? null,
      volumeEfectivo: (q as unknown as { volumeEfectivo?: number | null }).volumeEfectivo ?? null,
      low: q.low ?? null,
      high: q.high ?? null,
      open: q.open ?? null,
      close: q.close ?? null,
    };

    if (mae) {
      const lastVr = mae.schedule.cashflows.length > 0 ? (mae.schedule.cashflows[0]?.vr ?? 100) : 100;
      const cuadroRes = calcCuadroTecnico({ dirtyPrice: mae.precio, vr: lastVr, accrued: null });
      const cuadroTecnico: BondCuadroTecnico = {
        vt: cuadroRes.vt,
        vr: lastVr,
        paridad: cuadroRes.paridad,
        accrued: null,
        couponRate: null,
        frequency: null,
        dayCount: mae.schedule.moneda === "USD" ? "30/360" : "Actual/365",
        nextCouponDate: null,
        isin: null,
        ley: null,
        emisor: null,
        denominacionMinima: null,
        outstanding: null,
        isParidadCalculable: cuadroRes.isParidadCalculable,
        paridadCalculable: cuadroRes.isParidadCalculable,
        scheduleSource: "mae",
      };
      return {
        ...mae,
        marketData,
        cuadroTecnico,
        vencimiento: mae.schedule.vencimiento,
        ley: null,
        isin: null,
        moneda: mae.schedule.moneda,
        tipo: mae.schedule.tipo,
      } as BondPanelRow;
    }

    const dirtyPrice = q.lastPrice ?? 0;
    const vr = 100;
    const cuadroRes = calcCuadroTecnico({ dirtyPrice, vr, accrued: null });
    const vencimiento = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const schedule = {
      symbol: sym,
      moneda: (q.currency === "USD" ? "USD" : "ARS") as "ARS" | "USD",
      tipo: "bullet" as const,
      vencimiento,
      cashflows: [{ fechaPago: vencimiento, renta: 0, amortizacion: 100, cashFlow: 100, vr: 0 }],
      cerAjustado: false,
    };
    const cuadroTecnico: BondCuadroTecnico = {
      vt: cuadroRes.vt,
      vr,
      paridad: cuadroRes.paridad,
      accrued: null,
      couponRate: null,
      frequency: null,
      dayCount: schedule.moneda === "USD" ? "30/360" : "Actual/365",
      nextCouponDate: null,
      isin: null,
      ley: null,
      emisor: null,
      denominacionMinima: null,
      outstanding: null,
      isParidadCalculable: false,
      paridadCalculable: false,
      scheduleSource: "synthetic",
    };
    return {
      symbol: sym,
      precio: dirtyPrice,
      precioDirty: dirtyPrice,
      tir: null,
      md: null,
      duration: null,
      paridad: cuadroRes.paridad,
      interesCorrido: 0,
      schedule,
      isRealtime: true,
      source: "local" as const,
      disclaimer: DISCLAIMER,
      marketData,
      cuadroTecnico,
      vencimiento,
      ley: null,
      isin: null,
      moneda: schedule.moneda,
      tipo: schedule.tipo,
    } as BondPanelRow;
  });

  return { rows, generatedAt };
}

export function refreshPanelInBackground(): void {
  if (bgPanelInFlight.has(PANEL_CACHE_KEY)) return;
  const p = fetchBondPanel()
    .then((data) => bondsPanelCache.set(PANEL_CACHE_KEY, data))
    .catch(() => {})
    .finally(() => bgPanelInFlight.delete(PANEL_CACHE_KEY));
  bgPanelInFlight.set(PANEL_CACHE_KEY, p as Promise<void>);
}

export async function trySnapshotPanel(): Promise<{ rows: BondPanelRow[]; generatedAt: string } | null> {
  try {
    const snap = await getLatestBondAnalyticsSnapshot(7);
    if (!snap) return null;
    const panelSnap = (snap.payload as unknown as { panelSnapshot?: BondPanelResponse | { rows: BondPanelRow[]; generatedAt: string } }).panelSnapshot;
    if (panelSnap && Array.isArray((panelSnap as unknown as { data?: unknown }).data)) {
      const data = (panelSnap as BondPanelResponse).data ?? (panelSnap as unknown as { rows: BondPanelRow[] }).rows ?? [];
      return { rows: data as BondPanelRow[], generatedAt: (panelSnap as BondPanelResponse).generatedAt ?? snap.capturedAt };
    }
    if (panelSnap && Array.isArray((panelSnap as unknown as { rows: BondPanelRow[] }).rows)) {
      const r = panelSnap as unknown as { rows: BondPanelRow[]; generatedAt: string };
      return { rows: r.rows, generatedAt: r.generatedAt ?? snap.capturedAt };
    }
    const analytics = snap.payload.analytics as BondAnalytics[];
    if (analytics && analytics.length > 0) {
      const rows: BondPanelRow[] = analytics.map((a) => {
        const lastVr = a.schedule.cashflows.length > 0 ? (a.schedule.cashflows[0]?.vr ?? 100) : 100;
        const cuadroRes = calcCuadroTecnico({ dirtyPrice: a.precio, vr: lastVr, accrued: null });
        return {
          ...a,
          marketData: (a as unknown as { marketData?: BondMarketData }).marketData ?? { bid: null, ask: null, spread: null, volumeNominal: null, volumeEfectivo: null, low: null, high: null, open: null, close: null },
          cuadroTecnico: (a as unknown as { cuadroTecnico?: BondCuadroTecnico }).cuadroTecnico ?? { vt: cuadroRes.vt, vr: lastVr, paridad: cuadroRes.paridad, accrued: null, couponRate: null, frequency: null, dayCount: "30/360", nextCouponDate: null, isin: null, ley: null, emisor: null, denominacionMinima: null, outstanding: null, isParidadCalculable: false, paridadCalculable: false, scheduleSource: "mae" as const },
          vencimiento: a.schedule.vencimiento,
          ley: null,
          isin: null,
          moneda: (a.schedule as unknown as { moneda: string }).moneda === "USD" ? "USD" : "ARS",
          tipo: (a.schedule as unknown as { tipo: string }).tipo as BondPanelRow["tipo"],
        } as BondPanelRow;
      });
      return { rows, generatedAt: snap.capturedAt };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchCashflow(accountId: string, signal?: AbortSignal): Promise<CashflowMonth[]> {
  void signal;
  const posRes = await pool.query(
    `SELECT symbol, quantity, market FROM positions WHERE account_id = $1 AND market = 'bonds'`,
    [accountId]
  );
  const rows = posRes.rows as Array<{ symbol: string; quantity: string; market: string }>;
  if (rows.length === 0) {
    return [];
  }

  const provider = new BymaDataProvider();
  const positionsForCalc = await Promise.all(
    rows.map(async (r) => {
      const qty = Number(r.quantity);
      if (!Number.isFinite(qty) || qty === 0) return null;
      try {
        const maeAnalytic = await getMaeAnalyticsForSymbol(r.symbol).catch(() => null);
        if (maeAnalytic?.schedule) {
          return { symbol: r.symbol, quantity: qty, schedule: maeAnalytic.schedule };
        }
        const sched = await provider.getBondSchedule(r.symbol);
        return { symbol: r.symbol, quantity: qty, schedule: sched };
      } catch {
        return null;
      }
    })
  );

  const valid = positionsForCalc.filter(Boolean) as Array<{ symbol: string; quantity: number; schedule: import("./types.js").BondSchedule }>;
  if (valid.length === 0) return [];

  const months = projectCashflow(valid, { monthsAhead: 12, cerCoefficient: 1.42 });
  return months;
}

// Test helpers — preserves original reset behavior including inFlight maps
export function resetBondsCacheForTests(): void {
  bondsAnalyticsCache.resetForTests();
  bondsCurveCache.resetForTests();
  bondsCashflowCache.resetForTests();
  bondsPanelCache.resetForTests();
  inFlightAnalytics.clear();
  inFlightCurve.clear();
  inFlightPanel.clear();
  bgInFlight.clear();
  bgPanelInFlight.clear();
}

// Re-export helpers used by ficha route (calcAccrued etc kept in route but also available)
export { calcCuadroTecnico, calcAccruedFromFicha, parseInteresToCouponRate };
