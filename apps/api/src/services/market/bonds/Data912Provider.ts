// ============================================================
// Data912Provider.ts — Canonical provider para data912.com
// Live AR bonds via https://data912.com/live/arg_bonds
// SwrCache 60s, timeout 5s, retry 1, stale fallback, in-flight dedup.
// Fallback BYMA ya existe en QuoteService/BymaClient capa superior;
// acá servimos stale si data912 cae.
// ============================================================

import { SwrCache } from "../cache.js";

export interface Data912BondQuote {
  symbol: string;
  c: number | null;
  px_bid: number | null;
  px_ask: number | null;
  q_bid: number | null;
  q_ask: number | null;
  v: number | null;
  q_op: number | null;
  pct_change: number | null;
  raw: Record<string, unknown>;
}

const DATA912_BASE = "https://data912.com";
const DATA912_LIVE_BONDS = `${DATA912_BASE}/live/arg_bonds`;
const DATA912_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

const data912Cache = new SwrCache<Data912BondQuote[]>(DATA912_TTL_MS);
const inFlight = new Map<string, Promise<Data912BondQuote[]>>();

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(raw: Record<string, unknown>): Data912BondQuote {
  return {
    symbol: String((raw.symbol ?? raw.ticker ?? "") as string).toUpperCase().trim(),
    c: toNumber(raw.c),
    px_bid: toNumber(raw.px_bid),
    px_ask: toNumber(raw.px_ask),
    q_bid: toNumber(raw.q_bid),
    q_ask: toNumber(raw.q_ask),
    v: toNumber(raw.v),
    q_op: toNumber(raw.q_op),
    pct_change: toNumber(raw.pct_change),
    raw,
  };
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  // Combine signals: if outer aborts, abort inner
  const combinedSignal = controller.signal;

  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "sentinel-invest/1.0" },
      signal: combinedSignal,
    });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    return r;
  } catch (err) {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    throw err;
  }
}

async function fetchLiveRaw(signal?: AbortSignal): Promise<Data912BondQuote[]> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchWithTimeout(DATA912_LIVE_BONDS, signal);
      if (!r.ok) throw new Error(`data912 live/arg_bonds HTTP ${r.status}`);
      const json = (await r.json()) as unknown;
      const arr = Array.isArray(json) ? json : [];
      const normalized = arr
        .map((row) => normalizeRow(row as Record<string, unknown>))
        .filter((q) => q.symbol.length > 0);
      return normalized;
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) throw err;
      if (attempt === 0) {
        // retry 1: small backoff 120ms
        await new Promise((res) => setTimeout(res, 120));
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("data912 fetch failed");
}

function refreshInBackground(): void {
  const key = "data912:live:arg_bonds";
  if (inFlight.has(key)) return;
  const p = fetchLiveRaw()
    .then((data) => {
      data912Cache.set(key, data);
      return data;
    })
    .catch(() => [] as Data912BondQuote[])
    .finally(() => inFlight.delete(key)) as unknown as Promise<Data912BondQuote[]>;
  inFlight.set(key, p);
}

/**
 * Fetch live AR bonds with SwrCache 60s + stale-while-revalidate.
 * Retries once on transient error, timeout 5s.
 */
export async function fetchLiveArgBonds(signal?: AbortSignal): Promise<Data912BondQuote[]> {
  const key = "data912:live:arg_bonds";
  const entry = data912Cache.getEntry(key);
  if (entry) {
    if (data912Cache.isFresh(entry)) return entry.data;
    refreshInBackground();
    return entry.data;
  }

  const existing = inFlight.get(key);
  if (existing) {
    try {
      return await existing;
    } catch {
      // fall through to fresh fetch
    }
  }

  const promise = fetchLiveRaw(signal);
  inFlight.set(key, promise);
  try {
    const data = await promise;
    data912Cache.set(key, data);
    return data;
  } catch (err) {
    const stale = data912Cache.getEntry(key);
    if (stale) return stale.data;
    throw err;
  } finally {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  }
}

/** Alias bulk */
export const getAllData912Bonds = fetchLiveArgBonds;

/**
 * Lookup por symbol (case-insensitive) via live cache.
 */
export async function getBondData912(symbol: string, signal?: AbortSignal): Promise<Data912BondQuote | null> {
  const sym = symbol.toUpperCase().trim();
  const all = await fetchLiveArgBonds(signal);
  const found = all.find((q) => q.symbol.toUpperCase() === sym);
  return found ?? null;
}

/** Compat helper for panel shape */
export async function getData912Panel(signal?: AbortSignal): Promise<Data912BondQuote[]> {
  return fetchLiveArgBonds(signal);
}

// Sólo para tests
export function resetData912CacheForTests(): void {
  data912Cache.resetForTests();
  inFlight.clear();
}

export const Data912Provider = {
  name: "Data912Provider",
  fetchLiveArgBonds,
  getAllData912Bonds,
  getBondData912,
  getData912Panel,
  resetData912CacheForTests,
} as const;

export const _internal = {
  data912Cache,
  normalizeRow,
  DATA912_TTL_MS,
  DATA912_LIVE_BONDS,
};
