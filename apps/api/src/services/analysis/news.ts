// ============================================================
// news.ts — Cascade GNews → Finnhub → TradingView (content-providers)
// Batch 4: Full cascade GNews→Finnhub→TV + degraded + NEWS_PROVIDER flag
// TTL 15min legacy, V2 45min composited, GNews sub 60min (quota 100/día), Finnhub sub 45min
// Exports: getNews, fetchNewsFeed/getNewsFeed, getNewsById, resetNewsCache
//          fetchGNews, mapGNewsItem, dedupeByUrl, buildGNewsUrl, fetchFinnhub, mapFinnhubItem, shouldUseFinnhub
// Nunca lanza: cualquier fallo → degraded fallback, 429 → null sin retry
// ============================================================

import { resolveAnalysisSymbols } from "./symbol.js";
import { fetchJson } from "./http.js";
import { SwrCache } from "../market/cache.js";
import type { AnalysisEnvelope, NewsData, NewsItem, AnalysisMarket, AnalysisOpts, NewsProvider } from "./types.js";
import { INSTRUMENT_NAMES } from "../iol/instrumentNames.js";
import { isCedear } from "../market/ticker-map.js";

// ---- TTLs -------------------------------------------------------------
const TTL_MS = 15 * 60 * 1000; // legacy 15min (Batch1)
const V2_TTL_MS = 45 * 60 * 1000; // composited per-symbol 45min (design)
const GNEWS_SUB_TTL_MS = 60 * 60 * 1000; // sub-key gnews:{hash} 60min (spec vs proposal -> 60min for GNews)
const FINNHUB_SUB_TTL_MS = 45 * 60 * 1000; // finnhub sub-key 45min (30-60 window)
const FEED_V2_TTL_MS = 45 * 60 * 1000; // feed 45min GNews, 15min TV fallback (handled via same cache)

// ---- Caches -----------------------------------------------------------
const perSymbolCache = new SwrCache<NewsItem[]>(TTL_MS);
const feedCache = new SwrCache<NewsItem[]>(TTL_MS);

// V2 composited caches (Batch 3)
const perSymbolCacheV2 = new SwrCache<NewsItem[]>(V2_TTL_MS);
const feedCacheV2 = new SwrCache<NewsItem[]>(FEED_V2_TTL_MS);
// sub-caches evitan re-hit fuente fallada dentro de TTL
const gnewsCache = new SwrCache<NewsItem[] | null>(GNEWS_SUB_TTL_MS);
const finnhubCache = new SwrCache<NewsItem[] | null>(FINNHUB_SUB_TTL_MS);

export function resetNewsCache(): void {
  perSymbolCache.resetForTests();
  feedCache.resetForTests();
  perSymbolCacheV2.resetForTests();
  feedCacheV2.resetForTests();
  gnewsCache.resetForTests();
  finnhubCache.resetForTests();
}

// TradingView headlines endpoint — verified NEWS_API.md
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

// ---- Hash + query builders --------------------------------------------

function hashQuery(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function buildGNewsQuery(symbol: string, market?: string): string {
  // q = base + " " + nombre largo si existe (spec: GGAL+Grupo Financiero Galicia)
  let base = symbol.trim().toUpperCase();
  try {
    const resolved = resolveAnalysisSymbols(symbol, market as AnalysisMarket);
    base = resolved.base;
    const name = INSTRUMENT_NAMES[base];
    if (name) return `${base} ${name}`;
    return base;
  } catch {
    return base;
  }
}

function getGnewsApiKey(): string | null {
  const k = (process.env.GNEWS_API_KEY ?? "").trim();
  return k.length > 0 ? k : null;
}

function getNewsProviderFlag(): string {
  const v = (process.env.NEWS_PROVIDER ?? "gnews").trim().toLowerCase();
  if (v === "gnews" || v === "finnhub" || v === "tradingview") return v;
  return "gnews";
}

export function buildGNewsSearchUrl(query: string): string | null {
  const key = getGnewsApiKey();
  if (!key) return null;
  const params = new URLSearchParams({ q: query, lang: "es", country: "ar", max: "10", token: key });
  return `https://gnews.io/api/v4/search?${params.toString()}`;
}

export function buildGNewsTopHeadlinesUrl(limit: number): string | null {
  const key = getGnewsApiKey();
  if (!key) return null;
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 5, 1), 20);
  const params = new URLSearchParams({ country: "ar", lang: "es", max: String(safeLimit), token: key });
  return `https://gnews.io/api/v4/top-headlines?${params.toString()}`;
}

/** Unified builder: search when query provided, else top-headlines (design) */
export function buildGNewsUrl(queryOrLimit?: string | number): string | null {
  if (typeof queryOrLimit === "string" && queryOrLimit.trim().length > 0) {
    return buildGNewsSearchUrl(queryOrLimit);
  }
  if (typeof queryOrLimit === "number") {
    return buildGNewsTopHeadlinesUrl(queryOrLimit);
  }
  // no arg -> top-headlines 20 (feed default)
  return buildGNewsTopHeadlinesUrl(20);
}

// ---- Dedupe -----------------------------------------------------------

export function dedupeByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of items) {
    const key = (it.url ?? it.id ?? "").toLowerCase();
    if (!key) {
      out.push(it);
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

// ---- Mappers ----------------------------------------------------------

/** GNews article -> NewsItem (provider gnews, degraded false) */
export function mapGNewsItem(raw: Record<string, unknown>, fallbackSymbol: string | null): NewsItem | null {
  const title = typeof raw.title === "string" ? raw.title.trim() : null;
  if (!title) return null;
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url) return null;
  const id = typeof raw.url === "string" ? String(raw.url) : typeof raw.id === "string" ? String(raw.id) : url;
  // source: {name,url} or string
  let source = "gnews";
  const srcRaw = raw.source as unknown;
  if (srcRaw && typeof srcRaw === "object" && typeof (srcRaw as Record<string, unknown>).name === "string") {
    source = String((srcRaw as Record<string, unknown>).name);
  } else if (typeof raw.source === "string") {
    source = String(raw.source);
  } else if (typeof raw.publisher === "string") source = String(raw.publisher);

  const publishedAt = typeof raw.publishedAt === "string" ? String(raw.publishedAt) : null;
  const image = typeof raw.image === "string" && raw.image.trim().length > 0 ? String(raw.image) : null;
  const description = typeof raw.description === "string" ? String(raw.description) : null;
  const content = typeof raw.content === "string" ? String(raw.content) : null;
  const summary = description;

  return {
    id,
    title,
    source,
    url,
    link: url,
    publishedAt,
    symbol: fallbackSymbol,
    summary,
    image,
    imageUrl: image,
    description,
    content,
    provider: "gnews",
    degraded: false,
  };
}

// Map TradingView headline item → NewsItem (degraded true title-only)
function mapTvItem(raw: Record<string, unknown>, fallbackSymbol: string | null): NewsItem | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  if (!id || !title) return null;
  const source = typeof raw.source === "string" ? raw.source : typeof raw.provider === "string" ? String(raw.provider) : "tradingview";
  const url = typeof raw.link === "string" ? raw.link : typeof raw.url === "string" ? String(raw.url) : "";
  const publishedAt = unixToIso(raw.published) ?? (typeof raw.publishedAt === "string" ? String(raw.publishedAt) : null);
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
    link: url || `https://www.tradingview.com/news/${encodeURIComponent(id)}/`,
    publishedAt,
    symbol,
    summary,
    image: null,
    imageUrl: null,
    description: summary,
    content: null,
    provider: "tradingview",
    degraded: true,
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
    link: url || "",
    publishedAt,
    symbol: fallbackSymbol,
    summary,
    image: null,
    imageUrl: null,
    description: summary,
    content: null,
    provider: "yahoo",
    degraded: true,
  };
}

function buildTvUrl(tvSymbol?: string): string {
  const params = new URLSearchParams({ client: "web", lang: "en" });
  if (tvSymbol) params.set("symbol", tvSymbol);
  return `${TV_NEWS_BASE}?${params.toString()}`;
}

function buildYahooUrl(yahooSymbol: string): string {
  return `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(yahooSymbol)}&quotesCount=0&newsCount=10`;
}

// ---- Fetchers ---------------------------------------------------------

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
 * GNews primary: GET https://gnews.io/api/v4/search?q={base+nombre}&lang=es&country=ar&max=10&token=
 * 429/403 quota_exceeded → null (no retry), cached as miss in gnewsCache
 * 0 / >=400 → null
 */
export async function fetchGNews(
  query: string,
  signal?: AbortSignal,
  fallbackSymbol: string | null = null,
): Promise<NewsItem[] | null> {
  const url = buildGNewsSearchUrl(query);
  if (!url) return null; // missing key → skip gracefully (degraded)
  let res: { status: number; json: unknown };
  try {
    res = await fetchJson(url, { signal });
  } catch {
    return null;
  }
  if (res.status === 429 || res.status === 403) return null; // quota_exceeded graceful
  if (res.status === 0) return null;
  if (res.status >= 400) return null;
  const json = res.json as Record<string, unknown> | null;
  // GNews shape: { totalArticles, articles: [...] }
  const articlesRaw = (json?.articles ?? json?.items ?? json?.data) as unknown;
  const arr = Array.isArray(articlesRaw) ? articlesRaw : [];
  const mapped: NewsItem[] = [];
  for (const raw of arr) {
    const item = mapGNewsItem(raw as Record<string, unknown>, fallbackSymbol);
    if (item) mapped.push(item);
  }
  return dedupeByUrl(mapped);
}

async function fetchGNewsTopHeadlines(limit: number, signal?: AbortSignal): Promise<NewsItem[] | null> {
  const url = buildGNewsTopHeadlinesUrl(limit);
  if (!url) return null;
  let res: { status: number; json: unknown };
  try {
    res = await fetchJson(url, { signal });
  } catch {
    return null;
  }
  if (res.status === 429 || res.status === 403) return null;
  if (res.status === 0) return null;
  if (res.status >= 400) return null;
  const json = res.json as Record<string, unknown> | null;
  const articlesRaw = (json?.articles ?? json?.items ?? json?.data) as unknown;
  const arr = Array.isArray(articlesRaw) ? articlesRaw : [];
  const mapped: NewsItem[] = [];
  for (const raw of arr) {
    const item = mapGNewsItem(raw as Record<string, unknown>, null);
    if (item) mapped.push(item);
  }
  return dedupeByUrl(mapped);
}

// ---- Finnhub ----------------------------------------------------------

function getFinnhubApiKey(): string | null {
  const k = (process.env.FINNHUB_API_KEY ?? "").trim();
  return k.length > 0 ? k : null;
}

function toYyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildFinnhubCompanyNewsUrl(yahooSymbol: string): string | null {
  const key = getFinnhubApiKey();
  if (!key) return null;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    symbol: yahooSymbol,
    from: toYyyymmdd(weekAgo),
    to: toYyyymmdd(now),
    token: key,
  });
  return `https://finnhub.io/api/v1/company-news?${params.toString()}`;
}

function buildFinnhubGeneralNewsUrl(): string | null {
  const key = getFinnhubApiKey();
  if (!key) return null;
  const params = new URLSearchParams({ category: "general", token: key });
  return `https://finnhub.io/api/v1/news?${params.toString()}`;
}

/**
 * Gate: Finnhub solo si es CEDEAR o market no es BCBA puro
 * AR puro (market=bcba && !isCedear) → skip Finnhub (vacío siempre)
 */
export function shouldUseFinnhub(
  market: AnalysisMarket | string | undefined,
  isCedearFlag: boolean,
): boolean {
  if (isCedearFlag) return true;
  if (market !== undefined && market !== null) {
    return String(market).toLowerCase() !== "bcba";
  }
  // market undefined/null → infer from cedear already handled; fallback skip if not cedear
  return false;
}

/** Finnhub company-news item -> NewsItem (provider finnhub, degraded false) */
export function mapFinnhubItem(
  raw: Record<string, unknown>,
  fallbackSymbol: string | null,
): NewsItem | null {
  const title = typeof raw.headline === "string" ? raw.headline.trim() : typeof raw.title === "string" ? String(raw.title).trim() : null;
  if (!title) return null;
  const url = typeof raw.url === "string" ? String(raw.url).trim() : "";
  if (!url) return null;
  const idRaw = raw.id;
  const id = idRaw !== undefined && idRaw !== null ? String(idRaw) : url;
  const source = typeof raw.source === "string" ? String(raw.source) : "finnhub";
  const image = typeof raw.image === "string" && String(raw.image).trim().length > 0 ? String(raw.image) : null;
  const summary = typeof raw.summary === "string" ? String(raw.summary) : null;
  const description = summary;
  const content = summary;
  const publishedAt =
    typeof raw.datetime === "number" ? (unixToIso(raw.datetime) ?? null) :
    typeof raw.publishedAt === "string" ? String(raw.publishedAt) :
    null;
  return {
    id,
    title,
    source,
    url,
    link: url,
    publishedAt,
    symbol: fallbackSymbol,
    summary,
    image,
    imageUrl: image,
    description,
    content,
    provider: "finnhub",
    degraded: false,
  };
}

/**
 * Finnhub company-news: GET /company-news?symbol={yahoo}&from=-7d&to=today&token=
 * Header X-Finnhub-Token fallback (finnhub accepts both)
 * 429/403 → null no retry, 0/>=400 → null
 */
export async function fetchFinnhub(
  yahooSymbol: string,
  signal?: AbortSignal,
  fallbackSymbol: string | null = null,
): Promise<NewsItem[] | null> {
  const url = buildFinnhubCompanyNewsUrl(yahooSymbol);
  if (!url) return null;
  const key = getFinnhubApiKey();
  let res: { status: number; json: unknown };
  try {
    res = await fetchJson(url, {
      signal,
      headers: key ? { "X-Finnhub-Token": key } : undefined,
    });
  } catch {
    return null;
  }
  if (res.status === 429 || res.status === 403) return null;
  if (res.status === 0) return null;
  if (res.status >= 400) return null;
  const arr = Array.isArray(res.json) ? res.json : [];
  const mapped: NewsItem[] = [];
  for (const raw of arr) {
    const item = mapFinnhubItem(raw as Record<string, unknown>, fallbackSymbol);
    if (item) mapped.push(item);
  }
  return dedupeByUrl(mapped);
}

async function fetchFinnhubGeneral(limit: number, signal?: AbortSignal): Promise<NewsItem[] | null> {
  const url = buildFinnhubGeneralNewsUrl();
  if (!url) return null;
  const key = getFinnhubApiKey();
  let res: { status: number; json: unknown };
  try {
    res = await fetchJson(url, { signal, headers: key ? { "X-Finnhub-Token": key } : undefined });
  } catch {
    return null;
  }
  if (res.status === 429 || res.status === 403) return null;
  if (res.status === 0) return null;
  if (res.status >= 400) return null;
  const arr = Array.isArray(res.json) ? res.json : [];
  const mapped: NewsItem[] = [];
  for (const raw of arr) {
    const item = mapFinnhubItem(raw as Record<string, unknown>, null);
    if (item) mapped.push(item);
  }
  return dedupeByUrl(mapped).slice(0, limit);
}

// ---- Public API -------------------------------------------------------

/**
 * Noticias por símbolo — Cascade GNews → (Finnhub in Batch4) → TV
 * Batch3: GNews primario, TV degraded fallback, composited cache V2
 */
export async function getNews(
  symbol: string,
  marketOrOpts?: AnalysisMarket | AnalysisOpts,
  signal?: AbortSignal,
): Promise<AnalysisEnvelope<NewsData>> {
  const { market, signal: resolvedSignal } = resolveArgs(marketOrOpts, signal);
  const { tv, yahoo } = resolveAnalysisSymbols(symbol, market);
  const keyV2 = `news:v2:${tv}`;
  const legacyKey = `news:${tv}`;

  // 1. Composited fresh check — avoids burning 100/día quota
  const v2Entry = perSymbolCacheV2.getEntry(keyV2);
  if (v2Entry && perSymbolCacheV2.isFresh(v2Entry)) {
    const items = v2Entry.data;
    const src: NewsProvider = (items[0]?.provider as NewsProvider) ?? "gnews";
    const degraded = items.length > 0 ? (items[0]?.degraded ?? false) : false;
    return { status: "ok", data: { source: src, items, degraded }, cached: true, source: src };
  }
  // legacy fallback compat (if V2 miss but legacy fresh)
  const legacyEntry = perSymbolCache.getEntry(legacyKey);
  if (legacyEntry && perSymbolCache.isFresh(legacyEntry) && !v2Entry) {
    // promote legacy to V2 shape? just return legacy
    // but keep V2 logic primary; still serve legacy if no V2
  }

  const providerFlag = getNewsProviderFlag();

  // 2. GNews attempt — respect NEWS_PROVIDER flag (Task 2.4)
  // gnews (default): try GNews first; finnhub: skip GNews; tradingview: skip GNews+Finnhub
  let gnewsMiss = false;
  if (providerFlag === "gnews") {
    const query = buildGNewsQuery(symbol, market);
    const subKey = `gnews:${hashQuery(query)}`;
    const subEntry = gnewsCache.getEntry(subKey);
    const isSubFresh = subEntry ? gnewsCache.isFresh(subEntry) : false;
    const skipDueToCachedMiss = isSubFresh && (subEntry!.data === null || (Array.isArray(subEntry!.data) && subEntry!.data.length === 0));

    if (!skipDueToCachedMiss) {
      const gnewsItems = await fetchGNews(query, resolvedSignal, tv);
      if (gnewsItems === null) {
        const url = buildGNewsSearchUrl(query);
        if (url) gnewsCache.set(subKey, null as unknown as NewsItem[]);
        gnewsMiss = true;
      } else if (gnewsItems.length > 0) {
        gnewsCache.set(subKey, gnewsItems);
        perSymbolCacheV2.set(keyV2, gnewsItems);
        perSymbolCache.set(legacyKey, gnewsItems);
        return { status: "ok", data: { source: "gnews", items: gnewsItems.slice(0, 20), degraded: false }, cached: false, source: "gnews" };
      } else {
        gnewsCache.set(subKey, []);
        gnewsMiss = true;
      }
    } else {
      // cached miss/empty within TTL → treat as miss for cascade
      gnewsMiss = true;
    }
  } else if (providerFlag === "finnhub") {
    // forced finnhub: mark gnews as missed to allow finnhub path
    gnewsMiss = true;
  } else {
    // tradingview forced: gnewsMiss stays false, finnhub skipped
    gnewsMiss = false;
  }

  // 3. Finnhub gate — Task 2.2 : only if isCedear || market != bcba
  if (providerFlag !== "tradingview") {
    const resolved = resolveAnalysisSymbols(symbol, market);
    const cedearFlag = isCedear(resolved.base);
    const marketDetailed = resolved.marketDetailed as AnalysisMarket;
    const useFinnhub = shouldUseFinnhub(marketDetailed, cedearFlag);
    const shouldAttemptFinnhub = providerFlag === "finnhub" ? useFinnhub : gnewsMiss && useFinnhub;
    if (shouldAttemptFinnhub) {
      const finnhubSubKey = `finnhub:${yahoo}`;
      const finnhubEntry = finnhubCache.getEntry(finnhubSubKey);
      const isFinnhubFresh = finnhubEntry ? finnhubCache.isFresh(finnhubEntry) : false;
      const skipFinnhubCachedMiss = isFinnhubFresh && (finnhubEntry!.data === null || (Array.isArray(finnhubEntry!.data) && finnhubEntry!.data.length === 0));
      if (!skipFinnhubCachedMiss) {
        const finnhubItems = await fetchFinnhub(yahoo, resolvedSignal, tv);
        if (finnhubItems === null) {
          const url = buildFinnhubCompanyNewsUrl(yahoo);
          if (url) finnhubCache.set(finnhubSubKey, null as unknown as NewsItem[]);
          // fall through to TV
        } else if (finnhubItems.length > 0) {
          finnhubCache.set(finnhubSubKey, finnhubItems);
          perSymbolCacheV2.set(keyV2, finnhubItems);
          perSymbolCache.set(legacyKey, finnhubItems);
          return { status: "ok", data: { source: "finnhub", items: finnhubItems.slice(0, 20), degraded: false }, cached: false, source: "finnhub" };
        } else {
          finnhubCache.set(finnhubSubKey, []);
          // fall through to TV
        }
      }
    }
  }

  // 4. TradingView fallback (degraded)
  const tvResult = await fetchTvHeadlines(tv, resolvedSignal);
  if (tvResult) {
    if (tvResult.status === 429) {
      return { status: "rate_limited", data: null, cached: false, source: "tradingview", error: "Rate limit" };
    }
    if (tvResult.items.length > 0) {
      const slice = tvResult.items.slice(0, 20);
      // TV items already degraded:true via mapper
      perSymbolCacheV2.set(keyV2, slice);
      perSymbolCache.set(legacyKey, slice);
      return { status: "ok", data: { source: "tradingview", items: slice, degraded: true }, cached: false, source: "tradingview" };
    }
  } else {
    // tvResult null → network down but we still try Yahoo as last resort
  }

  // 5. Yahoo last resort (kept for compat, though spec says TV fallback is final)
  const yahooItems = await fetchYahooNews(yahoo, tv, resolvedSignal);
  if (yahooItems && yahooItems.length > 0) {
    const slice = yahooItems.slice(0, 20);
    perSymbolCacheV2.set(keyV2, slice);
    perSymbolCache.set(legacyKey, slice);
    return { status: "ok", data: { source: "yahoo", items: slice, degraded: true }, cached: false, source: "yahoo" };
  }

  if (tvResult === null && (yahooItems === null || yahooItems?.length === 0)) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }

  if (yahooItems !== null) {
    const empty: NewsItem[] = [];
    perSymbolCacheV2.set(keyV2, empty);
    perSymbolCache.set(legacyKey, empty);
    return { status: "ok", data: { source: "yahoo", items: empty, degraded: true }, cached: false, source: "yahoo" };
  }

  return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
}

/**
 * Feed global de noticias — GNews top-headlines primary, TV fallback
 * Cache V2 key `newsfeed:v2:{limit}` TTL 45min GNews / 15min TV legacy
 */
export async function fetchNewsFeed(limit: number = 5, signal?: AbortSignal): Promise<NewsItem[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit) || 5, 1), 20);
  const keyV2 = `newsfeed:v2:${safeLimit}`;
  const legacyKey = `newsfeed:${safeLimit}`;

  const v2Entry = feedCacheV2.getEntry(keyV2);
  if (v2Entry && feedCacheV2.isFresh(v2Entry)) {
    return v2Entry.data;
  }

  const providerFlag = getNewsProviderFlag();

  // Cascade: GNews → Finnhub general → TV (respect NEWS_PROVIDER)
  let gnewsFeedMiss = false;
  if (providerFlag === "gnews") {
    const gnewsFeed = await fetchGNewsTopHeadlines(safeLimit, signal);
    if (gnewsFeed && gnewsFeed.length > 0) {
      const slice = gnewsFeed.slice(0, safeLimit);
      feedCacheV2.set(keyV2, slice);
      feedCache.set(legacyKey, slice);
      return slice;
    }
    if (gnewsFeed === null) {
      // 429/403/missing key → miss, avoid retry within TTL via no sub-cache for feed (composited covers)
      gnewsFeedMiss = true;
    } else if (!gnewsFeed || gnewsFeed.length === 0) {
      gnewsFeedMiss = true;
    }
  } else if (providerFlag === "finnhub") {
    gnewsFeedMiss = true;
  } else {
    gnewsFeedMiss = false;
  }

  // Finnhub general news fallback (Task 2.4) — respects same flag
  if (providerFlag !== "tradingview" && (providerFlag === "finnhub" || gnewsFeedMiss)) {
    const finnhubFeedKey = `finnhub:feed:${safeLimit}`;
    const finnhubEntry = finnhubCache.getEntry(finnhubFeedKey);
    const isFinnhubFeedFresh = finnhubEntry ? finnhubCache.isFresh(finnhubEntry) : false;
    const skipFinnhubFeedMiss = isFinnhubFeedFresh && (finnhubEntry!.data === null || (Array.isArray(finnhubEntry!.data) && finnhubEntry!.data.length === 0));
    if (!skipFinnhubFeedMiss) {
      const finnhubFeed = await fetchFinnhubGeneral(safeLimit, signal);
      if (finnhubFeed === null) {
        const url = buildFinnhubGeneralNewsUrl();
        if (url) finnhubCache.set(finnhubFeedKey, null as unknown as NewsItem[]);
      } else if (finnhubFeed.length > 0) {
        const slice = finnhubFeed.slice(0, safeLimit);
        finnhubCache.set(finnhubFeedKey, slice);
        feedCacheV2.set(keyV2, slice);
        feedCache.set(legacyKey, slice);
        return slice;
      } else {
        finnhubCache.set(finnhubFeedKey, []);
      }
    }
  }

  const tvResult = await fetchTvHeadlines(undefined, signal);
  if (tvResult && tvResult.status !== 429 && tvResult.items.length > 0) {
    const slice = tvResult.items.slice(0, safeLimit);
    feedCacheV2.set(keyV2, slice);
    feedCache.set(legacyKey, slice);
    return slice;
  }

  if (tvResult && tvResult.items.length === 0) {
    const empty: NewsItem[] = [];
    feedCacheV2.set(keyV2, empty);
    feedCache.set(legacyKey, empty);
    return empty;
  }

  if (v2Entry) return v2Entry.data;
  const legacy = feedCache.getEntry(legacyKey);
  if (legacy) return legacy.data;
  return [];
}

// Alias requerido por prompt
export const getNewsFeed = fetchNewsFeed;

/**
 * Detalle de noticia por id — busca en feeds cacheadas (5|10|20) + per-symbol V2
 * ID puede ser url (GNews) o TV id — comparar exacto + decode
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

  const match = (it: NewsItem) => it.id === decodedId || it.id === id || it.url === decodedId || it.url === id;

  // 1. Search existing feed caches V2 5|10|20 without network
  for (const lim of [5, 10, 20]) {
    const entry = feedCacheV2.getEntry(`newsfeed:v2:${lim}`);
    if (entry) {
      const found = entry.data.find(match);
      if (found) return { status: "ok", data: found, cached: true, source: found.provider ?? "gnews" };
    }
    const legacy = feedCache.getEntry(`newsfeed:${lim}`);
    if (legacy) {
      const found = legacy.data.find(match);
      if (found) return { status: "ok", data: found, cached: true, source: (found.provider as string) ?? "tradingview" };
    }
  }

  // 2. Scan per-symbol V2 caches via internal store (private but accessible via any cast)
  const stores: unknown[] = [(perSymbolCacheV2 as unknown as { store: Map<string, { data: NewsItem[] }> }).store, (perSymbolCache as unknown as { store: Map<string, { data: NewsItem[] }> }).store];
  for (const store of stores) {
    if (store instanceof Map) {
      for (const [, entry] of store) {
        const items = (entry as { data: NewsItem[] }).data;
        const found = items.find(match);
        if (found) return { status: "ok", data: found, cached: true, source: found.provider ?? "gnews" };
      }
    }
  }

  // 3. Refetch feed 20 as fallback (will hit cache if fresh)
  const feed = await fetchNewsFeed(20, signal);
  const found = feed.find(match);
  if (found) {
    const entry20 = feedCacheV2.getEntry("newsfeed:v2:20");
    const isCached = entry20 ? feedCacheV2.isFresh(entry20) : false;
    return { status: "ok", data: found, cached: isCached, source: found.provider ?? "gnews" };
  }

  return { status: "symbol_not_found", data: null, cached: false, source: "tradingview", error: "Noticia no encontrada" };
}
