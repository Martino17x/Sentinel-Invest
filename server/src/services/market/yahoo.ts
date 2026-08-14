// ============================================================
// Yahoo Finance client — chart + fundamentals (crumb flow)
//
// Contrato compartido (ruta /api/analysis, tool analyze_stock,
// reportBuilder): NUNCA LANZA. Devuelve envelopes con status:
//   ok | symbol_not_found | rate_limited | down
//
// - Chart: query1 /v8/finance/chart, range=1y interval=1d,
//   cache SWR TTL 15min (vencida → sirve + refetch en background).
// - Fundamentals: crumb flow (cookie A3 de fc.yahoo.com → getcrumb,
//   cache TTL 60min) + quoteSummary. 401 "Invalid Crumb" → 1 re-fetch
//   con crumb nuevo; si falla de nuevo → null (señal técnico-only).
// - 429 → backoff fijo 500ms × 2 (nunca hammer).
// - Taxonomía propia: YahooDownError / SymbolNotFoundError /
//   RateLimitedError (internas; el límite público las mapea a status).
// ============================================================

import { SwrCache } from "./cache.js";

export type MarketStatus = "ok" | "symbol_not_found" | "rate_limited" | "down";

export interface ChartMeta {
  regularMarketPrice: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  currency: string | null;
  name: string | null;
  regularMarketTime: number | null;
}

export interface ChartData {
  /** Fechas YYYY-MM-DD en hora LOCAL del server (UTC-3) */
  dates: string[];
  closes: number[];
  volumes: number[];
  meta: ChartMeta;
}

export interface ChartResult {
  status: MarketStatus;
  data?: ChartData;
  /** true cuando se sirvió cache sin tocar la red */
  cached?: boolean;
  /** true cuando se sirvió cache VENCIDA (SWR) — datos degradados */
  stale?: boolean;
}

export interface Fundamentals {
  pe: number | null; // trailingPE (fallback forwardPE)
  eps: number | null; // trailingEps
  beta: number | null;
  margin: number | null; // profitMargins
  roe: number | null; // returnOnEquity
  debtEquity: number | null; // debtToEquity
  dividendYield: number | null;
  marketCap: number | null;
}

// ============================================================
// Taxonomía de errores (interna — nunca cruza el límite público)
// ============================================================

export class YahooDownError extends Error {}
export class SymbolNotFoundError extends Error {}
export class RateLimitedError extends Error {}

// ============================================================
// Constantes
// ============================================================

const CHART_TTL_MS = 15 * 60 * 1000; // 15 min (spec REQ-M1)
const CRUMB_TTL_MS = 60 * 60 * 1000; // 60 min (spec REQ-M2)
const RETRY_DELAY_MS = 500; // backoff fijo entre reintentos
const MAX_RETRIES = 2; // intentos extra tras el primero (429)
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

const chartCache = new SwrCache<ChartData>(CHART_TTL_MS);
const crumbCache = new SwrCache<string>(CRUMB_TTL_MS);
/** Dedup de refetches en background (SWR): un solo refresh por key a la vez */
const inFlightRefreshes = new Map<string, Promise<void>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ============================================================
// HTTP helpers
// ============================================================

interface HttpOptions {
  cookie?: string;
  signal?: AbortSignal;
}

async function httpGet(url: string, opts: HttpOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    if (opts.cookie) headers.Cookie = opts.cookie;
    return await fetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/** Reintenta con backoff fijo mientras devuelva 429 (hasta MAX_RETRIES extra) */
async function withBackoff(fn: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fn();
    if (res.status !== 429 || attempt >= MAX_RETRIES) return res;
    await sleep(RETRY_DELAY_MS);
  }
}

function extractCookies(headers: Headers): string[] {
  const multi = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  if (multi.length > 0) {
    return multi.map((c) => c.split(";")[0].trim()).filter(Boolean);
  }
  const single = headers.get("set-cookie");
  if (single) return single.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean);
  return [];
}

function numOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

// ============================================================
// Chart (query1) — cache SWR 15min
// ============================================================

interface ChartQuote {
  close?: (number | null)[];
  volume?: (number | null)[];
}

interface ChartResultItem {
  timestamp?: number[];
  indicators?: { quote?: ChartQuote[] };
  meta?: Record<string, unknown>;
}

interface ChartJson {
  chart?: {
    error?: unknown;
    result?: ChartResultItem[];
  };
}

function parseChartResult(result: ChartResultItem): ChartData {
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const closes = quote.close ?? [];
  const volumes = quote.volume ?? [];
  const meta = result.meta ?? {};

  const dates: string[] = [];
  const outCloses: number[] = [];
  const outVolumes: number[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    dates.push(toLocalDateKey(new Date(timestamps[i] * 1000)));
    outCloses.push(close);
    const volume = volumes[i];
    outVolumes.push(typeof volume === "number" && Number.isFinite(volume) ? volume : 0);
  }

  return {
    dates,
    closes: outCloses,
    volumes: outVolumes,
    meta: {
      regularMarketPrice: numOrNull(meta.regularMarketPrice),
      fiftyTwoWeekLow: numOrNull(meta.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: numOrNull(meta.fiftyTwoWeekHigh),
      currency: typeof meta.currency === "string" ? meta.currency : null,
      name:
        typeof meta.longName === "string"
          ? meta.longName
          : typeof meta.shortName === "string"
            ? meta.shortName
            : null,
      regularMarketTime: numOrNull(meta.regularMarketTime),
    },
  };
}

/**
 * Fetch de chart con backoff. LANZA la taxonomía interna —
 * el wrapper público la mapea a envelope.
 */
async function fetchChartFromNetwork(
  symbol: string,
  range: string,
  signal?: AbortSignal
): Promise<ChartData> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;

  const res = await withBackoff(() => httpGet(url, { signal }));

  if (res.status === 429) {
    throw new RateLimitedError(`Rate limit (429) tras ${MAX_RETRIES + 1} intentos`);
  }
  if (res.status === 404) {
    throw new SymbolNotFoundError(`Yahoo no conoce el símbolo ${symbol}`);
  }
  if (!res.ok) {
    throw new YahooDownError(`Yahoo respondió ${res.status} para ${symbol}`);
  }

  const json = (await res.json()) as ChartJson;
  const result = json.chart?.result?.[0];
  if (json.chart?.error || !result) {
    throw new SymbolNotFoundError(`Yahoo reporta error para ${symbol}`);
  }
  return parseChartResult(result);
}

function chartErrorToResult(err: unknown): ChartResult {
  if (err instanceof SymbolNotFoundError) return { status: "symbol_not_found" };
  if (err instanceof RateLimitedError) return { status: "rate_limited" };
  return { status: "down" };
}

/**
 * Serie diaria (range=1y, interval=1d) con cache SWR de 15min.
 * Nunca lanza: red caída + cache vencida → sirve la cache (stale: true).
 */
export async function fetchChart(
  symbol: string,
  range = "1y",
  signal?: AbortSignal
): Promise<ChartResult> {
  const key = `${symbol}:${range}`;
  const entry = chartCache.getEntry(key);

  if (entry) {
    if (chartCache.isFresh(entry)) {
      return { status: "ok", data: entry.data, cached: true };
    }
    // SWR: cache vencida → sirve ya + refetch en background (dedup)
    refreshChartInBackground(key, symbol, range);
    return { status: "ok", data: entry.data, cached: true, stale: true };
  }

  try {
    const data = await fetchChartFromNetwork(symbol, range, signal);
    chartCache.set(key, data);
    return { status: "ok", data, cached: false };
  } catch (err) {
    return chartErrorToResult(err);
  }
}

function refreshChartInBackground(key: string, symbol: string, range: string): void {
  if (inFlightRefreshes.has(key)) return;
  const promise = fetchChartFromNetwork(symbol, range)
    .then((data) => chartCache.set(key, data))
    .catch((err: unknown) => {
      // El usuario ya recibió la cache vencida; acá solo se intenta refrescar.
      // Si el símbolo dejó de existir, se evita seguir sirviendo stale.
      if (err instanceof SymbolNotFoundError) chartCache.delete(key);
    })
    .finally(() => inFlightRefreshes.delete(key));
  inFlightRefreshes.set(key, promise);
}

// ============================================================
// Crumb flow (cookie A3 + getcrumb) — cache 60min
// ============================================================

/**
 * Obtiene la cookie A3: fc.yahoo.com responde 404 "Will be right
 * back" pero setea la cookie en el camino (verificado en vivo).
 */
async function getA3Cookie(signal?: AbortSignal): Promise<string> {
  const res = await withBackoff(() => httpGet("https://fc.yahoo.com", { signal }));
  const cookie = extractCookies(res.headers).find((c) => c.startsWith("A3="));
  if (!cookie) {
    throw new YahooDownError("fc.yahoo.com no seteó la cookie A3");
  }
  return cookie;
}

async function fetchCrumbRaw(cookie: string, signal?: AbortSignal): Promise<string> {
  const res = await withBackoff(
    () => httpGet("https://query1.finance.yahoo.com/v1/test/getcrumb", { cookie, signal }),
  );
  if (!res.ok) throw new YahooDownError(`getcrumb respondió ${res.status}`);
  const crumb = (await res.text()).trim();
  if (!crumb) throw new YahooDownError("getcrumb vacío");
  return crumb;
}

async function getCrumb(cookie: string, signal?: AbortSignal): Promise<string> {
  const entry = crumbCache.getEntry("crumb");
  if (entry && crumbCache.isFresh(entry)) return entry.data;
  const crumb = await fetchCrumbRaw(cookie, signal);
  crumbCache.set("crumb", crumb);
  return crumb;
}

// ============================================================
// Fundamentals (quoteSummary) — degrada a null, nunca lanza
// ============================================================

function numFromRaw(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object" && value !== null && typeof (value as { raw?: unknown }).raw === "number") {
    return numOrNull((value as { raw: number }).raw);
  }
  return null;
}

interface QuoteSummaryJson {
  quoteSummary?: { result?: Record<string, unknown>[] | null };
}

function parseFundamentals(json: unknown): Fundamentals | null {
  const result = (json as QuoteSummaryJson | null)?.quoteSummary?.result?.[0];
  if (!result) return null;

  const dks = (result.defaultKeyStatistics ?? {}) as Record<string, unknown>;
  const fin = (result.financialData ?? {}) as Record<string, unknown>;
  const sd = (result.summaryDetail ?? {}) as Record<string, unknown>;

  return {
    pe: numFromRaw(dks.trailingPE) ?? numFromRaw(sd.trailingPE) ?? numFromRaw(dks.forwardPE),
    eps: numFromRaw(dks.trailingEps),
    beta: numFromRaw(dks.beta),
    margin: numFromRaw(fin.profitMargins),
    roe: numFromRaw(dks.returnOnEquity),
    debtEquity: numFromRaw(dks.debtToEquity),
    dividendYield: numFromRaw(sd.dividendYield) ?? numFromRaw(dks.dividendYield),
    marketCap: numFromRaw(sd.marketCap) ?? numFromRaw(dks.marketCap),
  };
}

async function fetchQuoteSummaryRaw(
  symbol: string,
  cookie: string,
  crumb: string,
  signal?: AbortSignal
): Promise<Response> {
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=defaultKeyStatistics,financialData,summaryDetail,price&crumb=${encodeURIComponent(crumb)}`;
  return httpGet(url, { cookie, signal });
}

/**
 * Fundamentales del símbolo. NUNCA LANZA: cualquier fallo
 * (crumb, 401, 429, red) → null. La señal queda técnico-only.
 * Ante 401 "Invalid Crumb" hace UN re-fetch con crumb nuevo.
 */
export async function fetchFundamentals(
  symbol: string,
  signal?: AbortSignal
): Promise<Fundamentals | null> {
  let cookie: string;
  try {
    cookie = await getA3Cookie(signal);
  } catch {
    return null;
  }

  let crumb: string;
  try {
    crumb = await getCrumb(cookie, signal);
  } catch {
    return null;
  }

  let res = await withBackoff(() => fetchQuoteSummaryRaw(symbol, cookie, crumb, signal));

  if (res.status === 401) {
    // 1 re-fetch con cookie + crumb frescos (Invalid Crumb recovery)
    const freshCookie = await getA3Cookie(signal).catch(() => "");
    const freshCrumb = freshCookie ? await fetchCrumbRaw(freshCookie, signal).catch(() => null) : null;
    if (freshCrumb) {
      crumbCache.set("crumb", freshCrumb);
      res = await withBackoff(() => fetchQuoteSummaryRaw(symbol, freshCookie, freshCrumb, signal));
    }
  }

  if (!res.ok) return null;
  const json: unknown = await res.json().catch(() => null);
  return parseFundamentals(json);
}

/** Solo para tests: vacía caches e in-flight del servicio de mercado. */
export function resetMarketCache(): void {
  chartCache.resetForTests();
  crumbCache.resetForTests();
  inFlightRefreshes.clear();
}
