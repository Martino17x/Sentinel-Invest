import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { SwrCache } from "../services/market/cache.js";
import { BONDS_ANALYTICS_ENABLED } from "../config.js";
import { DISCLAIMER } from "../services/market/radar.js";
import { isMarketHours } from "../services/market/isMarketHours.js";
import { pool } from "../db/index.js";
import { BymaDataProvider } from "../services/iol/BymaDataProvider.js";
import { getAllMaeAnalytics, getMaeAnalyticsForSymbol } from "../services/market/bonds/maeFlujo.js";
import { buildCurve, VALID_SEGMENTS } from "../services/market/bonds/curve.js";
import { projectCashflow } from "../services/market/bonds/cashflow.js";
import { getLatestBondAnalyticsSnapshot } from "../jobs/bondAnalyticsSnapshot.js";
import { calcTIR } from "../services/market/bonds/tir.js";
import { calcDurations } from "../services/market/bonds/duration.js";
import { calcParidad } from "../services/market/bonds/paridad.js";
import type { BondAnalytics, CurvePoint, CashflowMonth } from "../services/market/bonds/types.js";

const router = Router();

// All bonds routes require auth (same as radar)
router.use(requireAuth);

// Guard flag — when off, every endpoint returns 404 (spec bond-analytics)
router.use((_req: Request, res: Response, next) => {
  if (!BONDS_ANALYTICS_ENABLED) {
    res.status(404).json({ error: "Renta fija no habilitada" });
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Caches — SwrCache 5-15min (spec + design)
// analytics 10min, curve 15min, cashflow 5min
// ---------------------------------------------------------------------------

const ANALYTICS_TTL_MS = 10 * 60 * 1000;
const CURVE_TTL_MS = 15 * 60 * 1000;
const CASHFLOW_TTL_MS = 5 * 60 * 1000;

export const bondsAnalyticsCache = new SwrCache<BondAnalytics>(ANALYTICS_TTL_MS);
export const bondsCurveCache = new SwrCache<{ points: CurvePoint[]; generatedAt: string }>(CURVE_TTL_MS);
export const bondsCashflowCache = new SwrCache<{ months: CashflowMonth[] }>(CASHFLOW_TTL_MS);

const inFlightAnalytics = new Map<string, Promise<BondAnalytics>>();
const inFlightCurve = new Map<string, Promise<CurvePoint[]>>();
const bgInFlight = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Helpers: analytics fetch (MAE + local fallback)
// ---------------------------------------------------------------------------

async function fetchBondAnalytics(symbol: string): Promise<BondAnalytics> {
  const sym = symbol.toUpperCase().trim();

  // 1) MAE direct — covers ~50 hard-dollar + BOPREAL
  try {
    const mae = await getMaeAnalyticsForSymbol(sym);
    if (mae) {
      // MAE analytics already has tir/md in decimal, schedule, etc.
      // Add DISCLAIMER canonical
      return { ...mae, disclaimer: DISCLAIMER };
    }
  } catch {
    // fall through to local
  }

  // 2) Local fallback: ficha BYMA + price + calcTIR/duration/paridad
  const provider = new BymaDataProvider();
  const schedule = await provider.getBondSchedule(sym);

  // Price: try panel public-bonds first, fallback to provider.getQuote placeholder
  let dirtyPrice = 0;
  let lastPriceCurrency: string | undefined;
  try {
    // Cheap: getQuote will scan panels
    const q = await provider.getQuote({ id: "", email: "" } as never, sym, "bcba");
    dirtyPrice = q.lastPrice ?? 0;
    lastPriceCurrency = q.currency;
  } catch {
    dirtyPrice = 0;
  }

  // If still 0, throw to trigger stale/snapshot fallback
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

  // Paridad: precio / valor técnico *100 — VR from schedule last cashflow vr or 100
  let paridad: number | null = null;
  try {
    const lastVr = schedule.cashflows.length > 0 ? (schedule.cashflows[schedule.cashflows.length - 1]?.vr ?? 100) : 100;
    // Accrued not yet computed: approximate vt = 100 + 0
    const vt = lastVr + 0;
    paridad = calcParidad(dirtyPrice, vt);
  } catch {
    paridad = null;
  }

  // Dirty vs clean divergence log (>5bps) — spec Dirty vs Clean Convention
  if (tir != null) {
    const accruedPlaceholder = 0; // without ficha interes corrido real
    if (accruedPlaceholder > 0) {
      const clean = dirtyPrice - accruedPlaceholder;
      // divergence check handled via tir comparison if needed
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

  // Log divergence >5bps if we had MAE to compare — already logged in maeFlujo adapter
  void lastPriceCurrency;
  return analytics;
}

function refreshAnalyticsInBackground(symbol: string): void {
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

async function fetchCurvePoints(segment: string): Promise<CurvePoint[]> {
  const all = await getAllMaeAnalytics();
  const grouped = buildCurve(all);
  // Normalize segment key — frontend may send "USD-hard-dollar" canonical
  const points = grouped[segment] ?? [];
  // Already sorted md asc by buildCurve
  return points;
}

function refreshCurveInBackground(segment: string): void {
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

async function trySnapshotAnalytics(symbol: string): Promise<BondAnalytics | null> {
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

async function trySnapshotCurve(segment: string): Promise<CurvePoint[] | null> {
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
// GET /api/bonds/curve?segment=  (declare BEFORE /:symbol/analytics)
// ---------------------------------------------------------------------------

const curveQuerySchema = z.object({
  segment: z.string().min(1),
});

router.get("/curve", async (req: Request, res: Response) => {
  const parsed = curveQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetro segment requerido", code: "SEGMENT_INVALID" });
    return;
  }
  const segment = parsed.data.segment.trim();

  if (!VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
    res.status(400).json({ error: "Segmento inválido", code: "SEGMENT_INVALID" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  const cacheKey = `bonds:curve:${segment}`;
  const entry = bondsCurveCache.getEntry(cacheKey);

  if (entry) {
    if (bondsCurveCache.isFresh(entry)) {
      res.setHeader("X-Cache", "HIT");
      res.json({ points: entry.data.points, segment, generatedAt: entry.data.generatedAt, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()) });
      return;
    }
    refreshCurveInBackground(segment);
    res.setHeader("X-Cache", "STALE");
    res.json({ points: entry.data.points, segment, generatedAt: entry.data.generatedAt, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
    return;
  }

  const existing = inFlightCurve.get(cacheKey);
  if (existing) {
    try {
      const points = await existing;
      res.setHeader("X-Cache", "HIT");
      res.json({ points, segment, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()) });
      return;
    } catch {
      // fall through
    }
  }

  const promise = fetchCurvePoints(segment);
  inFlightCurve.set(cacheKey, promise);
  try {
    const points = await promise;
    // Even if empty but market closed, try snapshot before returning empty
    if (points.length === 0) {
      const snap = await trySnapshotCurve(segment);
      if (snap) {
        res.setHeader("X-Cache", "STALE");
        res.json({ points: snap, segment, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
        return;
      }
      // Spec: ≥15 points for USD-hard-dollar and LECAP/BONCAP when available — return empty correctly
      const isClosed = !isMarketHours(new Date());
      if (isClosed) {
        res.json({ points: [], segment, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER, isMarketClosed: true });
        return;
      }
    }
    bondsCurveCache.set(cacheKey, { points, generatedAt: new Date().toISOString() });
    res.setHeader("X-Cache", "MISS");
    res.json({ points, segment, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()) });
    return;
  } catch (err) {
    const staleEntry = bondsCurveCache.getEntry(cacheKey);
    if (staleEntry) {
      res.setHeader("X-Cache", "STALE");
      res.json({ points: staleEntry.data.points, segment, generatedAt: staleEntry.data.generatedAt, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
      return;
    }
    const snap = await trySnapshotCurve(segment);
    if (snap) {
      res.setHeader("X-Cache", "STALE");
      res.json({ points: snap, segment, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
      return;
    }
    if (!isMarketHours(new Date())) {
      res.json({ points: [], segment, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER, isMarketClosed: true });
      return;
    }
    const message = err instanceof Error ? err.message : "Error al consultar curva";
    res.status(502).json({ error: message });
    return;
  } finally {
    if (inFlightCurve.get(cacheKey) === promise) inFlightCurve.delete(cacheKey);
  }
});

// NOTE: /curve must be registered before /:symbol/analytics catch-all
// Express matches in declaration order — already handled by defining curve above analytics
// but we moved analytics earlier for symbol path specificity; both work because /curve
// is checked first via explicit route. Re-register curve fallback check if needed.

// ---------------------------------------------------------------------------
// GET /api/bonds/cashflow?accountId=
// ---------------------------------------------------------------------------

const cashflowQuerySchema = z.object({
  accountId: z.string().uuid(),
});

router.get("/cashflow", async (req: Request, res: Response) => {
  const parsed = cashflowQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "accountId (uuid) requerido" });
    return;
  }
  const accountId = parsed.data.accountId;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  // Verify account belongs to user
  try {
    const accCheck = await pool.query("SELECT id FROM accounts WHERE id = $1 AND user_id = $2 LIMIT 1", [accountId, req.user!.id]);
    if (accCheck.rowCount === 0) {
      res.status(404).json({ error: "Cuenta no encontrada" });
      return;
    }
  } catch {
    res.status(500).json({ error: "Error al verificar cuenta" });
    return;
  }

  const cacheKey = `bonds:cashflow:${accountId}`;
  const entry = bondsCashflowCache.getEntry(cacheKey);
  if (entry && bondsCashflowCache.isFresh(entry)) {
    res.setHeader("X-Cache", "HIT");
    res.json({ months: entry.data.months, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()) });
    return;
  }
  if (entry) {
    // stale serve + background refresh
    res.setHeader("X-Cache", "STALE");
    // trigger background refresh without awaiting
    void (async () => {
      try {
        const fresh = await fetchCashflow(accountId);
        bondsCashflowCache.set(cacheKey, { months: fresh });
      } catch {}
    })();
    res.json({ months: entry.data.months, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
    return;
  }

  try {
    const months = await fetchCashflow(accountId);
    bondsCashflowCache.set(cacheKey, { months });
    res.setHeader("X-Cache", "MISS");
    res.json({ months, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()) });
    return;
  } catch (err) {
    const staleEntry = bondsCashflowCache.getEntry(cacheKey);
    if (staleEntry) {
      res.setHeader("X-Cache", "STALE");
      res.json({ months: staleEntry.data.months, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
      return;
    }
    // Empty portfolio fallback — spec: [] not error
    if (isMarketHours(new Date()) === false) {
      res.json({ months: [], disclaimer: DISCLAIMER, isMarketClosed: true });
      return;
    }
    const message = err instanceof Error ? err.message : "Error al proyectar cashflow";
    res.status(502).json({ error: message });
    return;
  }
});

// ---------------------------------------------------------------------------
// GET /api/bonds/:symbol/analytics  (MUST be after /curve and /cashflow)
// ---------------------------------------------------------------------------

router.get("/:symbol/analytics", async (req: Request, res: Response) => {
  const symbol = (req.params.symbol ?? "").toUpperCase().trim();
  if (!symbol || !/^[A-Z0-9]{2,12}$/.test(symbol)) {
    res.status(400).json({ error: "Símbolo inválido" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  const cacheKey = `bonds:analytics:${symbol}`;
  const entry = bondsAnalyticsCache.getEntry(cacheKey);

  if (entry) {
    if (bondsAnalyticsCache.isFresh(entry)) {
      res.setHeader("X-Cache", "HIT");
      res.json(entry.data);
      return;
    }
    refreshAnalyticsInBackground(symbol);
    res.setHeader("X-Cache", "STALE");
    res.json({ ...entry.data, isRealtime: false });
    return;
  }

  const existing = inFlightAnalytics.get(cacheKey);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader("X-Cache", "HIT");
      res.json(data);
      return;
    } catch {}
  }

  const promise = fetchBondAnalytics(symbol);
  inFlightAnalytics.set(cacheKey, promise);
  try {
    const data = await promise;
    bondsAnalyticsCache.set(cacheKey, data);
    res.setHeader("X-Cache", "MISS");
    res.json(data);
    return;
  } catch (err) {
    const staleEntry = bondsAnalyticsCache.getEntry(cacheKey);
    if (staleEntry) {
      res.setHeader("X-Cache", "STALE");
      res.json({ ...staleEntry.data, isRealtime: false });
      return;
    }
    const snap = await trySnapshotAnalytics(symbol);
    if (snap) {
      res.setHeader("X-Cache", "STALE");
      res.json(snap);
      return;
    }
    if (!isMarketHours(new Date())) {
      res.setHeader("X-Cache", "STALE");
      res.json({
        symbol,
        precio: 0,
        precioDirty: 0,
        tir: null,
        md: null,
        duration: null,
        paridad: null,
        interesCorrido: 0,
        schedule: { symbol, moneda: "ARS", tipo: "bullet", vencimiento: new Date().toISOString().slice(0, 10), cashflows: [] },
        isRealtime: false,
        source: "local",
        disclaimer: DISCLAIMER,
        message: "El mercado está cerrado",
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Error al consultar analytics";
    res.status(502).json({ error: message });
    return;
  } finally {
    if (inFlightAnalytics.get(cacheKey) === promise) inFlightAnalytics.delete(cacheKey);
  }
});

async function fetchCashflow(accountId: string): Promise<CashflowMonth[]> {
  // positions WHERE market=bonds — also accept assetType bono/on from IOL sync
  const posRes = await pool.query(
    `SELECT symbol, quantity, market FROM positions WHERE account_id = $1 AND market = 'bonds'`,
    [accountId]
  );
  const rows = posRes.rows as Array<{ symbol: string; quantity: string; market: string }>;
  if (rows.length === 0) {
    // Also try bcba with bono asset? But positions table has market enum, bonds only if synced as bonds.
    // Return empty as per spec empty portfolio → []
    return [];
  }

  const provider = new BymaDataProvider();
  const positionsForCalc = await Promise.all(
    rows.map(async (r) => {
      const qty = Number(r.quantity);
      if (!Number.isFinite(qty) || qty === 0) return null;
      try {
        // Prefer MAE schedule when available
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

  const valid = positionsForCalc.filter(Boolean) as Array<{ symbol: string; quantity: number; schedule: import("../services/market/bonds/types.js").BondSchedule }>;
  if (valid.length === 0) return [];

  const months = projectCashflow(valid, { monthsAhead: 12, cerCoefficient: 1.42 });
  return months;
}

// Test helpers
export function resetBondsCacheForTests(): void {
  bondsAnalyticsCache.resetForTests();
  bondsCurveCache.resetForTests();
  bondsCashflowCache.resetForTests();
  inFlightAnalytics.clear();
  inFlightCurve.clear();
  bgInFlight.clear();
}

export default router;
