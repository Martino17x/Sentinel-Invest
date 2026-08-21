/**
 * Radar CEDEAR CCL implícito — orquestador on-demand + SWR.
 *
 * Flujo:
 *  1. BYMA postPanel("cedears") — único fetch (BymaDataProvider)
 *  2. Join con cedear-ratios.ts (ratio entero >0) — filtra lastPrice>0
 *     y ratio existente; USD C/D → ccl:null (excluido de promedio)
 *  3a. Modo híbrido (nuevo): si existe par ARS/USD en BYMA para el mismo
 *      base (ej. AAPL en ARS y AAPLD en USD, denominationCcy USD), el CCL
 *      se calcula directo sin Yahoo:  ccl = CEDEAR_ARS / CEDEAR_USD
 *      (ratio se cancela). Preferido por ser 100% BYMA y sin dependencia
 *      externa. Ver `ccl.ts:calcCclFromBymaUsd`.
 *  3b. Fallback Yahoo: solo para bases sin par USD en BYMA →
 *      Bulk fetchChart(yahooSymbol,"1d") con p-limit 6 + allSettled
 *      y fórmula  ccl = ARS * ratio / USD
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
import { calcCcl, calcCclFromBymaUsd, calcPromedio, calcSpread } from "./ccl.js";
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
  /** Origen del CCL: 'byma_usd' = CEDEAR ARS / CEDEAR USD (BYMA 100%), 'yahoo' = ARS*ratio/USD (Yahoo) */
  cclSource?: "byma_usd" | "yahoo" | null;
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

export type RadarSource = "all" | "byma_usd" | "yahoo";

function applyFilterSortPaginate(
  allItems: RadarRow[],
  opts: { q?: string; page: number; limit: number; sort: "spread" | "symbol"; source?: RadarSource },
  meta: { generatedAt: string; cclPromedio: number | null; isMarketClosed: boolean; status: "ok" | "partial" },
): CclResponse {
  const q = opts.q?.trim().toUpperCase();
  let filtered = q
    ? allItems.filter(
        (r) => r.symbol.toUpperCase().includes(q) || r.name.toUpperCase().includes(q),
      )
    : [...allItems];

  // Fuente CCL: byma_usd = CEDEAR ARS/USD directo BYMA, yahoo = ARS*ratio/USD Yahoo
  if (opts.source === "byma_usd") {
    filtered = filtered.filter((r) => r.cclSource === "byma_usd");
  } else if (opts.source === "yahoo") {
    filtered = filtered.filter((r) => r.cclSource === "yahoo");
  }

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
      cclSource: null,
    }));

  const arsQuotes = validQuotes.filter((q) => !q.isUsd);

  // --- Modo híbrido: mapa base -> precio CEDEAR USD (BYMA) ---
  // Si existe el mismo CEDEAR en USD (ej. AAPLD con denominationCcy USD para base AAPL),
  // preferimos CCL directo BYMA:  ccl = ARS / USD  (ratio se cancela).
  // Esto evita Yahoo y es la forma que el usuario esperaba intuitivamente.
  function getBase(sym: string): string {
    if ((sym.endsWith("C") || sym.endsWith("D")) && RATIO_MAP.has(sym.slice(0, -1))) {
      return sym.slice(0, -1);
    }
    return sym;
  }
  const usdPriceByBase = new Map<string, number>();
  for (const q of validQuotes.filter((q) => q.isUsd)) {
    const base = getBase(q.symbol);
    // Si hay duplicado (C y D), quedarse con el primero con precio >0
    if (!usdPriceByBase.has(base) && Number.isFinite(q.lastPrice) && q.lastPrice > 0) {
      usdPriceByBase.set(base, q.lastPrice);
    }
  }

  // Partición: con par BYMA USD vs sin par (requiere Yahoo)
  const bymaDirectQuotes: typeof arsQuotes = [];
  const yahooNeededQuotes: typeof arsQuotes = [];
  for (const q of arsQuotes) {
    const base = getBase(q.symbol);
    if (usdPriceByBase.has(base)) bymaDirectQuotes.push(q);
    else yahooNeededQuotes.push(q);
  }

  const cclValues: number[] = [];
  const arsRows: RadarRow[] = [];
  let hasPartial = false;

  // 1) BYMA directo — sin Yahoo
  for (const q of bymaDirectQuotes) {
    const base = getBase(q.symbol);
    const cedearUsd = usdPriceByBase.get(base)!;
    const ccl = calcCclFromBymaUsd(q.lastPrice, cedearUsd);
    // underlyingPrice sintético para la columna "Precio US": cedearUsd * ratio
    const underlyingPrice = cedearUsd * q.ratio;
    if (ccl != null) cclValues.push(ccl);
    arsRows.push({
      symbol: q.symbol,
      name: q.name,
      yahooSymbol: q.yahooSymbol,
      cedearPrice: q.lastPrice,
      underlyingPrice,
      ratio: q.ratio,
      currency: "ARS",
      ccl,
      spreadVsAvg: null,
      status: "ok",
      lastCloseDate: null,
      stale: false,
      cclSource: "byma_usd",
    });
  }

  // 2) Fallback Yahoo — solo para los que no tienen par USD en BYMA
  const limit = pLimit(6);
  const chartResults = await Promise.allSettled(
    yahooNeededQuotes.map((q) =>
      limit(async () => {
        const res = await fetchChart(q.yahooSymbol, "1d", signal);
        return { q, res };
      }),
    ),
  );

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
      cclSource: ccl != null ? "yahoo" : null,
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
      // No pisar cache válido con snapshot vacío fuera de horario
      const existing = baseCache.getEntry(key);
      if (base.allItems.length === 0 && existing && existing.data.allItems.length > 0) {
        return;
      }
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
  source?: RadarSource;
  signal?: AbortSignal;
}): Promise<CclResponse> {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 50));
  const sort = opts.sort === "symbol" ? "symbol" : "spread";
  const q = opts.q?.trim() || undefined;
  const source: RadarSource = opts.source === "byma_usd" || opts.source === "yahoo" ? opts.source : "all";

  const entry = baseCache.getEntry(CACHE_KEY);

  if (entry) {
    if (baseCache.isFresh(entry)) {
      return applyFilterSortPaginate(entry.data.allItems, { q, page, limit, sort, source }, entry.data);
    }
    // Stale-while-revalidate: serve stale immediately + refresh in background
    refreshInBackground(opts.signal);
    return applyFilterSortPaginate(entry.data.allItems, { q, page, limit, sort, source }, entry.data);
  }

  // Cache miss — check dedup
  const existing = inFlight.get(CACHE_KEY);
  if (existing) {
    const base = await existing;
    return applyFilterSortPaginate(base.allItems, { q, page, limit, sort, source }, base);
  }

  const promise = fetchRadarBase(opts.signal);
  inFlight.set(CACHE_KEY, promise);
  try {
    const base = await promise;
    // Mercado cerrado que devuelve panel vacío: servir stale si existe antes de cachear vacío
    if (base.allItems.length === 0) {
      const staleEntry = baseCache.getEntry(CACHE_KEY);
      if (staleEntry && staleEntry.data.allItems.length > 0) {
        return applyFilterSortPaginate(staleEntry.data.allItems, { q, page, limit, sort, source }, staleEntry.data);
      }
      const legacyStale = radarCache.getEntry(CACHE_KEY);
      if (legacyStale && legacyStale.data.items.length > 0) {
        return legacyStale.data;
      }
    }
    baseCache.set(CACHE_KEY, base);
    const defaultResponse = applyFilterSortPaginate(base.allItems, { page: 1, limit: 50, sort: "spread" }, base);
    radarCache.set(CACHE_KEY, defaultResponse);
    return applyFilterSortPaginate(base.allItems, { q, page, limit, sort, source }, base);
  } catch (err) {
    // On network failure, try serve stale if exists (even if expired) — mercado cerrado gracefully
    const staleEntry = baseCache.getEntry(CACHE_KEY);
    if (staleEntry) {
      return applyFilterSortPaginate(staleEntry.data.allItems, { q, page, limit, sort, source }, staleEntry.data);
    }
    // Also try legacy radarCache
    const legacyStale = radarCache.getEntry(CACHE_KEY);
    if (legacyStale) {
      return legacyStale.data;
    }
    // Sin cache y mercado cerrado → 200 vacío con mensaje honesto, no 404/502
    if (!isMarketHours(new Date())) {
      return {
        status: "ok",
        generatedAt: new Date().toISOString(),
        cclPromedio: null,
        disclaimer: DISCLAIMER,
        isMarketClosed: true,
        items: [],
        total: 0,
        page,
        limit,
      };
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
