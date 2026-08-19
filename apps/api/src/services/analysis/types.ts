// ============================================================
// Analysis shared types — portfolio-analysis fase A
// Contrato canónico spec v2 (FIX #1 + FIX #4)
// data: T | null NUNCA optional, cached:boolean, source:string
// ============================================================

import type { MarketStatus } from "../market/yahoo.js";

export type AnalysisStatus = MarketStatus; // "ok" | "symbol_not_found" | "rate_limited" | "down"

export interface AnalysisEnvelope<T> {
  status: AnalysisStatus;
  data: T | null;
  cached: boolean;
  source: string;
  error?: string;
}

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

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  symbol: string | null;
  summary: string | null;
}

export interface NewsData {
  source: "tradingview" | "yahoo";
  items: NewsItem[];
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

export interface BacktestMetrics {
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpe: number | null;
  maxDrawdown: number;
}

export interface BacktestData {
  series: { date: string; close: number }[];
  metrics: BacktestMetrics;
  benchmark?: { name: string; metrics: BacktestMetrics };
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

export type AnalysisMarket = "bcba" | "nyse" | "nasdaq";

export interface AnalysisOpts {
  market?: AnalysisMarket;
  signal?: AbortSignal;
}
