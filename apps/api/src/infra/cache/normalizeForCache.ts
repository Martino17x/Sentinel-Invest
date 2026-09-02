import { createHash } from "node:crypto";
import { z } from "zod";

// zod schema para validar Quote al leer de cache
export const QuoteSchema = z.object({
  symbol: z.string(),
  market: z.string(),
  lastPrice: z.number(),
  variationPct: z.number(),
  currency: z.enum(["ARS", "USD"]),
  updatedAt: z.string(),
  name: z.string().optional(),
  bid: z.number().nullable().optional(),
  ask: z.number().nullable().optional(),
  open: z.number().nullable().optional(),
  high: z.number().nullable().optional(),
  low: z.number().nullable().optional(),
  prevClose: z.number().nullable().optional(),
  volume: z.number().nullable().optional(),
  source: z.enum(["iol", "ppi", "byma", "snapshot", "cache"]).optional(),
  fetchedAt: z.string().optional(),
  cacheHit: z.boolean().optional(),
});

export const TTL_MAP = {
  getQuote: 15_000,
  getQuoteHistory: 30_000,
  getPanel: 30_000,
} as const;

export type CacheMethod = keyof typeof TTL_MAP;

export const CACHE_KEY_PREFIX = "sentinel:quotes:v1";

export function normalizeForCache(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) out[k] = null;
    else if (v === null) out[k] = null;
    else if (typeof v === "string") out[k] = v.trim();
    else out[k] = v;
  }
  return out;
}

export function hashParams(params: Record<string, unknown>): string {
  const normalized = normalizeForCache(params);
  // q truncado a 32 chars antes de hash para reducir key explosion
  if (typeof normalized.q === "string" && (normalized.q as string).length > 32) {
    normalized.q = (normalized.q as string).slice(0, 32);
  }
  const json = JSON.stringify(normalized);
  return createHash("sha1").update(json).digest("hex").slice(0, 12);
}

export function buildCacheKey(broker: string, method: string, params: Record<string, unknown>): string {
  const h = hashParams(params);
  return `${CACHE_KEY_PREFIX}:${broker}:${method}:${h}`;
}

export function getTtlForMethod(method: string, override?: { quotesMs?: number; panelMs?: number }): number {
  if (method === "getQuote") return override?.quotesMs ?? TTL_MAP.getQuote;
  if (method === "getQuoteHistory" || method === "getPanel") return override?.panelMs ?? TTL_MAP.getPanel;
  return TTL_MAP.getPanel;
}
