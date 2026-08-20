/**
 * Radar CEDEAR CCL implícito — orquestador on-demand + SWR.
 *
 * Flujo:
 *  1. BYMA postPanel("cedears") — único fetch (BymaDataProvider)
 *  2. Join con cedear-ratios.ts (ratio entero >0) — filtra lastPrice>0
 *     y ratio existente; USD C/D → ccl:null (excluido de promedio)
 *  3. Bulk Yahoo fetchChart(yahooSymbol,"1d") con p-limit 6 + allSettled
 *  4. calcCcl per row → median promedio → calcSpread
 *  5. SwrCache<CclResponse> TTL 15min, stale-serve + dedup refresh
 *
 * Pure calc en ccl.ts; I/O acá.
 */

import pLimit from "p-limit";
import { SwrCache } from "./cache.js";
import { BymaDataProvider } from "../iol/BymaDataProvider.js";
import { fetchChart } from "./yahoo.js";
import { CEDEAR_RATIOS, RATIO_MAP } from "./cedear-ratios.js";
import { calcCcl, calcPromedio, calcSpread } from "./ccl.js";
import { isMarketHours } from "./isMarketHours.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const DISCLAIMER =
  "Información educativa, no asesoramiento financiero. No constituye recomendación CNV.";

export interface RadarRow {
  symbol: string;
  name: string;
  yahooSymbol: string;
  cedearPrice: number;
  underlyingPrice: number | null;
  ratio: number;
  currency: "ARS" | "USD";
  ccl: number | null;
  spreadVsAvg: number | null;
  status: "ok" | "symbol_not_found" | "rate_limited" | "down";
  lastCloseDate: string | null;
  stale: boolean;
}

export interface CclResponse {
  status: "ok" | "partial";
  generatedAt: string;
  cclPromedio: number | null;
  disclaimer: string;
  isMarketClosed: boolean;
  items: RadarRow[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Cache + dedup
// ---------------------------------------------------------------------------

const RADAR_TTL_MS = 15 * 60 * 1000;
const CACHE_KEY = "radar:ccl:v1";

export const radarCache = new SwrCache<CclResponse>(RADAR_TTL_MS);

/** Raw dataset cache (full unpaginated items) — SwrCache wraps CclResponse with full items */
interface RadarBase {
  generatedAt: string;
  cclPromedio: number | null;
  disclaimer: string;
  isMarketClosed: boolean;
  allItems: RadarRow[];
  status: "ok" | "partial";
}

const baseCache = new SwrCache<RadarBase>(RADAR_TTL_MS);
const inFlight = new Map<string, Promise<RadarBase>>();
const bgInFlight = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUsdVariant(symbol: string, currency: string): boolean {
  if (currency === "USD") return true;
  // Sufijo C/D: ej. AAPLC / AAPLD → base existe en RATIO_MAP
  if (symbol.length > 1 && (symbol.endsWith("C") || symbol.endsWith("D"))) {
    const base = symbol.slice(0, -1);
    if (RATIO_MAP.has(base)) return true;
  }
  return false;
}

function mapChartStatusToRowStatus(
  s: "ok" | "symbol_not_found" | "rate_limited" | "down",
): RadarRow["status"] {
  return s;
}

function sortRows(rows: RadarRow[], sort: "spread" | "symbol"): RadarRow[] {
  if (sort === "symbol") {
    return [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
  }
  // spread desc: nulls al final, luego mayor spread primero
  return [...rows].sort((a, b) => {
    if (a.spreadVsAvg == null && b.spreadVsAvg == null) return 0;
    if (a.spreadVsAvg == null) return 1;
    if (b.spreadVsAvg == null) return -1;
    return b.spreadVsAvg - a.spreadVsAvg;
  });
}

function applyFilterSortPaginate(
  allItems: RadarRow[],
  opts: { q?: string; page: number; limit: number; sort: "spread" | "symbol" },
  meta: { generatedAt: string; cclPromedio: number | null; isMarketClosed: boolean; status: "ok" | "partial" },
): CclResponse {
  const q = opts.q?.trim().toUpperCase();
  const filtered = q
    ? allItems.filter(
        (r) => r.symbol.toUpperCase().includes(q) || r.name.toUpperCase().includes(q),
      )
    : allItems;

  const sorted = sortRows(filtered, opts.sort);
  const total = sorted.length;
  const start = (opts.page - 1) * opts.limit;
  const items = sorted.slice(start, start + opts.limit);

  return {
    status: meta.status,
    generatedAt: meta.generatedAt,
    cclPromedio: meta.cclPromedio,
    disclaimer: DISCLAIMER,
    isMarketClosed: meta.isMarketClosed,
    items,
    total,
    page: opts.page,
    limit: opts.limit,
  };
}

// ---------------------------------------------------------------------------
// Core fetch — build base dataset (no pagination)
// ---------------------------------------------------------------------------

async function fetchRadarBase(signal?: AbortSignal): Promise<RadarBase> {
  const provider = new BymaDataProvider();

  // BYMA panel cedears — postPanel es privado; usamos getPanel con pageSize grande
  // getPanel ya filtra lastPrice>0 y pagina localmente; tomamos todo
  const panel = await provider.getPanel(
    { id: "", email: "" } as never,
    "bcba",
    "cedear",
    1,
    1000,
    undefined,
  );

  const quotes = panel.quotes as Array<{
    symbol: string;
    name: string;
    lastPrice: number;
    currency: string;
  }>;

  // Build lookup for valid rows (ratio exists, lastPrice>0)
  type ValidQuote = (typeof quotes)[number] & { ratio: number; yahooSymbol: string; isUsd: boolean };
  const validQuotes: ValidQuote[] = [];

  for (const q of quotes) {
    const sym = q.symbol.toUpperCase();
    // Buscar ratio directo o base sin C/D
    let ratioEntry = RATIO_MAP.get(sym);
    if (!ratioEntry && (sym.endsWith("C") || sym.endsWith("D"))) {
      ratioEntry = RATIO_MAP.get(sym.slice(0, -1));
    }
    if (!ratioEntry) continue;
    if (q.lastPrice <= 0) continue;
    // USD / C/D → ccl null, sin Yahoo
    const isUsd = isUsdVariant(sym, q.currency as string);
    validQuotes.push({
      ...q,
      symbol: sym,
      ratio: ratioEntry.ratioCedearsPerShare,
      yahooSymbol: ratioEntry.yahooSymbol,
      isUsd,
    });
  }

  // Para filas USD/C/D no hacemos Yahoo — filas directas con ccl null
  const usdRows: RadarRow[] = validQuotes
    .filter((q) => q.isUsd)
    .map((q) => ({
      symbol: q.symbol,
      name: q.name,
      yahooSymbol: q.yahooSymbol,
      cedearPrice: q.lastPrice,
      underlyingPrice: null,
      ratio: q.ratio,
      currency: q.currency as "ARS" | "USD",
      ccl: null,
      spreadVsAvg: null,
      status: "ok" as const,
      lastCloseDate: null,
      stale: false,
    }));

  const arsQuotes = validQuotes.filter((q) => !q.isUsd);

  // Bulk Yahoo with p-limit 6
  const limit = pLimit(6);
  const chartResults = await Promise.allSettled(
    arsQuotes.map((q) =>
      limit(async () => {
        const res = await fetchChart(q.yahooSymbol, "1d", signal);
        return { q, res };
      }),
    ),
  );

  const cclValues: number[] = [];
  const arsRows: RadarRow[] = [];
  let hasPartial = false;

  for (const settled of chartResults) {
    if (settled.status === "rejected") {
      hasPartial = true;
      continue;
    }
    const { q, res } = settled.value;
    let underlyingPrice: number | null = null;
    let lastCloseDate: string | null = null;
    let stale = false;
    let rowStatus: RadarRow["status"] = "ok";
    let ccl: number | null = null;

    if (res.status === "ok" && res.data) {
      const closes = res.data.closes;
      const dates = res.data.dates;
      underlyingPrice =
        res.data.meta.regularMarketPrice ??
        (closes.length > 0 ? closes[closes.length - 1] : null);
      lastCloseDate = dates.length > 0 ? dates[dates.length - 1] : null;
      stale = res.stale === true;
      if (underlyingPrice != null && Number.isFinite(underlyingPrice) && underlyingPrice > 0) {
        ccl = calcCcl(q.lastPrice, underlyingPrice, q.ratio);
      }
      if (res.status !== "ok") rowStatus = mapChartStatusToRowStatus(res.status);
      // Chart ok but ccl null (edge) → still ok status
      if (ccl != null) cclValues.push(ccl);
      if (stale) hasPartial = false; // stale is not partial, just degraded
    } else {
      // symbol_not_found / rate_limited / down
      rowStatus = mapChartStatusToRowStatus(res.status as never);
      hasPartial = true;
      stale = res.stale === true;
      lastCloseDate = null;
    }

    // If res was not ok, res.data undefined → underlyingPrice stays null, ccl null
    if (res.status !== "ok") {
      rowStatus = mapChartStatusToRowStatus(res.status as never);
      hasPartial = true;
    }

    arsRows.push({
      symbol: q.symbol,
      name: q.name,
      yahooSymbol: q.yahooSymbol,
      cedearPrice: q.lastPrice,
      underlyingPrice,
      ratio: q.ratio,
      currency: "ARS",
      ccl,
      spreadVsAvg: null, // fill after promedio
      status: rowStatus,
      lastCloseDate,
      stale,
    });
  }

  const allArsWithCcl = arsRows.filter((r) => r.ccl != null).map((r) => r.ccl as number);
  const cclPromedio = calcPromedio(allArsWithCcl);
  const isMarketClosed = !isMarketHours(new Date());

  // Spread per row (only where ccl != null and promedio != null)
  const allItems: RadarRow[] = [...arsRows, ...usdRows].map((r) => {
    if (r.ccl != null && cclPromedio != null) {
      const spread = calcSpread(r.ccl, cclPromedio);
      return { ...r, spreadVsAvg: spread };
    }
    return r;
  });

  // Determine overall status: partial if any Yahoo non-ok
  const status: "ok" | "partial" = hasPartial ? "partial" : "ok";

  const base: RadarBase = {
    generatedAt: new Date().toISOString(),
    cclPromedio,
    disclaimer: DISCLAIMER,
    isMarketClosed,
    allItems,
    status,
  };

  return base;
}

function refreshInBackground(signal?: AbortSignal): void {
  const key = CACHE_KEY;
  if (inFlight.has(key) || bgInFlight.has(key)) return;
  const p = fetchRadarBase(signal)
    .then((base) => {
      baseCache.set(key, base);
      // Also update legacy radarCache for route fallback (full paginated default)
      const defaultResponse = applyFilterSortPaginate(base.allItems, { page: 1, limit: 50, sort: "spread" }, base);
      radarCache.set(key, defaultResponse);
    })
    .catch(() => {
      // keep stale
    })
    .finally(() => bgInFlight.delete(key));
  bgInFlight.set(key, p);
}

// ---------------------------------------------------------------------------
// Public orchestrator
// ---------------------------------------------------------------------------

export async function getRadar(opts: {
  q?: string;
  page: number;
  limit: number;
  sort: "spread" | "symbol";
  signal?: AbortSignal;
}): Promise<CclResponse> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 50));
  const sort = opts.sort === "symbol" ? "symbol" : "spread";
  const q = opts.q?.trim() || undefined;

  const entry = baseCache.getEntry(CACHE_KEY);

  if (entry) {
    if (baseCache.isFresh(entry)) {
      return applyFilterSortPaginate(entry.data.allItems, { q, page, limit, sort }, entry.data);
    }
    // Stale-while-revalidate: serve stale immediately + refresh in background
    refreshInBackground(opts.signal);
    return applyFilterSortPaginate(entry.data.allItems, { q, page, limit, sort }, entry.data);
  }

  // Cache miss — check dedup
  const existing = inFlight.get(CACHE_KEY);
  if (existing) {
    const base = await existing;
    return applyFilterSortPaginate(base.allItems, { q, page, limit, sort }, base);
  }

  const promise = fetchRadarBase(opts.signal);
  inFlight.set(CACHE_KEY, promise);
  try {
    const base = await promise;
    baseCache.set(CACHE_KEY, base);
    const defaultResponse = applyFilterSortPaginate(base.allItems, { page: 1, limit: 50, sort: "spread" }, base);
    radarCache.set(CACHE_KEY, defaultResponse);
    return applyFilterSortPaginate(base.allItems, { q, page, limit, sort }, base);
  } catch (err) {
    // On network failure, try serve stale if exists (even if expired)
    const stale = baseCache.get(CACHE_KEY);
    if (stale) {
      // find entry again
      const staleEntry = baseCache.getEntry(CACHE_KEY);
      if (staleEntry) {
        return applyFilterSortPaginate(staleEntry.data.allItems, { q, page, limit, sort }, staleEntry.data);
      }
    }
    // Also try legacy radarCache
    const legacyStale = radarCache.getEntry(CACHE_KEY);
    if (legacyStale) {
      // legacy is already paginated — return filtered variant via base fallback not available, so return legacy as-is
      // but need to re-apply filter — better return legacy and adjust total/items
      // For simplicity, return legacy with disclaimer
      return legacyStale.data;
    }
    throw err;
  } finally {
    inFlight.delete(CACHE_KEY);
  }
}

/** Only for tests: clear caches + inFlight */
export function resetRadarCacheForTests(): void {
  baseCache.resetForTests();
  radarCache.resetForTests();
  inFlight.clear();
  bgInFlight.clear();
}
