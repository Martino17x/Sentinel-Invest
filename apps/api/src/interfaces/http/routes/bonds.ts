import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { BONDS_ANALYTICS_ENABLED, BONDS_PANEL_ENABLED, BONDS_COMPARE_ENABLED, BONDS_ONS_ENABLED } from "../../../config.js";
import { isMarketHours } from "../../../services/market/isMarketHours.js";
import { pool } from "../../../db/index.js";
import { BymaClient } from "../../../infraestructura/providers/byma/BymaClient.js";
import { BymaFichaClient } from "../../../infraestructura/providers/byma/BymaFichaClient.js";
import { QuoteService } from "../../../aplicacion/cotizaciones/QuoteService.js";
import { parseInteresToCouponRate } from "../../../dominio/bonos/ficha.js";
import { getMaeAnalyticsForSymbol } from "../../../services/market/bonds/maeFlujo.js";
import { VALID_SEGMENTS, inferSegment } from "../../../services/market/bonds/curve.js";
import { getCER } from "../../../services/market/bonds/cer.js";
import { calcTIR } from "../../../services/market/bonds/tir.js";
import { calcDurations } from "../../../services/market/bonds/duration.js";
import { calcCuadroTecnico, calcAccruedFromFicha } from "../../../services/market/bonds/paridad.js";
import type { BondAnalytics, BondPanelRow, BondPanelResponse, BondCuadroTecnico, BondMarketData } from "../../../services/market/bonds/types.js";
import {
  DISCLAIMER,
  bondsAnalyticsCache,
  bondsCurveCache,
  bondsCashflowCache,
  bondsPanelCache,
  bondsCompareCache,
  fetchBondAnalytics,
  fetchCurvePoints,
  fetchBondPanel,
  fetchCashflow,
  trySnapshotAnalytics,
  trySnapshotCurve,
  trySnapshotPanel,
  refreshAnalyticsInBackground,
  refreshCurveInBackground,
  refreshPanelInBackground,
  PANEL_CACHE_KEY,
  panelQuerySchema,
  getSortValue,
  sortRowsNullsLast,
  resetBondsCacheForTests as resetBondsQueriesForTests,
} from "../../../services/market/bonds/bondsQueries.js";
import { fitNelsonSiegelSvensson } from "../../../services/market/bonds/nelsonSiegel.js";

// Re-export for tests that imported from routes (preserve API)
export { getSortValue, sortRowsNullsLast, panelQuerySchema };
export { bondsAnalyticsCache, bondsCurveCache, bondsCashflowCache, bondsPanelCache, bondsCompareCache, DISCLAIMER, PANEL_CACHE_KEY };

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
// InFlight dedup maps kept here for route-level handlers (panel/curve/analytics)
// The canonical maps live in bondsQueries.ts; these route-level maps are
// shadows for request coalescing. We delegate to bondsQueries caches but keep
// local inFlight for backwards compat with tests that check router behavior.
// Actually route handlers now use bondsQueries caches directly; inFlight dedup
// is handled inside bondsQueries helpers where applicable. For GET handlers we
// keep a thin local inFlight for analytics/curve/panel to avoid double fetch
// when bondsQueries fetch is called concurrently from route.
// ---------------------------------------------------------------------------

const inFlightAnalytics = new Map<string, Promise<BondAnalytics>>();
const inFlightCurve = new Map<string, Promise<import("../../../services/market/bonds/types.js").CurvePoint[]>>();
const inFlightPanel = new Map<string, Promise<{ rows: BondPanelRow[]; generatedAt: string }>>();

export function resetBondsCacheForTests(): void {
  resetBondsQueriesForTests();
  inFlightAnalytics.clear();
  inFlightCurve.clear();
  inFlightPanel.clear();
}

// ---------------------------------------------------------------------------
// GET /api/bonds/compare?symbols=AL30,GD30  (2-4, >4 ->400) — before :symbol
// ---------------------------------------------------------------------------

const compareQuerySchema = z.object({
  symbols: z.string().min(1),
});

router.get("/compare", async (req: Request, res: Response) => {
  if (!BONDS_COMPARE_ENABLED) {
    res.status(404).json({ error: "Comparador no habilitado", code: "BONDS_COMPARE_DISABLED" });
    return;
  }
  const parsed = compareQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetro symbols requerido (2-4 separados por coma)", code: "COMPARE_SYMBOLS_INVALID" });
    return;
  }
  const raw = parsed.data.symbols;
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const unique = [...new Set(symbols)];
  if (unique.length < 2 || unique.length > 4) {
    res.status(400).json({ error: "Comparador requiere entre 2 y 4 símbolos", code: "too_many_symbols" });
    return;
  }
  for (const s of unique) {
    if (!/^[A-Z0-9]{2,12}$/.test(s)) {
      res.status(400).json({ error: `Símbolo inválido: ${s}`, code: "SYMBOL_INVALID" });
      return;
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  const sortedKey = [...unique].sort().join(",");
  const cacheKey = `bonds:compare:${sortedKey}`;
  const entry = bondsCompareCache.getEntry(cacheKey);
  if (entry && bondsCompareCache.isFresh(entry)) {
    res.setHeader("X-Cache", "HIT");
    res.json({ ...entry.data, symbols: unique, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()) });
    return;
  }
  if (entry) {
    // stale serve + background refresh
    res.setHeader("X-Cache", "STALE");
    res.json({ ...entry.data, symbols: unique, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
    void Promise.all(unique.map((s) => fetchBondAnalytics(s).catch(() => null))).then((fresh) => {
      const valid = fresh.filter(Boolean) as BondAnalytics[];
      if (valid.length === unique.length) {
        const diff = buildCompareDiff(valid);
        bondsCompareCache.set(cacheKey, { analytics: valid, diff, generatedAt: new Date().toISOString() });
      }
    });
    return;
  }

  try {
    const results = await Promise.all(unique.map((s) => fetchBondAnalytics(s)));
    const diff = buildCompareDiff(results);
    const payload = { analytics: results, diff, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER, symbols: unique, isMarketClosed: !isMarketHours(new Date()) };
    bondsCompareCache.set(cacheKey, { analytics: results, diff, generatedAt: payload.generatedAt });
    res.setHeader("X-Cache", "MISS");
    res.json(payload);
    return;
  } catch (err) {
    // if any symbol fails, try stale fallback — re-query to avoid TS narrowing (entry narrowed to never after early returns)
    const staleFallback = bondsCompareCache.getEntry(cacheKey);
    if (staleFallback) {
      res.setHeader("X-Cache", "STALE");
      res.json({ ...staleFallback.data, symbols: unique, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
      return;
    }
    const message = err instanceof Error ? err.message : "Error al comparar bonos";
    // if is 404 for symbol not found, return 404
    if (message.includes("not available") || message.includes("no encontrado")) {
      res.status(404).json({ error: message, code: "BOND_NOT_FOUND" });
      return;
    }
    res.status(502).json({ error: message });
    return;
  }
});

function buildCompareDiff(analytics: BondAnalytics[]): Record<string, unknown> {
  const tirs = analytics.map((a) => a.tir).filter((v): v is number => v != null && Number.isFinite(v));
  const mds = analytics.map((a) => a.md).filter((v): v is number => v != null && Number.isFinite(v));
  const durs = analytics.map((a) => a.duration).filter((v): v is number => v != null && Number.isFinite(v));
  const pars = analytics.map((a) => a.paridad).filter((v): v is number => v != null && Number.isFinite(v));
  const prices = analytics.map((a) => a.precio).filter((v): v is number => Number.isFinite(v));
  function stats(arr: number[]) {
    if (arr.length === 0) return { min: null, max: null, diff: null, diffBps: null };
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const diff = max - min;
    return { min, max, diff, diffBps: Math.round(diff * 10000) };
  }
  return {
    tir: stats(tirs),
    md: stats(mds),
    duration: stats(durs),
    paridad: stats(pars),
    precio: stats(prices),
  };
}

// ---------------------------------------------------------------------------
// GET /api/bonds/screener?minTir=&maxMd=&segment=&ley=&moneda=  (in-memory <100ms)
// ---------------------------------------------------------------------------

const screenerQuerySchema = z.object({
  minTir: z.coerce.number().optional(),
  maxTir: z.coerce.number().optional(),
  minMd: z.coerce.number().optional(),
  maxMd: z.coerce.number().optional(),
  minDuration: z.coerce.number().optional(),
  maxDuration: z.coerce.number().optional(),
  minParidad: z.coerce.number().optional(),
  maxParidad: z.coerce.number().optional(),
  segment: z.string().optional(),
  ley: z.string().optional(),
  moneda: z.enum(["ARS", "USD"]).optional(),
  q: z.string().optional(),
});

router.get("/screener", async (req: Request, res: Response) => {
  const parsed = screenerQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetros de screener inválidos", code: "SCREENER_QUERY_INVALID" });
    return;
  }
  const { minTir, maxTir, minMd, maxMd, minDuration, maxDuration, minParidad, maxParidad, segment, ley, moneda, q } = parsed.data;

  if (segment && !VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
    res.status(400).json({ error: "Segmento inválido", code: "SEGMENT_INVALID" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  const start = Date.now();
  let rows: BondPanelRow[] = [];
  let generatedAt = new Date().toISOString();
  const panelEntry = bondsPanelCache.getEntry(PANEL_CACHE_KEY);
  if (panelEntry) {
    rows = panelEntry.data.rows;
    generatedAt = panelEntry.data.generatedAt;
    if (!bondsPanelCache.isFresh(panelEntry)) refreshPanelInBackground();
  } else {
    try {
      const data = await fetchBondPanel();
      bondsPanelCache.set(PANEL_CACHE_KEY, data);
      rows = data.rows;
      generatedAt = data.generatedAt;
    } catch (err) {
      const snap = await trySnapshotPanel();
      if (snap) {
        rows = snap.rows;
        generatedAt = snap.generatedAt;
      } else {
        const message = err instanceof Error ? err.message : "Error screener";
        res.status(502).json({ error: message });
        return;
      }
    }
  }

  let filtered = rows;
  if (minTir != null) filtered = filtered.filter((r) => r.tir != null && r.tir >= minTir);
  if (maxTir != null) filtered = filtered.filter((r) => r.tir != null && r.tir <= maxTir);
  if (minMd != null) filtered = filtered.filter((r) => r.md != null && r.md >= minMd);
  if (maxMd != null) filtered = filtered.filter((r) => r.md != null && r.md <= maxMd);
  if (minDuration != null) filtered = filtered.filter((r) => r.duration != null && r.duration >= minDuration);
  if (maxDuration != null) filtered = filtered.filter((r) => r.duration != null && r.duration <= maxDuration);
  if (minParidad != null) filtered = filtered.filter((r) => {
    const p = r.cuadroTecnico?.paridad ?? r.paridad;
    return p != null && p >= minParidad;
  });
  if (maxParidad != null) filtered = filtered.filter((r) => {
    const p = r.cuadroTecnico?.paridad ?? r.paridad;
    return p != null && p <= maxParidad;
  });
  if (segment) filtered = filtered.filter((r) => inferSegment(r as unknown as BondAnalytics) === segment);
  if (ley) filtered = filtered.filter((r) => {
    const l = (r.ley ?? r.cuadroTecnico?.ley ?? "").toUpperCase();
    return l.includes(ley.toUpperCase());
  });
  if (moneda) filtered = filtered.filter((r) => (r.moneda ?? r.schedule?.moneda) === moneda);
  if (q) {
    const qq = q.trim().toUpperCase();
    filtered = filtered.filter((r) => r.symbol.toUpperCase().includes(qq));
  }

  const elapsed = Date.now() - start;
  res.setHeader("X-Screener-Elapsed", String(elapsed));
  res.json({
    data: filtered,
    rows: filtered,
    total: filtered.length,
    count: filtered.length,
    generatedAt,
    disclaimer: DISCLAIMER,
    isMarketClosed: !isMarketHours(new Date()),
    elapsedMs: elapsed,
  });
});

// ---------------------------------------------------------------------------
// GET /api/bonds/:symbol/sensitivity?bps=25,50,100  → ΔP = -MD * Δy * P
// ---------------------------------------------------------------------------

router.get("/:symbol/sensitivity", async (req: Request, res: Response) => {
  const symbol = String(req.params.symbol ?? "").toUpperCase().trim();
  if (!symbol || !/^[A-Z0-9]{2,12}$/.test(symbol)) {
    res.status(400).json({ error: "Símbolo inválido", code: "SYMBOL_INVALID" });
    return;
  }
  const rawBps = String(req.query.bps ?? "25,50,100");
  const bpsList = rawBps
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 1000);
  if (bpsList.length === 0) {
    res.status(400).json({ error: "Parámetro bps inválido (ej 25,50,100)", code: "BPS_INVALID" });
    return;
  }
  if (bpsList.length > 10) {
    res.status(400).json({ error: "Máximo 10 valores bps", code: "BPS_TOO_MANY" });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  let analytics: BondAnalytics;
  try {
    analytics = await fetchBondAnalytics(symbol);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error sensitivity";
    res.status(502).json({ error: msg });
    return;
  }
  const md = analytics.md;
  const price = analytics.precio;
  if (md == null || !Number.isFinite(md) || price == null || !Number.isFinite(price) || price <= 0) {
    res.status(400).json({ error: "MD no disponible para sensibilidad", code: "SENSITIVITY_NO_MD" });
    return;
  }
  const dv01 = md * 0.0001 * price; // per 1bp
  const scenarios = bpsList.flatMap((bps) => {
    const dy = bps / 10000;
    const deltaUp = -md * dy * price;
    const deltaDown = -md * (-dy) * price;
    return [
      { bps, direction: "up" as const, deltaYield: dy, deltaPrice: deltaUp, newPrice: price + deltaUp, pctChange: (deltaUp / price) * 100, dv01: dv01 * bps, dv01PerBp: dv01 },
      { bps, direction: "down" as const, deltaYield: -dy, deltaPrice: deltaDown, newPrice: price + deltaDown, pctChange: (deltaDown / price) * 100, dv01: -dv01 * bps, dv01PerBp: -dv01 },
    ];
  });
  // also flat array with positive bps only for heatmap convenience
  const scenariosSimple = bpsList.map((bps) => {
    const dy = bps / 10000;
    const delta = -md * dy * price;
    return { bps, deltaYield: dy, deltaPrice: delta, newPrice: price + delta, pctChange: (delta / price) * 100, dv01: dv01 * bps, dv01PerBp: dv01 };
  });

  res.json({
    symbol,
    precio: price,
    md,
    duration: analytics.duration,
    tir: analytics.tir,
    dv01,
    dv01PerBp: dv01,
    bps: bpsList,
    scenarios,
    scenariosSimple,
    disclaimer: DISCLAIMER,
    generatedAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /api/bonds/curve?segment=  (declare BEFORE /:symbol/analytics)
// ---------------------------------------------------------------------------

const curveQuerySchema = z.object({
  segment: z.string().min(1),
  fit: z.string().optional(),
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

  const fitRequested = parsed.data.fit === "true" || parsed.data.fit === "1";
  const cacheKey = `bonds:curve:${segment}`;
  const entry = bondsCurveCache.getEntry(cacheKey);

  function withFit(points: import("../../../services/market/bonds/types.js").CurvePoint[], generatedAt: string, extra: Record<string, unknown> = {}) {
    if (!fitRequested) return { points, segment, generatedAt, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), ...extra };
    const fit = fitNelsonSiegelSvensson(points);
    return { points, segment, generatedAt, disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), fit: fit.fitted, fitted: fit.fitted, fittedPoints: fit.fittedPoints, fitParams: fit.params, fitRmse: fit.rmse, fitReason: fit.reason, ...extra };
  }

  if (entry) {
    if (bondsCurveCache.isFresh(entry)) {
      res.setHeader("X-Cache", "HIT");
      res.json(withFit(entry.data.points, entry.data.generatedAt));
      return;
    }
    refreshCurveInBackground(segment);
    res.setHeader("X-Cache", "STALE");
    res.json(withFit(entry.data.points, entry.data.generatedAt, { stale: true }));
    return;
  }

  const existing = inFlightCurve.get(cacheKey);
  if (existing) {
    try {
      const points = await existing;
      res.setHeader("X-Cache", "HIT");
      res.json(withFit(points, new Date().toISOString()));
      return;
    } catch {
      // fall through
    }
  }

  const promise = fetchCurvePoints(segment);
  inFlightCurve.set(cacheKey, promise);
  try {
    const points = await promise;
    if (points.length === 0) {
      const snap = await trySnapshotCurve(segment);
      if (snap) {
        res.setHeader("X-Cache", "STALE");
        res.json(withFit(snap, new Date().toISOString(), { stale: true }));
        return;
      }
      const isClosed = !isMarketHours(new Date());
      if (isClosed) {
        res.json(withFit([], new Date().toISOString(), { isMarketClosed: true }));
        return;
      }
    }
    bondsCurveCache.set(cacheKey, { points, generatedAt: new Date().toISOString() });
    res.setHeader("X-Cache", "MISS");
    res.json(withFit(points, new Date().toISOString()));
    return;
  } catch (err) {
    const staleEntry = bondsCurveCache.getEntry(cacheKey);
    if (staleEntry) {
      res.setHeader("X-Cache", "STALE");
      res.json(withFit(staleEntry.data.points, staleEntry.data.generatedAt, { stale: true }));
      return;
    }
    const snap = await trySnapshotCurve(segment);
    if (snap) {
      res.setHeader("X-Cache", "STALE");
      res.json(withFit(snap, new Date().toISOString(), { stale: true }));
      return;
    }
    if (!isMarketHours(new Date())) {
      res.json(withFit([], new Date().toISOString(), { isMarketClosed: true }));
      return;
    }
    const message = err instanceof Error ? err.message : "Error al consultar curva";
    res.status(502).json({ error: message });
    return;
  } finally {
    if (inFlightCurve.get(cacheKey) === promise) inFlightCurve.delete(cacheKey);
  }
});

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
    res.setHeader("X-Cache", "STALE");
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
// GET /api/bonds/panel
// ---------------------------------------------------------------------------

router.get("/panel", async (req: Request, res: Response) => {
  if (!BONDS_PANEL_ENABLED) {
    res.status(404).json({ error: "Panel no habilitado", code: "BOND_PANEL_DISABLED" });
    return;
  }

  const parsed = panelQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    res.status(400).json({ error: msg || "Parámetros inválidos", code: "PANEL_QUERY_INVALID" });
    return;
  }
  const { segment, sort, order, page, pageSize } = parsed.data;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  const cacheEntry = bondsPanelCache.getEntry(PANEL_CACHE_KEY);

  let fullRows: BondPanelRow[] | null = null;
  let generatedAt: string | null = null;
  let isStale = false;

  if (cacheEntry) {
    if (bondsPanelCache.isFresh(cacheEntry)) {
      fullRows = cacheEntry.data.rows;
      generatedAt = cacheEntry.data.generatedAt;
      res.setHeader("X-Cache", "HIT");
    } else {
      fullRows = cacheEntry.data.rows;
      generatedAt = cacheEntry.data.generatedAt;
      isStale = true;
      refreshPanelInBackground();
      res.setHeader("X-Cache", "STALE");
    }
  } else {
    const existing = inFlightPanel.get(PANEL_CACHE_KEY);
    if (existing) {
      try {
        const data = await existing;
        fullRows = data.rows;
        generatedAt = data.generatedAt;
        res.setHeader("X-Cache", "HIT");
      } catch {
        // fall through to fetch
      }
    }
    if (!fullRows) {
      const promise = fetchBondPanel();
      inFlightPanel.set(PANEL_CACHE_KEY, promise);
      try {
        const data = await promise;
        bondsPanelCache.set(PANEL_CACHE_KEY, data);
        fullRows = data.rows;
        generatedAt = data.generatedAt;
        res.setHeader("X-Cache", "MISS");
      } catch (err) {
        const staleEntry = bondsPanelCache.getEntry(PANEL_CACHE_KEY);
        if (staleEntry) {
          fullRows = staleEntry.data.rows;
          generatedAt = staleEntry.data.generatedAt;
          isStale = true;
          res.setHeader("X-Cache", "STALE");
        } else {
          const snap = await trySnapshotPanel();
          if (snap) {
            fullRows = snap.rows;
            generatedAt = snap.generatedAt;
            isStale = true;
            res.setHeader("X-Cache", "STALE");
          } else if (!isMarketHours(new Date())) {
            res.json({
              data: [],
              pagination: { page, pageSize, total: 0 },
              meta: { isStale: true, snapshotAt: null, generatedAt: new Date().toISOString() },
              rows: [],
              total: 0,
              page,
              pageSize,
              sort,
              order,
              generatedAt: new Date().toISOString(),
              disclaimer: DISCLAIMER,
              stale: true,
            } satisfies BondPanelResponse & Record<string, unknown>);
            return;
          } else {
            const message = err instanceof Error ? err.message : "Error al consultar panel";
            res.status(502).json({ error: message });
            return;
          }
        }
      } finally {
        if (inFlightPanel.get(PANEL_CACHE_KEY) === promise) inFlightPanel.delete(PANEL_CACHE_KEY);
      }
    }
  }

  let rows = fullRows ?? [];

  if (segment) {
    rows = rows.filter((r) => inferSegment(r as unknown as BondAnalytics) === segment);
  }

  rows = sortRowsNullsLast(rows, sort, order as "asc" | "desc");

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const paginated = rows.slice(start, start + pageSize);

  const response: BondPanelResponse = {
    data: paginated,
    pagination: { page, pageSize, total },
    meta: { isStale, snapshotAt: null, generatedAt: generatedAt ?? new Date().toISOString() },
    rows: paginated,
    total,
    page,
    pageSize,
    sort,
    order,
    generatedAt: generatedAt ?? new Date().toISOString(),
    disclaimer: DISCLAIMER,
    stale: isStale,
  };

  if (isStale) {
    res.json({ ...response, stale: true });
  } else {
    res.json(response);
  }
});

// ---------------------------------------------------------------------------
// GET /api/bonds/universe?type=ON|ALL  alias de /panel?segment=ONS (REQ-BUO-001)
// ---------------------------------------------------------------------------

router.get("/universe", async (req: Request, res: Response) => {
  if (!BONDS_ONS_ENABLED) {
    res.status(404).json({ error: "Universo ON no habilitado", code: "not_enabled" });
    return;
  }
  const universeQuerySchema = z.object({
    type: z.enum(["ON", "ALL"]).optional(),
  });
  const parsed = universeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parámetro type inválido (ON|ALL)", code: "UNIVERSE_TYPE_INVALID" });
    return;
  }
  const type = parsed.data.type ?? "ALL";

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  // Reuse panel cache/logic — filtered universe
  let rows: BondPanelRow[] = [];
  let generatedAt = new Date().toISOString();
  const panelEntry = bondsPanelCache.getEntry(PANEL_CACHE_KEY);
  if (panelEntry) {
    rows = panelEntry.data.rows;
    generatedAt = panelEntry.data.generatedAt;
    if (!bondsPanelCache.isFresh(panelEntry)) refreshPanelInBackground();
  } else {
    try {
      const data = await fetchBondPanel();
      bondsPanelCache.set(PANEL_CACHE_KEY, data);
      rows = data.rows;
      generatedAt = data.generatedAt;
    } catch (err) {
      const snap = await trySnapshotPanel();
      if (snap) {
        rows = snap.rows;
        generatedAt = snap.generatedAt;
      } else {
        const message = err instanceof Error ? err.message : "Error universe";
        res.status(502).json({ error: message });
        return;
      }
    }
  }

  // Alias: type=ON → segment ONS, type=ALL → todo
  let filtered = rows;
  if (type === "ON") {
    filtered = rows.filter((r) => inferSegment(r as unknown as BondAnalytics) === "ONS");
  }

  res.json({
    type,
    data: filtered,
    rows: filtered,
    total: filtered.length,
    count: filtered.length,
    generatedAt,
    disclaimer: DISCLAIMER,
    isMarketClosed: !isMarketHours(new Date()),
  });
});

// ---------------------------------------------------------------------------
// GET /api/bonds/:symbol/history?range=30d|90d|1y  (REQ-BAV-004) lectura snapshots
// ---------------------------------------------------------------------------

router.get("/:symbol/history", async (req: Request, res: Response) => {
  const symbol = String(req.params.symbol ?? "").toUpperCase().trim();
  if (!symbol || !/^[A-Z0-9]{2,12}$/.test(symbol)) {
    res.status(400).json({ error: "Símbolo inválido", code: "SYMBOL_INVALID" });
    return;
  }
  const rangeRaw = String(req.query.range ?? "30d");
  if (!["30d", "90d", "1y"].includes(rangeRaw)) {
    res.status(400).json({ error: "Parámetro range inválido (30d|90d|1y)", code: "RANGE_INVALID" });
    return;
  }
  const days = rangeRaw === "1y" ? 365 : rangeRaw === "90d" ? 90 : 30;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  try {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    // Leer snapshots en rango — payload.analytics filtrado por símbolo
    const result = await pool.query(
      `SELECT snapshot_date, captured_at, payload FROM bond_analytics_snapshots WHERE snapshot_date >= $1 ORDER BY snapshot_date ASC`,
      [cutoffStr],
    );
    const history: Array<{ date: string; tir: number | null; paridad: number | null; precio: number | null; md: number | null; duration: number | null }> = [];
    for (const row of result.rows as Array<{ snapshot_date: string | Date; captured_at: string | Date; payload: { analytics?: BondAnalytics[] } }>) {
      const payload = (row as unknown as { payload: { analytics?: BondAnalytics[] } }).payload;
      const analytics = payload?.analytics ?? [];
      const found = analytics.find((a) => String(a.symbol).toUpperCase() === symbol);
      if (found) {
        const dateStr = row.snapshot_date instanceof Date ? row.snapshot_date.toISOString().slice(0, 10) : String(row.snapshot_date).slice(0, 10);
        history.push({
          date: dateStr,
          tir: found.tir ?? null,
          // callable nullea tir — si schedule callable, forzar null
          paridad: found.paridad ?? null,
          precio: found.precio ?? (found as unknown as { precioDirty?: number }).precioDirty ?? null,
          md: found.md ?? null,
          duration: (found as unknown as { duration?: number | null }).duration ?? null,
        });
        // REQ callable: si es callable, history debe reflejar tir null
        const sched = (found as unknown as { schedule?: { tipo?: string; callable?: boolean } }).schedule;
        if (sched?.tipo === "callable" || sched?.callable === true) {
          history[history.length - 1]!.tir = null;
        }
      }
    }
    res.json({
      symbol,
      range: rangeRaw,
      history,
      count: history.length,
      generatedAt: new Date().toISOString(),
      disclaimer: DISCLAIMER,
    });
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar history";
    res.status(502).json({ error: message });
    return;
  }
});

// ---------------------------------------------------------------------------
// GET /api/bonds/:symbol/ficha
// ---------------------------------------------------------------------------

router.get("/:symbol/ficha", async (req: Request, res: Response) => {
  if (!BONDS_PANEL_ENABLED) {
    res.status(404).json({ error: "Panel no habilitado", code: "BOND_PANEL_DISABLED" });
    return;
  }

  const rawSymbol = String(req.params.symbol ?? "").toUpperCase().trim();
  if (!rawSymbol || !/^[A-Z0-9]{2,12}$/.test(rawSymbol)) {
    res.status(400).json({ error: "Símbolo inválido", code: "SYMBOL_INVALID" });
    return;
  }
  const symbol = rawSymbol;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Disclaimer", DISCLAIMER);
  res.setHeader("Disclaimer", DISCLAIMER);

  const provider = new QuoteService(new BymaClient(), new BymaFichaClient());

  let fichaRaw: any = null;
  let quote: any = null;
  let maeAnalytic: BondAnalytics | null = null;
  let schedule: any = null;
  let cerStale = false;

  try {
    const [fichaR, quoteR, maeR, schedR] = await Promise.all([
      (provider.getBondFichaRaw(symbol) as Promise<any>).catch(() => null),
      (provider.getQuote({ id: "", email: "" } as unknown as import("../../../services/iol/types.js").IolCredentials, symbol, "bcba") as Promise<any>).catch(() => null),
      getMaeAnalyticsForSymbol(symbol).catch(() => null) as Promise<BondAnalytics | null>,
      (provider.getBondSchedule(symbol) as Promise<any>).catch(() => null),
    ]);
    fichaRaw = fichaR;
    quote = quoteR;
    maeAnalytic = maeR;
    schedule = schedR;
  } catch {
    // individual catches handle errors
  }

  const hasPrice = quote && quote.lastPrice > 0;
  const hasMae = maeAnalytic != null;
  const hasSchedule = schedule != null && schedule.cashflows.length > 0;
  if (!hasPrice && !hasMae && !hasSchedule && !fichaRaw) {
    res.status(404).json({ error: `Bono ${symbol} no encontrado`, code: "BOND_NOT_FOUND" });
    return;
  }

  const finalSchedule = maeAnalytic?.schedule ?? schedule ?? {
    symbol,
    moneda: "ARS" as const,
    tipo: "bullet" as const,
    vencimiento: new Date().toISOString().slice(0, 10),
    cashflows: [],
    cerAjustado: false,
  };

  const dirtyPrice = hasPrice ? (quote!.lastPrice as number) : maeAnalytic?.precio ?? 0;
  if (!dirtyPrice || dirtyPrice <= 0) {
    const snap = await trySnapshotAnalytics(symbol);
    if (snap) {
      res.setHeader("X-Cache", "STALE");
      const accruedFallback = null;
      const vrFallback = finalSchedule.cashflows[0]?.vr ?? 100;
      const cuadroFallback = calcCuadroTecnico({ dirtyPrice: snap.precio, vr: vrFallback, accrued: accruedFallback });
      res.json({
        ...snap,
        marketData: { bid: snap.schedule ? null : null, ask: null, spread: null, volumeNominal: null, volumeEfectivo: null, low: null, high: null, open: null, close: null },
        cuadroTecnico: { vt: cuadroFallback.vt, vr: vrFallback, paridad: cuadroFallback.paridad, accrued: null, couponRate: null, frequency: null, dayCount: "30/360", nextCouponDate: null, isin: null, ley: null, emisor: null, denominacionMinima: null, outstanding: null, isParidadCalculable: false, paridadCalculable: false, scheduleSource: "synthetic" as const },
        stale: { cer: false },
        isStale: true,
      });
      return;
    }
    res.status(404).json({ error: `Bono ${symbol} no encontrado`, code: "BOND_NOT_FOUND" });
    return;
  }

  let tir: number | null = maeAnalytic?.tir ?? null;
  let md: number | null = maeAnalytic?.md ?? null;
  let duration: number | null = maeAnalytic?.duration ?? null;
  if ((tir == null || md == null) && finalSchedule.cashflows.length > 0 && dirtyPrice > 0) {
    try {
      const settlement = new Date().toISOString().slice(0, 10);
      const dayCount: "30/360" | "Actual/365" = finalSchedule.moneda === "USD" ? "30/360" : "Actual/365";
      tir = calcTIR(dirtyPrice, finalSchedule.cashflows, { dayCount, settlement });
      if (tir != null) {
        const d = calcDurations(tir, finalSchedule.cashflows, { settlement, dayCount, periodsPerYear: finalSchedule.moneda === "USD" ? 2 : 1 });
        duration = d.duration;
        md = d.modifiedDuration;
      }
    } catch {
      // keep nulls
    }
  }

  let lastVr = 100;
  if (finalSchedule.cashflows.length > 0) {
    const cand = finalSchedule.cashflows[0]?.vr;
    lastVr = cand != null && cand > 0 ? cand : 100;
  }
  let accrued: number | null = null;
  let couponRate: number | null = null;
  let frequency: 1 | 2 | 4 | null = null;
  let dayCountPc: "30/360" | "Actual/365" = finalSchedule.moneda === "USD" ? "30/360" : "Actual/365";
  let nextCouponDate: string | null = null;
  let scheduleSource: BondCuadroTecnico["scheduleSource"] = maeAnalytic ? "mae" : fichaRaw ? "byma" : "synthetic";

  if (fichaRaw?.interes) {
    const parsed = parseInteresToCouponRate(fichaRaw.interes);
    if (parsed) {
      couponRate = parsed.rate;
      frequency = parsed.frequency;
      dayCountPc = parsed.dayCount;
      nextCouponDate = parsed.lastCouponDate ?? null;
      const lastCouponDate = parsed.lastCouponDate ?? (fichaRaw.fechaDevenganIntereses ? String(fichaRaw.fechaDevenganIntereses).slice(0, 10) : null) ?? (fichaRaw.fechaEmision ? String(fichaRaw.fechaEmision).slice(0, 10) : null);
      if (lastCouponDate && /^\d{4}-\d{2}-\d{2}$/.test(lastCouponDate)) {
        const settlement = new Date().toISOString().slice(0, 10);
        accrued = calcAccruedFromFicha({ couponRate, lastCouponDate, settlement, vr: lastVr, dayCount: dayCountPc, frequency: frequency ?? undefined });
      }
    } else {
      accrued = null;
    }
  }

  if (finalSchedule.cashflows.length === 0 || (finalSchedule.cashflows.length === 1 && finalSchedule.cashflows[0]?.cashFlow === 100 && !fichaRaw)) {
    scheduleSource = "synthetic";
  } else if (fichaRaw && scheduleSource === "synthetic") {
    scheduleSource = "byma";
  }

  const cuadroRes = calcCuadroTecnico({ dirtyPrice, vr: lastVr, accrued });
  const cuadroTecnico: BondCuadroTecnico = {
    vt: cuadroRes.vt,
    vr: lastVr,
    paridad: cuadroRes.paridad,
    accrued,
    couponRate,
    frequency,
    dayCount: dayCountPc,
    nextCouponDate,
    isin: fichaRaw?.codigoIsin ?? null,
    ley: fichaRaw?.ley ?? fichaRaw?.paisLey ?? null,
    emisor: fichaRaw?.emisor ?? null,
    denominacionMinima: fichaRaw?.denominacionMinima ?? null,
    outstanding: fichaRaw?.montoResidual ?? fichaRaw?.montoNominal ?? null,
    isParidadCalculable: cuadroRes.isParidadCalculable,
    paridadCalculable: cuadroRes.isParidadCalculable,
    scheduleSource,
  };

  const marketData: BondMarketData = {
    bid: quote?.bid ?? null,
    ask: quote?.ask ?? null,
    spread: quote?.bid != null && quote?.ask != null ? Number(quote.ask) - Number(quote.bid) : null,
    volumeNominal: (quote as unknown as { volume?: number | null })?.volume ?? null,
    volumeEfectivo: null,
    low: quote?.low ?? null,
    high: quote?.high ?? null,
    open: quote?.open ?? null,
    close: quote?.prevClose ?? null,
  };

  if (finalSchedule.cerAjustado) {
    try {
      const cer = await getCER();
      if ((cer as unknown as { stale?: boolean }).stale) cerStale = true;
    } catch {
      cerStale = true;
    }
  }

  res.setHeader("X-Cache", "MISS");
  res.json({
    symbol,
    precio: dirtyPrice,
    precioDirty: dirtyPrice,
    tir,
    md,
    duration,
    paridad: cuadroTecnico.paridad,
    interesCorrido: accrued ?? 0,
    schedule: finalSchedule,
    isRealtime: true,
    source: maeAnalytic ? "mae" : "local",
    disclaimer: DISCLAIMER,
    marketData,
    cuadroTecnico,
    cuadro: cuadroTecnico,
    market: marketData,
    isin: cuadroTecnico.isin,
    ley: cuadroTecnico.ley,
    stale: { cer: cerStale },
    isStale: cerStale,
  });
});

// ---------------------------------------------------------------------------
// GET /api/bonds/:symbol/analytics
// ---------------------------------------------------------------------------

router.get("/:symbol/analytics", async (req: Request, res: Response) => {
  const symbol = String(req.params.symbol ?? "").toUpperCase().trim();
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

export default router;
