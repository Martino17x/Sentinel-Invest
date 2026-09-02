/**
 * Feature vertical `cotizaciones` — fuente única para PanelQuote y quotesApi.
 * Extraído fielmente de `lib/api.ts` (commit 1, SDD dashboard-features-quotes).
 * No refactorizar lógica — mover, no re-escribir.
 * Depende de `apiFetch` central para no duplicar refresh/token coalescing.
 */

import { apiFetch } from "@/lib/api-client";

export interface PanelQuote {
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  lastPrice: number;
  variationPct: number;
  bid: number | null;
  ask: number | null;
  open: number | null;
  low: number | null;
  high: number | null;
  close: number | null;
  volume: number;
  volumeEfectivo?: number | null;
  volumeNominal?: number | null;
  currency: string;
  isFavorite?: boolean;
  source?: string;
  fetchedAt?: string;
  cacheHit?: boolean;
}

export interface PanelSummary {
  market: string;
  assetType: string;
  totalVariationPct: number;
  updatedAt: string;
  isRealtime: boolean;
  source?: string;
  fetchedAt?: string;
  cacheHit?: boolean;
}

export interface PanelResponse {
  summary: PanelSummary;
  quotes: PanelQuote[];
  total?: number;
  cached?: boolean;
  cachedAt?: string;
  message?: string;
}

export interface Quote {
  symbol: string;
  market: string;
  lastPrice: number;
  variationPct: number;
  currency: string;
  updatedAt: string;
  fetchedAt?: string;
  source?: string;
  cacheHit?: boolean;
  name?: string;
  bid?: number | null;
  ask?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  volume?: number | null;
}

export interface CompareResult {
  symbol: string;
  results: Record<string, { quote: Quote; source: string; fetchedAt: string } | { error: string; code: string }>;
  fetchedAt: string;
}

export const quotesApi = {
  async getPanel(
    market: string,
    assetType: string,
    page = 1,
    pageSize = 25,
    q?: string,
    broker?: "iol" | "ppi"
  ): Promise<PanelResponse> {
    const query = q ? `&q=${encodeURIComponent(q)}` : "";
    const brokerQs = broker ? `&broker=${broker}` : "";
    return apiFetch(`/quotes/panel/${market}/${assetType}?page=${page}&pageSize=${pageSize}${query}${brokerQs}`);
  },

  async getQuote(symbol: string, market: string, broker?: "iol" | "ppi"): Promise<{ quote: Quote }> {
    const brokerQs = broker ? `&broker=${broker}` : "";
    const sep = brokerQs ? "&" : "";
    // market already as query, append broker
    return apiFetch(`/quotes/${symbol}?market=${market}${brokerQs ? `${sep}broker=${broker}` : ""}`);
  },

  async getQuoteHistory(
    symbol: string,
    market: string,
    days = 90,
    broker?: "iol" | "ppi"
  ): Promise<{ history: { date: string; close: number }[] }> {
    const brokerQs = broker ? `&broker=${broker}` : "";
    return apiFetch(`/quotes/${symbol}/history?days=${days}&market=${market}${brokerQs}`);
  },

  async compare(
    symbol: string,
    providers?: string[],
    market = "bcba"
  ): Promise<CompareResult> {
    const provQs = providers && providers.length ? `&providers=${providers.join(",")}` : "";
    return apiFetch(`/quotes/compare/${encodeURIComponent(symbol)}?market=${encodeURIComponent(market)}${provQs}`);
  },
};
