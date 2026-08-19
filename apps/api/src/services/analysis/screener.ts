// ============================================================
// screener.ts — TradingView scanner (spec A.5)
// TTL 15min, SwrCache key `screener:{market}` (bcba|us)
// GET via POST https://scanner.tradingview.com/{argentina|america}/scan
// columns: name, description, close, change, volume, market_cap_basic, price_earnings_ttm
// (spec 0.3: 6 cols name/close/change/volume/market_cap_basic/pe — we add description for name)
// Nunca lanza: cualquier fallo → {status:"down"|"rate_limited", data:null}
// ============================================================

import { fetchJson } from "./http.js";
import { SwrCache } from "../market/cache.js";
import type { AnalysisEnvelope, ScreenerRow } from "./types.js";

const TTL_MS = 15 * 60 * 1000; // 15min canónico

const cache = new SwrCache<ScreenerRow[]>(TTL_MS);

export function resetScreenerCache(): void {
  cache.resetForTests();
}

// Column order must match server response d[] ordering
// We request 7 columns: name (symbol BCBA:GGAL), description (human name), close, change, volume, market_cap_basic, price_earnings_ttm
const SCREENER_COLUMNS = [
  "name",
  "description",
  "close",
  "change",
  "volume",
  "market_cap_basic",
  "price_earnings_ttm",
] as const;

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function strOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function marketToScanner(market: string): { path: string; normalized: "bcba" | "us" } {
  const m = market.toLowerCase();
  if (m === "bcba" || m === "argentina") return { path: "argentina", normalized: "bcba" };
  if (m === "us" || m === "america") return { path: "america", normalized: "us" };
  throw new Error(`Mercado inválido: ${market}`);
}

interface ScannerResponse {
  totalCount?: number;
  data?: Array<{ s?: string; d?: unknown[] }>;
}

/**
 * Screener TradingView.
 * @param market - "bcba"|"us" (también acepta "argentina"/"america")
 * @param queryOrOpts - opcional: string de búsqueda client-side o {signal, query}
 * @param signal - AbortSignal opcional si segundo arg es string
 */
export async function getScreener(
  market: string = "bcba",
  queryOrOpts?: string | { signal?: AbortSignal; query?: string },
  signal?: AbortSignal,
): Promise<AnalysisEnvelope<ScreenerRow[]>> {
  let query: string | undefined;
  let resolvedSignal: AbortSignal | undefined = signal;

  if (typeof queryOrOpts === "string") {
    query = queryOrOpts;
  } else if (queryOrOpts && typeof queryOrOpts === "object") {
    query = (queryOrOpts as { query?: string }).query;
    resolvedSignal = (queryOrOpts as { signal?: AbortSignal }).signal ?? signal;
  }

  const { path, normalized } = marketToScanner(market);
  const key = `screener:${normalized}`;

  const entry = cache.getEntry(key);
  if (entry && cache.isFresh(entry)) {
    const rows = entry.data;
    const filtered = query ? filterRows(rows, query) : rows;
    return { status: "ok", data: filtered, cached: true, source: "tradingview" };
  }

  const url = `https://scanner.tradingview.com/${path}/scan`;

  const payload = JSON.stringify({
    columns: [...SCREENER_COLUMNS],
    range: [0, 150],
  });

  let res: { status: number; json: unknown };
  try {
    res = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: resolvedSignal,
    });
  } catch {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }

  if (res.status === 429) {
    return { status: "rate_limited", data: null, cached: false, source: "tradingview", error: "Rate limit" };
  }
  if (res.status === 0) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }
  if (res.status >= 400) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }

  const json = res.json as ScannerResponse | null;
  if (!json || !Array.isArray(json.data) || json.data.length === 0) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }

  const rows: ScreenerRow[] = [];
  for (const row of json.data) {
    const d = row.d as unknown[] | undefined;
    if (!d || d.length === 0) continue;
    // Support both 6-col (no description) and 7-col payloads
    // If d length == SCREENER_COLUMNS.length (7): mapping as defined
    // If d length == 6 (spec literal): d[0]=name, d[1]=close, etc. (no description → name null)
    let symbol: string | null = null;
    let name: string | null = null;
    let price: number | null = null;
    let changePct: number | null = null;
    let volume: number | null = null;
    let marketCap: number | null = null;
    let pe: number | null = null;

    if (d.length >= 7) {
      symbol = strOrNull(d[0]);
      name = strOrNull(d[1]);
      price = numOrNull(d[2]);
      changePct = numOrNull(d[3]);
      volume = numOrNull(d[4]);
      marketCap = numOrNull(d[5]);
      pe = numOrNull(d[6]);
    } else if (d.length === 6) {
      symbol = strOrNull(d[0]);
      name = null;
      price = numOrNull(d[1]);
      changePct = numOrNull(d[2]);
      volume = numOrNull(d[3]);
      marketCap = numOrNull(d[4]);
      pe = numOrNull(d[5]);
    } else {
      // unexpected length — try best effort: d[0]=symbol, rest map sequentially
      symbol = strOrNull(d[0]);
      name = d.length > 1 ? strOrNull(d[1]) : null;
      // if length >2, remaining map with offset
      continue;
    }

    // symbol may be "BCBA:GGAL" — keep as is, but also store without prefix for display?
    // Keep raw as symbol per spec (screenerRow.symbol is BCBA:GGAL style)
    rows.push({
      symbol: symbol ?? "",
      name,
      market: normalized,
      price,
      changePct,
      volume,
      marketCap,
      pe,
    });
  }

  if (rows.length === 0) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }

  cache.set(key, rows);

  const filtered = query ? filterRows(rows, query) : rows;
  return { status: "ok", data: filtered, cached: false, source: "tradingview" };
}

function filterRows(rows: ScreenerRow[], q: string): ScreenerRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) => r.symbol.toLowerCase().includes(needle) || (r.name ?? "").toLowerCase().includes(needle),
  );
}

// Alias opcional — por si callers usan fetchScreener
export const fetchScreener = getScreener;
