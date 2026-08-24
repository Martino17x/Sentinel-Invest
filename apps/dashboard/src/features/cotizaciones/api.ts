/**
 * Feature vertical `cotizaciones` — fuente única para PanelQuote y quotesApi.
 * Extraído fielmente de `lib/api.ts` (commit 1, SDD dashboard-features-quotes).
 * No refactorizar lógica — mover, no re-escribir.
 * Depende de `apiFetch` central para no duplicar refresh/token coalescing.
 */

import { apiFetch } from "@/lib/api";

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
  currency: string;
  isFavorite?: boolean;
}

export interface PanelSummary {
  market: string;
  assetType: string;
  totalVariationPct: number;
  updatedAt: string;
  isRealtime: boolean;
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
  name?: string;
  bid?: number | null;
  ask?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  volume?: number | null;
}

export const quotesApi = {
  async getPanel(
    market: string,
    assetType: string,
    page = 1,
    pageSize = 25,
    q?: string
  ): Promise<PanelResponse> {
    const query = q ? `&q=${encodeURIComponent(q)}` : "";
    return apiFetch(`/quotes/panel/${market}/${assetType}?page=${page}&pageSize=${pageSize}${query}`);
  },

  async getQuote(symbol: string, market: string): Promise<{ quote: Quote }> {
    return apiFetch(`/quotes/${symbol}?market=${market}`);
  },

  async getQuoteHistory(
    symbol: string,
    market: string,
    days = 90
  ): Promise<{ history: { date: string; close: number }[] }> {
    return apiFetch(`/quotes/${symbol}/history?days=${days}&market=${market}`);
  },
};
