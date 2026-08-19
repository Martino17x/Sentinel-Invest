// ============================================================
// news.ts — TradingView news-headlines primario, Yahoo fallback (spec A.4)
// TTL 15min, SwrCache keys `news:{tv}` y `newsfeed:{limit}`
// Exports: getNews(symbol, market?, signal?), getNewsById(id, signal?),
//          fetchNewsFeed(limit?, signal?), getNewsFeed alias
// Nunca lanza: cualquier fallo → {status:"down"|"rate_limited"|"symbol_not_found", data:null}
// ============================================================

import { resolveAnalysisSymbols } from "./symbol.js";
import { fetchJson } from "./http.js";
import { SwrCache } from "../market/cache.js";
import type { AnalysisEnvelope, NewsData, NewsItem, AnalysisMarket, AnalysisOpts } from "./types.js";

const TTL_MS = 15 * 60 * 1000; // 15min canónico spec 0.3

const perSymbolCache = new SwrCache<NewsItem[]>(TTL_MS);
const feedCache = new SwrCache<NewsItem[]>(TTL_MS);

export function resetNewsCache(): void {
  perSymbolCache.resetForTests();
  feedCache.resetForTests();
}

// TradingView headlines endpoint — verified NEWS_API.md
// GET https://news-headlines.tradingview.com/v2/headlines?client=web&lang=en&symbol=BCBA:GGAL
const TV_NEWS_BASE = "https://news-headlines.tradingview.com/v2/headlines";

function resolveArgs(
  marketOrOpts?: AnalysisMarket | AnalysisOpts,
  signal?: AbortSignal,
): { market?: AnalysisMarket; signal?: AbortSignal } {
  if (!marketOrOpts) return { signal };
  if (typeof marketOrOpts === "string") return { market: marketOrOpts as AnalysisMarket, signal };
  return {
    market: (marketOrOpts as AnalysisOpts).market,
    signal: (marketOrOpts as AnalysisOpts).signal ?? signal,
  };
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function unixToIso(unix: unknown): string | null {
  const n = numOrNull(unix);
  if (n === null || n === 0) return null;
  try {
    const d = new Date(n * 1000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

// Map TradingView headline item → NewsItem
function mapTvItem(raw: Record<string, unknown>, fallbackSymbol: string | null): NewsItem | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  if (!id || !title) return null;
  const source = typeof raw.source === "string" ? raw.source : typeof raw.provider === "string" ? String(raw.provider) : "tradingview";
  const url = typeof raw.link === "string" ? raw.link : typeof raw.url === "string" ? String(raw.url) : "";
  // published is unix int seconds
  const publishedAt = unixToIso(raw.published) ?? (typeof raw.publishedAt === "string" ? String(raw.publishedAt) : null);
  // relatedSymbols may contain the tv symbol
  let symbol: string | null = fallbackSymbol;
  if (Array.isArray(raw.relatedSymbols) && raw.relatedSymbols.length > 0) {
    const first = raw.relatedSymbols[0] as Record<string, unknown>;
    if (first && typeof first.symbol === "string") symbol = String(first.symbol);
  }
  const summary = typeof raw.summary === "string" ? String(raw.summary) : null;
  return {
    id,
    title,
    source,
    url: url || `https://www.tradingview.com/news/${encodeURIComponent(id)}/`,
    publishedAt,
    symbol,
    summary,
  };
}

// Map Yahoo search news item → NewsItem
function mapYahooItem(raw: Record<string, unknown>, fallbackSymbol: string | null): NewsItem | null {
  const id = typeof raw.uuid === "string" ? raw.uuid : typeof raw.id === "string" ? String(raw.id) : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  if (!id || !title) return null;
  const source = typeof raw.publisher === "string" ? raw.publisher : typeof raw.provider === "string" ? String(raw.provider) : "yahoo";
  const url = typeof raw.link === "string" ? raw.link : typeof raw.url === "string" ? String(raw.url) : "";
  const publishedAt = unixToIso(raw.providerPublishTime) ?? (typeof raw.pubDate === "string" ? String(raw.pubDate) : null);
  const summary = typeof raw.summary === "string" ? String(raw.summary) : null;
  return {
    id,
    title,
    source,
    url: url || "",
    publishedAt,
    symbol: fallbackSymbol,
    summary,
  };
}

function buildTvUrl(tvSymbol?: string): string {
  const params = new URLSearchParams({ client: "web", lang: "en" });
  if (tvSymbol) params.set("symbol", tvSymbol);
  return `${TV_NEWS_BASE}?${params.toString()}`;
}

function buildYahooUrl(yahooSymbol: string): string {
  // v1/finance/search sin crumb, solo User-Agent — newsCount 10
  return `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(yahooSymbol)}&quotesCount=0&newsCount=10`;
}

async function fetchTvHeadlines(tvSymbol: string | undefined, signal?: AbortSignal): Promise<{ items: NewsItem[]; status: number } | null> {
  const url = buildTvUrl(tvSymbol);
  let res: { status: number; json: unknown };
  try {
    res = await fetchJson(url, { signal });
  } catch {
    return null;
  }
  if (res.status === 429) return { items: [], status: 429 };
  if (res.status === 0) return null;
  if (res.status >= 400) return null;
  const json = res.json as Record<string, unknown> | null;
  const itemsRaw = (json?.items ?? (json as Record<string, unknown> | null)?.data) as unknown;
  const arr = Array.isArray(itemsRaw) ? itemsRaw : [];
  // fallbackSymbol for per-symbol call
  const fallback = tvSymbol ?? null;
  const mapped: NewsItem[] = [];
  for (const raw of arr) {
    const item = mapTvItem(raw as Record<string, unknown>, fallback);
    if (item) mapped.push(item);
  }
  return { items: mapped, status: res.status };
}

async function fetchYahooNews(yahooSymbol: string, tvSymbol: string | null, signal?: AbortSignal): Promise<NewsItem[] | null> {
  const url = buildYahooUrl(yahooSymbol);
  let res: { status: number; json: unknown };
  try {
    res = await fetchJson(url, { signal });
  } catch {
    return null;
  }
  if (res.status !== 200) return null;
  const json = res.json as Record<string, unknown> | null;
  const newsRaw = (json?.news ?? json?.items) as unknown;
  const arr = Array.isArray(newsRaw) ? newsRaw : [];
  const mapped: NewsItem[] = [];
  for (const raw of arr) {
    const item = mapYahooItem(raw as Record<string, unknown>, tvSymbol);
    if (item) mapped.push(item);
  }
  return mapped;
}

/**
 * Noticias por símbolo — TradingView primario, Yahoo fallback.
 */
export async function getNews(
  symbol: string,
  marketOrOpts?: AnalysisMarket | AnalysisOpts,
  signal?: AbortSignal,
): Promise<AnalysisEnvelope<NewsData>> {
  const { market, signal: resolvedSignal } = resolveArgs(marketOrOpts, signal);
  const { tv, yahoo } = resolveAnalysisSymbols(symbol, market);
  const key = `news:${tv}`;

  const entry = perSymbolCache.getEntry(key);
  if (entry && perSymbolCache.isFresh(entry)) {
    return { status: "ok", data: { source: "tradingview", items: entry.data }, cached: true, source: "tradingview" };
  }

  // 1. TradingView attempt
  const tvResult = await fetchTvHeadlines(tv, resolvedSignal);
  if (tvResult) {
    if (tvResult.status === 429) {
      return { status: "rate_limited", data: null, cached: false, source: "tradingview", error: "Rate limit" };
    }
    if (tvResult.items.length > 0) {
      const slice = tvResult.items.slice(0, 20);
      perSymbolCache.set(key, slice);
      return { status: "ok", data: { source: "tradingview", items: slice }, cached: false, source: "tradingview" };
    }
    // tvResult empty → fallback to Yahoo (stocks chicos have 0-1 items)
  } else {
    // network failure tvResult null → also fallback
  }

  // 2. Yahoo fallback
  const yahooItems = await fetchYahooNews(yahoo, tv, resolvedSignal);
  if (yahooItems && yahooItems.length > 0) {
    const slice = yahooItems.slice(0, 20);
    perSymbolCache.set(key, slice);
    return { status: "ok", data: { source: "yahoo", items: slice }, cached: false, source: "yahoo" };
  }

  // If TV returned error status but not 429 and no items, and Yahoo also empty → check if TV was network down
  if (tvResult === null && (yahooItems === null || yahooItems?.length === 0)) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }

  // Both empty but no network error → return ok with empty? spec says NewsData with empty items is ok but for per-symbol empty should we return down?
  // Spec: getNews returns NewsData with items [] if no news. But for error handling we map empty fallback to down only if both sources truly down.
  // If both returned empty arrays (no crash), return ok with empty.
  if (yahooItems !== null) {
    // yahoo returned empty array → no news for this symbol → ok empty
    const empty: NewsItem[] = [];
    perSymbolCache.set(key, empty);
    return { status: "ok", data: { source: "yahoo", items: empty }, cached: false, source: "yahoo" };
  }

  return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
}

/**
 * Feed global de noticias — top `limit` (default 5). Degrada a [].
 * Cache 15min key `newsfeed:{limit}`.
 */
export async function fetchNewsFeed(limit: number = 5, signal?: AbortSignal): Promise<NewsItem[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 5, 1), 20);
  const key = `newsfeed:${safeLimit}`;

  const entry = feedCache.getEntry(key);
  if (entry && feedCache.isFresh(entry)) {
    return entry.data;
  }

  const tvResult = await fetchTvHeadlines(undefined, signal);
  if (tvResult && tvResult.status !== 429 && tvResult.items.length > 0) {
    const slice = tvResult.items.slice(0, safeLimit);
    feedCache.set(key, slice);
    // also populate individual feed caches for other limits? keep only this limit
    return slice;
  }

  // TV empty or failed → try Yahoo global search? For global feed, Yahoo has no global news without symbol, so just return TV slice or []
  if (tvResult && tvResult.items.length === 0) {
    const empty: NewsItem[] = [];
    feedCache.set(key, empty);
    return empty;
  }

  // If TV failed, return cached stale if exists, else []
  if (entry) return entry.data;
  return [];
}

// Alias requerido por prompt
export const getNewsFeed = fetchNewsFeed;

/**
 * Detalle de noticia por id — busca en feeds cacheadas (5|10|20) o refetch top 20.
 * ID puede contener "/" y ":" — comparar exacto.
 * No inventar body (no GET /v2/story?id=). Inexistente → symbol_not_found.
 */
export async function getNewsById(
  id: string,
  signal?: AbortSignal,
): Promise<AnalysisEnvelope<NewsItem>> {
  const decodedId = (() => {
    try {
      return decodeURIComponent(id);
    } catch {
      return id;
    }
  })();

  // 1. Search existing feed caches 5|10|20 without network
  for (const lim of [5, 10, 20]) {
    const entry = feedCache.getEntry(`newsfeed:${lim}`);
    if (entry) {
      const found = entry.data.find((it) => it.id === decodedId || it.id === id);
      if (found) return { status: "ok", data: found, cached: true, source: "tradingview" };
    }
  }

  // Search per-symbol caches
  // iterate over perSymbolCache store via getEntry is private, so we try refetch instead
  // Instead, try fetchNewsFeed(20) which will hit cache if fresh or refetch
  const feed = await fetchNewsFeed(20, signal);
  const found = feed.find((it) => it.id === decodedId || it.id === id);
  if (found) {
    // if feed came from cache, mark cached true
    const entry20 = feedCache.getEntry("newsfeed:20");
    const isCached = entry20 ? feedCache.isFresh(entry20) : false;
    // fetchNewsFeed already handles cache freshness, but we approximate
    return { status: "ok", data: found, cached: isCached, source: "tradingview" };
  }

  // Also try per-symbol caches via attempting to search if any news:{tv} entry contains id
  // We can't enumerate cache keys generically without exposing store, so we rely on feed only.
  // If still not found → not found
  return { status: "symbol_not_found", data: null, cached: false, source: "tradingview", error: "Noticia no encontrada" };
}
