/**
 * Feature `analisis` — fuente única para analysisApi + screenerApi.
 * Extraído de lib/api.ts (SDD dashboard-features-resto C4).
 * Mover, no duplicar. Importa apiFetch desde lib/api-client para evitar ciclo con shim.
 * Nota: NewsItem/NewsData/NewsProvider e InsightsData viven aquí en C4 para mantener tsc verde;
 *       en C5 se moverán a features/noticias como fuente única y este archivo importará tipos (evitar duplicate export *).
 */

import { apiFetch } from "@/lib/api-client";

// ============================================================
// Análisis profundo — GET /api/analysis/:symbol?market=
// (técnico + fundamental + señal, fuente Yahoo Finance)
// ============================================================

export type AnalysisMarket = "bcba" | "nyse" | "nasdaq";

export interface AnalysisMacd {
  macd: number;
  signal: number;
  histogram: number;
  prevHistogram: number | null;
}

export interface AnalysisTechnicals {
  price: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macd: AnalysisMacd | null;
  volumeRatio: number | null;
  position52w: number | null;
  trend: number | null;
}

export interface AnalysisFundamentals {
  pe: number | null;
  eps: number | null;
  beta: number | null;
  margin: number | null;
  roe: number | null;
  debtEquity: number | null;
  dividendYield: number | null;
  marketCap: number | null;
}

export interface AnalysisSignalFactor {
  id: string;
  label: string;
  weight: number;
  score: number;
  detail: string;
}

export interface AnalysisSignal {
  score: number;
  verdict: "bullish" | "neutral" | "bearish";
  breakdown: AnalysisSignalFactor[];
}

export interface Analysis {
  symbol: string;
  tickerYahoo: string;
  market: AnalysisMarket | null;
  name: string | null;
  status: "ok" | "symbol_not_found" | "rate_limited" | "down";
  price: number | null;
  changePct: number | null;
  currency: string | null;
  range52w: { low: number | null; high: number | null };
  isMarketClosed: boolean;
  lastCloseDate: string | null;
  cached: boolean;
  stale?: boolean;
  technicals: AnalysisTechnicals | null;
  fundamentals: AnalysisFundamentals | null;
  signal: AnalysisSignal | null;
  series: { date: string; close: number }[];
  summary: string;
}

// ============================================================
// Portfolio-analysis — Insights (Fase A/C) — envelope canónico
// spec 0.1: data T|null, cached boolean, source string, error?
// Backend: GET /api/analysis/:symbol/insights?market=bcba|nyse|nasdaq
// ============================================================

export type InsightBlockStatus = "ok" | "error";

export interface InsightBlock<T> {
  status: InsightBlockStatus;
  data: T | null;
  cached: boolean;
  source: string;
  error?: string;
}

export interface FundamentalsData {
  source: "yahoo" | "simplywallst";
  pe: number | null;
  eps: number | null;
  beta: number | null;
  margin: number | null;
  roe: number | null;
  debtEquity: number | null;
  dividendYield: number | null;
  marketCap: number | null;
}

export interface ConsensusData {
  source: "tradingview";
  targetHigh: number | null;
  targetLow: number | null;
  targetAvg: number | null;
  recommendation: "buy" | "overweight" | "hold" | "underweight" | "sell" | null;
  rating: { buys: number | null; holds: number | null; sells: number | null } | null;
  nextEarningsDate: string | null;
  currency: string | null;
}

export type NewsProvider = "gnews" | "finnhub" | "tradingview" | "yahoo";

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  symbol: string | null;
  summary: string | null;
  /** Canonical image field (primary). Null when provider has no image. */
  image?: string | null;
  /** Alias for image — legacy consumers reading imageUrl */
  imageUrl?: string | null;
  /** Canonical long description (GNews description / Finnhub summary) */
  description?: string | null;
  /** Full body when available (GNews content) */
  content?: string | null;
  /** Alias for url (legacy consumers using link) */
  link?: string;
  /** Origin provider of this item */
  provider?: NewsProvider;
  /** True when fallback degraded (TV title-only, quota hit) */
  degraded?: boolean;
}

export interface NewsData {
  source: NewsProvider;
  items: NewsItem[];
  degraded?: boolean;
}

export interface InsightsData {
  symbol: string;
  market: string;
  generatedAt: string;
  insights: {
    fundamentals: InsightBlock<FundamentalsData>;
    consensus: InsightBlock<ConsensusData>;
    news: InsightBlock<NewsData>;
  };
}

export interface ScreenerRow {
  symbol: string;
  name: string | null;
  market: "bcba" | "us";
  price: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  pe: number | null;
}

export const analysisApi = {
  async getAnalysis(symbol: string, market?: AnalysisMarket): Promise<{ analysis: Analysis }> {
    const query = market ? `?market=${market}` : "";
    return apiFetch(`/analysis/${encodeURIComponent(symbol)}${query}`);
  },

  async getInsights(symbol: string, market?: AnalysisMarket): Promise<InsightsData> {
    const q = market ? `?market=${market}` : "";
    return apiFetch<InsightsData>(`/analysis/${encodeURIComponent(symbol)}/insights${q}`);
  },
};

export const screenerApi = {
  async getScreener(
    market: "bcba" | "us" = "bcba",
    query?: string,
  ): Promise<{ screener: ScreenerRow[]; rows: ScreenerRow[]; count: number; cached: boolean; source: string; market: string }> {
    const qs = new URLSearchParams({ market });
    if (query?.trim()) qs.set("q", query.trim());
    return apiFetch(`/analysis/screener?${qs.toString()}`);
  },
};
