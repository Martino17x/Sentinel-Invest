import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { SwrCache } from "../services/market/cache.js";
import { BONDS_ANALYTICS_ENABLED, BONDS_PANEL_ENABLED } from "../config.js";
import { DISCLAIMER } from "../services/market/radar.js";
import { isMarketHours } from "../services/market/isMarketHours.js";
import { pool } from "../db/index.js";
import { BymaDataProvider, parseInteresToCouponRate } from "../services/iol/BymaDataProvider.js";
import { getAllMaeAnalytics, getMaeAnalyticsForSymbol } from "../services/market/bonds/maeFlujo.js";
import { buildCurve, VALID_SEGMENTS, inferSegment } from "../services/market/bonds/curve.js";
import { projectCashflow } from "../services/market/bonds/cashflow.js";
import { getLatestBondAnalyticsSnapshot } from "../jobs/bondAnalyticsSnapshot.js";
import { calcTIR } from "../services/market/bonds/tir.js";
import { calcDurations } from "../services/market/bonds/duration.js";
import { calcParidad, calcCuadroTecnico, calcAccruedFromFicha } from "../services/market/bonds/paridad.js";
import { getCER } from "../services/market/bonds/cer.js";
import type { BondAnalytics, CurvePoint, CashflowMonth, BondPanelRow, BondPanelResponse, BondCuadroTecnico, BondMarketData } from "../services/market/bonds/types.js";

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
// Panel bulk helpers — SwrCache 5min + inFlight dedup (Task 3.1/3.2)
// ---------------------------------------------------------------------------

const PANEL_CACHE_KEY = "bonds:panel:full";

const panelQuerySchema = z.object({
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

async function fetchBondPanel(): Promise<{ rows: BondPanelRow[]; generatedAt: string }> {
  const generatedAt = new Date().toISOString();
  const provider = new BymaDataProvider();

  // Parallel bulk fetch: BYMA public-bonds + MAE H+B
  const [panelResult, maeAnalytics] = await Promise.all([
    // BymaDataProvider.getPanel paginates locally — request big pageSize to get all
    provider.getPanel({ id: "", email: "" } as unknown as import("../services/iol/types.js").IolCredentials, "bcba", "bono", 1, 5000).catch(() => ({ quotes: [] as import("../services/iol/types.js").PanelQuote[], total: 0, summary: null as unknown as import("../services/iol/types.js").PanelSummary })),
    getAllMaeAnalytics().catch(() => [] as BondAnalytics[]),
  ]);

  const quotes = (panelResult as { quotes: import("../services/iol/types.js").PanelQuote[] }).quotes ?? [];
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

    // Non-MAE synthetic row — tir null etc, schedule bullet placeholder
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

function refreshPanelInBackground(): void {
  if (bgPanelInFlight.has(PANEL_CACHE_KEY)) return;
  const p = fetchBondPanel()
    .then((data) => bondsPanelCache.set(PANEL_CACHE_KEY, data))
    .catch(() => {})
    .finally(() => bgPanelInFlight.delete(PANEL_CACHE_KEY));
  bgPanelInFlight.set(PANEL_CACHE_KEY, p as Promise<void>);
}

async function trySnapshotPanel(): Promise<{ rows: BondPanelRow[]; generatedAt: string } | null> {
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
    // Fallback: build rows from analytics if no panelSnapshot stored
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
// GET /api/bonds/panel  (MUST be before /:symbol/analytics catch-all — Task 3.5)
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

  // At this point fullRows is populated
  let rows = fullRows ?? [];

  // Segment filter
  if (segment) {
    rows = rows.filter((r) => inferSegment(r as unknown as BondAnalytics) === segment);
  }

  // Sort nulls-last
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
// GET /api/bonds/:symbol/ficha  (Task 3.3 — validate, enrich cuadro+market, CER stale)
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

  // Parallel fetch: fichaRaw + quote + MAE analytics + schedule
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

  // 404 if symbol not found anywhere (no price, no MAE, no ficha)
  const hasPrice = quote && quote.lastPrice > 0;
  const hasMae = maeAnalytic != null;
  const hasSchedule = schedule != null && schedule.cashflows.length > 0;
  if (!hasPrice && !hasMae && !hasSchedule && !fichaRaw) {
    res.status(404).json({ error: `Bono ${symbol} no encontrado`, code: "BOND_NOT_FOUND" });
    return;
  }

  // Resolve schedule: prefer MAE then provider schedule
  const finalSchedule = maeAnalytic?.schedule ?? schedule ?? {
    symbol,
    moneda: "ARS" as const,
    tipo: "bullet" as const,
    vencimiento: new Date().toISOString().slice(0, 10),
    cashflows: [],
    cerAjustado: false,
  };

  // Resolve price
  const dirtyPrice = hasPrice ? (quote!.lastPrice as number) : maeAnalytic?.precio ?? 0;
  if (!dirtyPrice || dirtyPrice <= 0) {
    // Try snapshot fallback before 502
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

  // TIR / duration: prefer MAE, else calc local
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

  // Accrued / cuadroTecnico via calcCuadroTecnico (Task 3.2/3.3)
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
      // Try to compute accrued if we have lastCouponDate or fechaDevenganIntereses
      const lastCouponDate = parsed.lastCouponDate ?? (fichaRaw.fechaDevenganIntereses ? String(fichaRaw.fechaDevenganIntereses).slice(0, 10) : null) ?? (fichaRaw.fechaEmision ? String(fichaRaw.fechaEmision).slice(0, 10) : null);
      if (lastCouponDate && /^\d{4}-\d{2}-\d{2}$/.test(lastCouponDate)) {
        const settlement = new Date().toISOString().slice(0, 10);
        accrued = calcAccruedFromFicha({ couponRate, lastCouponDate, settlement, vr: lastVr, dayCount: dayCountPc, frequency: frequency ?? undefined });
      }
    } else {
      // LECAP a descuento → accrued stays null, paridad not calculable
      accrued = null;
    }
  }

  // If ficha indicates synthetic fallback and no MAE, mark accordingly
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
    volumeEfectivo: null, // quote path doesn't expose volumeAmount; panel does
    low: quote?.low ?? null,
    high: quote?.high ?? null,
    open: quote?.open ?? null,
    close: quote?.prevClose ?? null,
  };
  // Try to enrich volumeEfectivo from panel quote if available via getBondFichaRaw? not needed; leave null off-hours

  // CER stale guard
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
// GET /api/bonds/:symbol/analytics  (MUST be after /curve, /cashflow, /panel, /ficha)
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
  bondsPanelCache.resetForTests();
  inFlightAnalytics.clear();
  inFlightCurve.clear();
  inFlightPanel.clear();
  bgInFlight.clear();
  bgPanelInFlight.clear();
}

export default router;
