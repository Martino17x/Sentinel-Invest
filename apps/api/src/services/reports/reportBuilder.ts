import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { IolProvider } from "../iol/IolProvider.js";
import { fetchChart } from "../market/yahoo.js";
import { addArtDays, artDateKeyFromUtc, artStartOfDay } from "./art-time.js";
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
// HELPERS DE FECHA — SIEMPRE en hora ART (UTC-3 fijo) vía art-time.
// El server puede correr en UTC: el día contable es el de Argentina
// (PREREQ-1). Los snapshots se persisten en la medianoche ART como
// instante UTC (artStartOfDay), nunca en hora local del server.
// ============================================================

function toLocalMonthKey(d: Date): string {
  return artDateKeyFromUtc(d).slice(0, 7);
}

/** Primer instante del mes ART ("YYYY-MM-01T03:00:00Z") */
function startOfMonthArt(month: string): Date {
  return new Date(`${month}-01T03:00:00Z`);
}

/** Mes ART desplazado en `delta` meses ("YYYY-MM") */
function shiftMonthKey(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

// ============================================================
// TIPO INTERNO DE SNAPSHOT (numeric → string en drizzle)
// ============================================================

export type SnapshotRow = typeof schema.portfolioSnapshots.$inferSelect;

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
//
// Usa el cliente compartido services/market/yahoo.ts (cache SWR
// 15min, nunca lanza → envelope con status). Acá se preserva el
// contrato original: si Yahoo falla (401/429/red) se devuelve []
// para que el reporte se degrade (benchmark plano, fx 0).
// ============================================================

interface YahooPoint {
  date: string; // YYYY-MM-DD (fecha local del server)
  close: number;
}

/**
 * Serie diaria de cierre del símbolo de Yahoo (range=1y, interval=1d).
 * Nunca lanza: si Yahoo falla (401/429/red) devuelve [] para que el
 * reporte se degrade (benchmark plano, fx 0) en lugar de romper.
 */
export async function fetchYahooDaily(symbol: string): Promise<YahooPoint[]> {
  const result = await fetchChart(symbol);
  if (result.status !== "ok" || !result.data) return [];

  const { dates, closes } = result.data;
  const points: YahooPoint[] = [];
  for (let i = 0; i < dates.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    points.push({ date: dates[i], close });
  }
  return points;
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
// SNAPSHOT SYNC — un snapshot por día ART por cuenta
// ============================================================

export type SnapshotSource = "real" | "reconstructed";

/**
 * Inserta el snapshot del día si todavía no existe para la cuenta,
 * junto con la composición (snapshot_positions) del portafolio.
 * Idempotente por construcción: capturedAt = medianoche ART del día
 * (artStartOfDay), con ON CONFLICT DO NOTHING contra el
 * unique(account_id, captured_at). El primero del día vale.
 *
 * source: 'real' (captura IOL/cron) por defecto; 'reconstructed'
 * (backfill) lo pasa el backfillService.
 */
export async function saveDailySnapshot(
  accountId: string,
  portfolio: PortfolioSummary,
  opts: { source?: SnapshotSource } = {}
): Promise<boolean> {
  const source = opts.source ?? "real";
  const todayStart = artStartOfDay(new Date());
  const tomorrow = addArtDays(todayStart, 1);

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

  const [inserted] = await db
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
      source,
      capturedAt: todayStart,
    })
    .onConflictDoNothing()
    .returning({ id: schema.portfolioSnapshots.id });

  if (!inserted) return false;

  // Composición del día — la materia prima de la contribución por activo
  if (portfolio.positions.length > 0) {
    await db
      .insert(schema.snapshotPositions)
      .values(
        portfolio.positions.map((p) => ({
          snapshotId: inserted.id,
          symbol: p.symbol,
          market: p.market,
          assetType: p.assetType,
          quantity: String(p.quantity),
          avgPrice: p.avgPrice != null ? String(p.avgPrice) : null,
          lastPrice: p.lastPrice != null ? String(p.lastPrice) : null,
          totalValue: String(p.totalValue),
          currency: p.currency,
        }))
      )
      .onConflictDoNothing();
  }

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
    const monthStart = startOfMonthArt(monthKey);

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

  const monthStart = startOfMonthArt(month);
  const monthEnd = startOfMonthArt(shiftMonthKey(month, 1));
  const prevMonthStart = startOfMonthArt(shiftMonthKey(month, -1));

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
    const point = { date: artDateKeyFromUtc(monthSnaps[i].capturedAt), pct };
    if (!bestDay || pct > bestDay.pct) bestDay = point;
    if (!worstDay || pct < worstDay.pct) worstDay = point;
  }

  // ---- Benchmark (Merval) y FX (dólar oficial) desde Yahoo ----
  const [merval, fx] = await Promise.all([fetchYahooDaily(MERVAL_SYMBOL), fetchYahooDaily(FX_SYMBOL)]);

  // Series: valor diario + benchmark normalizado a base 1000
  const firstDate = artDateKeyFromUtc(firstSnap.capturedAt);
  const lastDate = artDateKeyFromUtc(lastSnap.capturedAt);
  const mervalBase = closeNearest(merval, firstDate);

  let mervalCarry: number | null = null;
  const series = monthSnaps.map((s) => {
    const date = artDateKeyFromUtc(s.capturedAt);
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
  const prevDayKey = artDateKeyFromUtc(addArtDays(monthStart, -1));
  const mervalStart = closeOnOrBefore(merval, prevDayKey);
  const mervalEnd = closeOnOrBefore(merval, lastDate);
  const benchmarkPct = pctBetween(mervalStart, mervalEnd);

  // Variación % del dólar oficial en el mismo rango
  const fxStart = closeOnOrBefore(fx, prevDayKey);
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

// ============================================================
// MONTH CALENDAR — grid mensual con datos honestos por día
// (F2, contrato GET /api/portfolio/calendar/:month)
//
// Puro: recibe los snapshots del mes y el conteo de movimientos
// por día (Map dateKey → count); no toca la BD.
// TODOS los días del mes salen en `days`; los que no tienen
// snapshot quedan con campos null — NUNCA inventar datos
// (F1-R4/F2-R3). dayChangePct viene del snapshot almacenado
// (misma lectura que /series); bestDay/worstDay usan la misma
// variación día a día que buildMonthlyReport.
// ============================================================

export interface CalendarDayData {
  date: string; // YYYY-MM-DD
  totalValue: number | null;
  dayChangePct: number | null;
  source: SnapshotSource | null;
  cashArs: number | null;
  cashUsd: number | null;
  movementCount: number;
}

export interface MonthCalendar {
  month: string;
  days: CalendarDayData[];
  bestDay: { date: string; pct: number } | null;
  worstDay: { date: string; pct: number } | null;
  monthReturn: number | null;
}

/** Cantidad de días del mes "YYYY-MM" (1-31). */
function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  // día 0 del mes siguiente = último día del mes pedido
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

export function buildMonthCalendar(
  month: string,
  snapshots: SnapshotRow[],
  movementCountByDate: Map<string, number> = new Map()
): MonthCalendar {
  const byDate = new Map(snapshots.map((s) => [artDateKeyFromUtc(s.capturedAt), s]));

  const days: CalendarDayData[] = [];
  for (let day = 1; day <= daysInMonth(month); day++) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const snap = byDate.get(date);
    days.push({
      date,
      totalValue: snap != null ? snapNumber(snap, "totalValue") : null,
      dayChangePct: snap != null ? snapNumber(snap, "dayChangePct") : null,
      source: snap?.source === "real" || snap?.source === "reconstructed" ? snap.source : null,
      cashArs: snap != null ? snapNumber(snap, "cashArs") : null,
      cashUsd: snap != null ? snapNumber(snap, "cashUsd") : null,
      movementCount: movementCountByDate.get(date) ?? 0,
    });
  }

  // Mejor/peor día: variación día a día entre snapshots del mes
  // (mismo algoritmo que buildMonthlyReport, reportBuilder.ts:420)
  let bestDay: MonthCalendar["bestDay"] = null;
  let worstDay: MonthCalendar["worstDay"] = null;
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapNumber(snapshots[i - 1], "totalValue");
    const curr = snapNumber(snapshots[i], "totalValue");
    if (prev === 0) continue;
    const pct = ((curr - prev) / prev) * 100;
    const point = { date: artDateKeyFromUtc(snapshots[i].capturedAt), pct };
    if (!bestDay || pct > bestDay.pct) bestDay = point;
    if (!worstDay || pct < worstDay.pct) worstDay = point;
  }

  // Retorno del mes: primer → último snapshot (misma convención que
  // grossChangePct del reporte mensual). null si no hay 2 snapshots.
  const monthReturn =
    snapshots.length >= 2
      ? (snapNumber(snapshots[snapshots.length - 1], "totalValue") /
          snapNumber(snapshots[0], "totalValue") -
          1) *
        100
      : null;

  return { month, days, bestDay, worstDay, monthReturn };
}
