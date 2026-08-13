import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { IolProvider } from "../iol/IolProvider.js";
import type {
  IolCredentials,
  MonthClose,
  MonthlyReport,
  Operation,
  PortfolioSummary,
} from "../iol/types.js";

// ============================================================
// REPORTES MENSUALES REALES — construidos sobre portfolio_snapshots
//
// Los numerics de Postgres llegan como STRING desde drizzle.
// REGLA DE ORO: todo número sale con Number().
//
// PROXIES DOCUMENTADOS (no son exactos, son la mejor aproximación
// disponible con los datos que expone IOL):
//  - netContributionsArs = compras - ventas del mes (IOL no expone
//    depósitos/retiros de dinero reales).
//  - realizedGainArs = ventas × (precio - costoEstimado), donde
//    costoEstimado es el PPC ACTUAL del símbolo (provider.getPortfolio).
//    Si el símbolo ya no está en cartera, el costo se asume 0.
//  - twrPct = Dietz simple: R = (EMV - BMV - CF) / (BMV + CF*0.5) * 100.
//  - benchmarkPct / series.benchmark: índice Merval (^MERV) de Yahoo.
//    Si Yahoo no responde, el benchmark queda plano (1000).
//  - fxChangePct: USDARS=X de Yahoo. Si falla, 0.
//  - dividendsArs: 0 (IOL no expone dividendos).
// ============================================================

// ============================================================
// HELPERS DE FECHA — TODO en fecha LOCAL del server (UTC-3 Argentina)
// ============================================================

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalMonthKey(d: Date): string {
  return toLocalDateKey(d).slice(0, 7);
}

/** Inicio del día local (00:00) */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Inicio del mes local (día 1, 00:00) */
function startOfLocalMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

// ============================================================
// TIPO INTERNO DE SNAPSHOT (numeric → string en drizzle)
// ============================================================

type SnapshotRow = typeof schema.portfolioSnapshots.$inferSelect;

function snapNumber(s: SnapshotRow, field: "totalValue" | "totalValueUsd" | "cash" | "cashArs" | "cashUsd" | "positionsValue" | "unrealizedGain" | "dayChangePct"): number {
  return Number(s[field] ?? 0);
}

// ============================================================
// DIETZ SIMPLE — TWR aproximado excluyendo aportes/retiros
// ============================================================

function dietzPct(bmv: number, emv: number, cf: number): number {
  const denominator = bmv + cf * 0.5;
  if (denominator === 0) return 0;
  return ((emv - bmv - cf) / denominator) * 100;
}

// ============================================================
// YAHOO FINANCE — Merval y dólar oficial (público, sin auth)
// ============================================================

interface YahooPoint {
  date: string; // YYYY-MM-DD (fecha local del server)
  close: number;
}

const YAHOO_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const yahooCache = new Map<string, { expiresAt: number; data: YahooPoint[] }>();

/**
 * Serie diaria de cierre del símbolo de Yahoo (range=1y, interval=1d).
 * Nunca lanza: si Yahoo falla (401/429/red) devuelve [] para que el
 * reporte se degrade (benchmark plano, fx 0) en lugar de romper.
 */
export async function fetchYahooDaily(symbol: string): Promise<YahooPoint[]> {
  const cached = yahooCache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } }
    );
    if (!res.ok) return [];

    const json = (await res.json()) as {
      chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
    };
    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];

    const data: YahooPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i];
      if (close == null || !Number.isFinite(close)) continue;
      data.push({
        date: toLocalDateKey(new Date(timestamps[i] * 1000)),
        close,
      });
    }

    yahooCache.set(symbol, { expiresAt: Date.now() + YAHOO_CACHE_TTL_MS, data });
    return data;
  } catch {
    return [];
  }
}

const MERVAL_SYMBOL = "^MERV";
const FX_SYMBOL = "ARS=X";

/** Cierre del día pedido o el más cercano ANTERIOR disponible */
function closeOnOrBefore(points: YahooPoint[], dateKey: string): number | null {
  let best: number | null = null;
  for (const p of points) {
    if (p.date <= dateKey) best = p.close;
    else break;
  }
  return best;
}

/** Cierre del día pedido o el más cercano DISPONIBLE (<=, si no el primero) */
function closeNearest(points: YahooPoint[], dateKey: string): number | null {
  const before = closeOnOrBefore(points, dateKey);
  if (before != null) return before;
  return points.length > 0 ? points[0].close : null;
}

/** Variación % entre dos cierres (null si falta alguno) */
function pctBetween(a: number | null, b: number | null): number {
  if (a == null || b == null || a === 0) return 0;
  return ((b - a) / a) * 100;
}

// ============================================================
// SNAPSHOT SYNC — un snapshot por día local por cuenta
// ============================================================

/**
 * Inserta el snapshot del día si todavía no existe para la cuenta.
 * Idempotente por construcción: capturedAt = medianoche LOCAL del día,
 * con ON CONFLICT DO NOTHING contra el unique(account_id, captured_at).
 * El primero del día vale — no se actualiza.
 */
export async function saveDailySnapshot(accountId: string, portfolio: PortfolioSummary): Promise<boolean> {
  const todayStart = startOfLocalDay(new Date());
  const tomorrow = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1);

  const [existing] = await db
    .select({ id: schema.portfolioSnapshots.id })
    .from(schema.portfolioSnapshots)
    .where(
      and(
        eq(schema.portfolioSnapshots.accountId, accountId),
        gte(schema.portfolioSnapshots.capturedAt, todayStart),
        lt(schema.portfolioSnapshots.capturedAt, tomorrow)
      )
    )
    .limit(1);

  if (existing) return false;

  await db
    .insert(schema.portfolioSnapshots)
    .values({
      accountId,
      totalValue: String(portfolio.totalArs),
      totalValueUsd: String(portfolio.totalUsd),
      cash: String(portfolio.cashArs),
      cashArs: String(portfolio.cashArs),
      cashUsd: String(portfolio.cashUsd),
      positionsValue: String(portfolio.positionsValueArs),
      unrealizedGain: String(portfolio.gainLossArs),
      dayChangePct: String(portfolio.dayChangePct),
      currency: "ARS",
      capturedAt: todayStart,
    })
    .onConflictDoNothing();

  return true;
}

// ============================================================
// ACCESO A DATOS
// ============================================================

async function getSnapshots(accountId: string): Promise<SnapshotRow[]> {
  return db
    .select()
    .from(schema.portfolioSnapshots)
    .where(eq(schema.portfolioSnapshots.accountId, accountId))
    .orderBy(asc(schema.portfolioSnapshots.capturedAt));
}

async function getSnapshotsInRange(accountId: string, from: Date, to: Date): Promise<SnapshotRow[]> {
  return db
    .select()
    .from(schema.portfolioSnapshots)
    .where(
      and(
        eq(schema.portfolioSnapshots.accountId, accountId),
        gte(schema.portfolioSnapshots.capturedAt, from),
        lt(schema.portfolioSnapshots.capturedAt, to)
      )
    )
    .orderBy(asc(schema.portfolioSnapshots.capturedAt));
}

async function getAccountNumber(accountId: string): Promise<string | null> {
  const [account] = await db
    .select({ iolAccountNumber: schema.accounts.iolAccountNumber })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId));
  return account?.iolAccountNumber ?? null;
}

/** Aportes netos del mes (proxy documentado: compras - ventas) */
async function getNetContributionsForMonth(
  creds: IolCredentials,
  provider: IolProvider,
  accountNumber: string,
  monthKey: string
): Promise<{ buys: number; sells: number; all: Operation[] }> {
  let ops: Operation[] = [];
  try {
    ops = await provider.getOperations(creds, accountNumber);
  } catch {
    // Sin historial de operaciones el proxy queda en 0 — no romper el reporte
    ops = [];
  }

  const monthOps = ops.filter((op) => toLocalMonthKey(new Date(op.date)) === monthKey);
  const buys = monthOps.filter((op) => op.type === "buy").reduce((s, op) => s + op.total, 0);
  const sells = monthOps.filter((op) => op.type === "sell").reduce((s, op) => s + op.total, 0);
  return { buys, sells, all: monthOps };
}

// ============================================================
// GET MONTHLY CLOSES — comparativa histórica de cierres mensuales
// ============================================================

export async function buildMonthlyCloses(
  accountId: string,
  creds: IolCredentials,
  provider: IolProvider
): Promise<MonthClose[]> {
  const snapshots = await getSnapshots(accountId);
  if (snapshots.length === 0) return [];

  const accountNumber = await getAccountNumber(accountId);

  // Aportes por mes: compras - ventas (proxy documentado)
  const contributionsByMonth = new Map<string, number>();
  if (accountNumber) {
    const allOps = await provider.getOperations(creds, accountNumber).catch(() => []);
    for (const op of allOps) {
      const monthKey = toLocalMonthKey(new Date(op.date));
      const delta = op.type === "buy" ? op.total : op.type === "sell" ? -op.total : 0;
      contributionsByMonth.set(monthKey, (contributionsByMonth.get(monthKey) ?? 0) + delta);
    }
  }

  // Agrupar snapshots por mes local
  const byMonth = new Map<string, SnapshotRow[]>();
  for (const s of snapshots) {
    const monthKey = toLocalMonthKey(s.capturedAt);
    const list = byMonth.get(monthKey) ?? [];
    list.push(s);
    byMonth.set(monthKey, list);
  }

  const closes: MonthClose[] = [];
  for (const [monthKey, list] of byMonth) {
    const [year, mon] = monthKey.split("-").map(Number);
    const monthStart = new Date(year, mon - 1, 1);

    const emvSnap = list[list.length - 1];
    const emv = snapNumber(emvSnap, "totalValue");

    let bmv: number;
    if (list.length === 1) {
      // Mes con un solo snapshot: BMV = el snapshot anterior al mes.
      // Si no hay anterior (primer mes de datos, ej. el actual), BMV = el
      // MISMO snapshot → twr 0% y grossChange 0 — el mes arranca la serie.
      const before = snapshots.filter((s) => s.capturedAt < monthStart);
      bmv = before.length === 0 ? emv : snapNumber(before[before.length - 1], "totalValue");
    } else {
      bmv = snapNumber(list[0], "totalValue");
    }

    const cf = contributionsByMonth.get(monthKey) ?? 0;
    closes.push({
      month: monthKey,
      closingValueArs: emv,
      closingValueUsd: snapNumber(emvSnap, "totalValueUsd"),
      twrPct: dietzPct(bmv, emv, cf),
      grossChangeArs: emv - bmv,
      netContributionsArs: cf,
    });
  }

  return closes;
}

// ============================================================
// GET MONTHLY REPORT — reporte mensual completo
// ============================================================

export async function buildMonthlyReport(
  accountId: string,
  creds: IolCredentials,
  provider: IolProvider,
  month: string
): Promise<MonthlyReport> {
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) {
    throw new Error(`Mes inválido: ${month}`);
  }

  const monthStart = new Date(year, mon - 1, 1);
  const monthEnd = new Date(year, mon, 1);
  const prevMonthStart = addMonths(monthStart, -1);

  const monthSnaps = await getSnapshotsInRange(accountId, monthStart, monthEnd);
  if (monthSnaps.length === 0) {
    throw new Error(`No hay snapshots para el mes ${month}. Los reportes se generan a partir de los snapshots diarios.`);
  }

  const prevSnaps = await getSnapshotsInRange(accountId, prevMonthStart, monthStart);
  const prevSnap = prevSnaps.length > 0 ? prevSnaps[prevSnaps.length - 1] : null;

  const firstSnap = monthSnaps[0];
  const lastSnap = monthSnaps[monthSnaps.length - 1];

  const bmv = snapNumber(firstSnap, "totalValue");
  const emv = snapNumber(lastSnap, "totalValue");
  const accountNumber = await getAccountNumber(accountId);

  // ---- Actividad del mes: compras, ventas, comisiones, aportes ----
  let buys: Operation[] = [];
  let sells: Operation[] = [];
  let totalBuysArs = 0;
  let totalSellsArs = 0;
  let commissionsArs = 0;

  if (accountNumber) {
    const { all } = await getNetContributionsForMonth(creds, provider, accountNumber, month);
    buys = all.filter((op) => op.type === "buy");
    sells = all.filter((op) => op.type === "sell");
    totalBuysArs = buys.reduce((s, op) => s + op.total, 0);
    totalSellsArs = sells.reduce((s, op) => s + op.total, 0);
    commissionsArs = all.reduce((s, op) => s + op.commission, 0);
  }
  const netContributionsArs = totalBuysArs - totalSellsArs;

  // ---- Ganancia realizada: ventas × (precio - costoEstimado) ----
  // costoEstimado = PPC actual del símbolo (provider.getPortfolio).
  // Si el símbolo ya no está en cartera, el costo se asume 0 (documentado).
  let realizedGainArs = 0;
  if (sells.length > 0 && accountNumber) {
    const ppcBySymbol = new Map<string, number>();
    try {
      const portfolio = await provider.getPortfolio(creds, accountNumber);
      for (const p of portfolio.positions) {
        if (!ppcBySymbol.has(p.symbol)) ppcBySymbol.set(p.symbol, p.avgPrice ?? 0);
      }
    } catch {
      // Sin portafolio no hay costo estimado → se asume 0
    }
    realizedGainArs = sells.reduce((sum, op) => {
      const cost = ppcBySymbol.get(op.symbol) ?? 0;
      return sum + (op.price - cost) * op.quantity;
    }, 0);
  }

  // ---- Rendimiento ----
  const grossChangeArs = emv - bmv;
  const grossChangePct = bmv !== 0 ? (emv / bmv - 1) * 100 : 0;
  const twrPct = dietzPct(bmv, emv, netContributionsArs);
  const twrArs = (twrPct / 100) * bmv;
  const unrealizedGainArs = snapNumber(lastSnap, "unrealizedGain");

  // ---- Mejor/peor día: variación día a día entre snapshots del mes ----
  let bestDay: { date: string; pct: number } | null = null;
  let worstDay: { date: string; pct: number } | null = null;
  for (let i = 1; i < monthSnaps.length; i++) {
    const prev = snapNumber(monthSnaps[i - 1], "totalValue");
    const curr = snapNumber(monthSnaps[i], "totalValue");
    if (prev === 0) continue;
    const pct = ((curr - prev) / prev) * 100;
    const point = { date: toLocalDateKey(monthSnaps[i].capturedAt), pct };
    if (!bestDay || pct > bestDay.pct) bestDay = point;
    if (!worstDay || pct < worstDay.pct) worstDay = point;
  }

  // ---- Benchmark (Merval) y FX (dólar oficial) desde Yahoo ----
  const [merval, fx] = await Promise.all([fetchYahooDaily(MERVAL_SYMBOL), fetchYahooDaily(FX_SYMBOL)]);

  // Series: valor diario + benchmark normalizado a base 1000
  const firstDate = toLocalDateKey(firstSnap.capturedAt);
  const lastDate = toLocalDateKey(lastSnap.capturedAt);
  const mervalBase = closeNearest(merval, firstDate);

  let mervalCarry: number | null = null;
  const series = monthSnaps.map((s) => {
    const date = toLocalDateKey(s.capturedAt);
    const close = merval.find((p) => p.date === date)?.close;
    if (close != null) mervalCarry = close;
    const benchmark = mervalBase && (mervalCarry ?? mervalBase) > 0
      ? ((mervalCarry ?? mervalBase) / mervalBase) * 1000
      : 1000;
    return {
      date,
      valueArs: snapNumber(s, "totalValue"),
      benchmark: Math.round(benchmark * 100) / 100,
    };
  });

  // Variación % del Merval entre el día previo al mes y el último día con snapshot
  const prevDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 0);
  const mervalStart = closeOnOrBefore(merval, toLocalDateKey(prevDay));
  const mervalEnd = closeOnOrBefore(merval, lastDate);
  const benchmarkPct = pctBetween(mervalStart, mervalEnd);

  // Variación % del dólar oficial en el mismo rango
  const fxStart = closeOnOrBefore(fx, toLocalDateKey(prevDay));
  const fxEnd = closeOnOrBefore(fx, lastDate);
  const fxChangePct = pctBetween(fxStart, fxEnd);

  const prevClosingValueArs = prevSnap ? snapNumber(prevSnap, "totalValue") : bmv;
  const prevClosingValueUsd = prevSnap ? snapNumber(prevSnap, "totalValueUsd") : snapNumber(lastSnap, "totalValueUsd");

  return {
    month,
    closingValueArs: emv,
    closingValueUsd: snapNumber(lastSnap, "totalValueUsd"),
    previousClosingValueArs: prevClosingValueArs,
    previousClosingValueUsd: prevClosingValueUsd,
    grossChangeArs,
    grossChangePct,
    twrPct,
    twrArs,
    netContributionsArs,
    realizedGainArs,
    unrealizedGainArs,
    buys,
    sells,
    totalBuysArs,
    totalSellsArs,
    commissionsArs,
    dividendsArs: 0, // IOL no expone dividendos
    bestDay,
    worstDay,
    benchmarkPct,
    fxChangePct,
    series,
  };
}
