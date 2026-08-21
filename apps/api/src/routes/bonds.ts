import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { BONDS_ANALYTICS_ENABLED, BONDS_PANEL_ENABLED } from "../config.js";
import { isMarketHours } from "../services/market/isMarketHours.js";
import { pool } from "../db/index.js";
import { BymaDataProvider, parseInteresToCouponRate } from "../services/iol/BymaDataProvider.js";
import { getMaeAnalyticsForSymbol } from "../services/market/bonds/maeFlujo.js";
import { VALID_SEGMENTS, inferSegment } from "../services/market/bonds/curve.js";
import { getCER } from "../services/market/bonds/cer.js";
import { calcTIR } from "../services/market/bonds/tir.js";
import { calcDurations } from "../services/market/bonds/duration.js";
import { calcCuadroTecnico, calcAccruedFromFicha } from "../services/market/bonds/paridad.js";
import type { BondAnalytics, BondPanelRow, BondPanelResponse, BondCuadroTecnico, BondMarketData } from "../services/market/bonds/types.js";
import {
  DISCLAIMER,
  bondsAnalyticsCache,
  bondsCurveCache,
  bondsCashflowCache,
  bondsPanelCache,
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
} from "../services/market/bonds/bondsQueries.js";

// Re-export for tests that imported from routes (preserve API)
export { getSortValue, sortRowsNullsLast, panelQuerySchema };
export { bondsAnalyticsCache, bondsCurveCache, bondsCashflowCache, bondsPanelCache, DISCLAIMER, PANEL_CACHE_KEY };

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
const inFlightCurve = new Map<string, Promise<import("../services/market/bonds/types.js").CurvePoint[]>>();
const inFlightPanel = new Map<string, Promise<{ rows: BondPanelRow[]; generatedAt: string }>>();

export function resetBondsCacheForTests(): void {
  resetBondsQueriesForTests();
  inFlightAnalytics.clear();
  inFlightCurve.clear();
  inFlightPanel.clear();
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
    if (points.length === 0) {
      const snap = await trySnapshotCurve(segment);
      if (snap) {
        res.setHeader("X-Cache", "STALE");
        res.json({ points: snap, segment, generatedAt: new Date().toISOString(), disclaimer: DISCLAIMER, isMarketClosed: !isMarketHours(new Date()), stale: true });
        return;
      }
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

  const provider = new BymaDataProvider();

  let fichaRaw: any = null;
  let quote: any = null;
  let maeAnalytic: BondAnalytics | null = null;
  let schedule: any = null;
  let cerStale = false;

  try {
    const [fichaR, quoteR, maeR, schedR] = await Promise.all([
      (provider.getBondFichaRaw(symbol) as Promise<any>).catch(() => null),
      (provider.getQuote({ id: "", email: "" } as unknown as import("../services/iol/types.js").IolCredentials, symbol, "bcba") as Promise<any>).catch(() => null),
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
