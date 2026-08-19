// ============================================================
// analysis-service.ts — facade que compone los 5 servicios
// (fundamentals, consensus, news, screener, backtest) vía DI
// Insights via Promise.allSettled + 15s AbortController
// Cada bloque → InsightBlock {status:"ok"|"error", data:T|null, cached, source, error?}
// ============================================================

import { getFundamentals } from "./fundamentals.js";
import { getConsensus } from "./consensus.js";
import { getNews, getNewsById as getNewsByIdFn, fetchNewsFeed, getNewsFeed } from "./news.js";
import { getScreener } from "./screener.js";
import { runBacktest as runBacktestFn } from "./backtest.js";
import { resolveAnalysisSymbols } from "./symbol.js";
import type {
  AnalysisEnvelope,
  AnalysisMarket,
  AnalysisOpts,
  BacktestData,
  ConsensusData,
  FundamentalsData,
  InsightBlock,
  InsightsData,
  NewsData,
  NewsItem,
  ScreenerRow,
} from "./types.js";

export type { BacktestData };

export interface AnalysisService {
  fundamentals(symbol: string, opts?: AnalysisOpts): Promise<AnalysisEnvelope<FundamentalsData>>;
  consensus(symbol: string, opts?: AnalysisOpts): Promise<AnalysisEnvelope<ConsensusData>>;
  news(symbol: string, opts?: AnalysisOpts): Promise<AnalysisEnvelope<NewsData>>;
  newsFeed(limit?: number, opts?: { signal?: AbortSignal }): Promise<NewsItem[]>;
  newsById(id: string, opts?: { signal?: AbortSignal }): Promise<AnalysisEnvelope<NewsItem>>;
  screener(opts?: { market?: "bcba" | "us"; signal?: AbortSignal }): Promise<AnalysisEnvelope<ScreenerRow[]>>;
  backtest(
    symbol: string,
    opts?: AnalysisOpts & { range?: "1y" | "5y"; benchmark?: string | null },
  ): Promise<AnalysisEnvelope<BacktestData>>;
  runBacktest(
    params: { symbol: string; market?: AnalysisMarket; range?: "1y" | "5y"; benchmark?: string | null },
    signal?: AbortSignal,
  ): Promise<AnalysisEnvelope<BacktestData>>;
  insights(symbol: string, opts?: AnalysisOpts): Promise<InsightsData>;
  getInsights(symbol: string, opts?: AnalysisOpts): Promise<InsightsData>;
  getNewsById(id: string, opts?: { signal?: AbortSignal }): Promise<AnalysisEnvelope<NewsItem>>;
  getScreener(market?: "bcba" | "us", opts?: { signal?: AbortSignal }): Promise<AnalysisEnvelope<ScreenerRow[]>>;
}

function mapToErrorMessage(status: string): string {
  if (status === "symbol_not_found") return "Símbolo no encontrado";
  if (status === "rate_limited") return "Rate limit";
  if (status === "down") return "Fuente no responde";
  return "Fuente no responde";
}

function toInsightBlock<T>(envelope: AnalysisEnvelope<T>, fallbackSource: string): InsightBlock<T> {
  if (envelope.status === "ok") {
    return {
      status: "ok",
      data: envelope.data,
      cached: envelope.cached,
      source: envelope.source || fallbackSource,
    };
  }
  return {
    status: "error",
    data: null,
    cached: envelope.cached ?? false,
    source: envelope.source || fallbackSource,
    error: envelope.error ?? mapToErrorMessage(envelope.status),
  };
}

function toErrorBlock<T>(fallbackSource: string, errorMsg = "Fuente no responde"): InsightBlock<T> {
  return { status: "error", data: null, cached: false, source: fallbackSource, error: errorMsg };
}

export class AnalysisServiceImpl implements AnalysisService {
  async fundamentals(symbol: string, opts?: AnalysisOpts): Promise<AnalysisEnvelope<FundamentalsData>> {
    return getFundamentals(symbol, opts as never);
  }

  async consensus(symbol: string, opts?: AnalysisOpts): Promise<AnalysisEnvelope<ConsensusData>> {
    return getConsensus(symbol, opts as never);
  }

  async news(symbol: string, opts?: AnalysisOpts): Promise<AnalysisEnvelope<NewsData>> {
    return getNews(symbol, opts as never);
  }

  async newsFeed(limit = 5, opts?: { signal?: AbortSignal }): Promise<NewsItem[]> {
    return fetchNewsFeed(limit, opts?.signal);
  }

  // Alias for getNewsFeed
  async getNewsFeedAlias(limit = 5, opts?: { signal?: AbortSignal }): Promise<NewsItem[]> {
    return getNewsFeed(limit, opts?.signal);
  }

  async newsById(id: string, opts?: { signal?: AbortSignal }): Promise<AnalysisEnvelope<NewsItem>> {
    return getNewsByIdFn(id, opts?.signal);
  }

  async getNewsById(id: string, opts?: { signal?: AbortSignal }): Promise<AnalysisEnvelope<NewsItem>> {
    return this.newsById(id, opts);
  }

  async screener(opts: { market?: "bcba" | "us"; signal?: AbortSignal; query?: string } = {}): Promise<AnalysisEnvelope<ScreenerRow[]>> {
    const market = opts.market ?? "bcba";
    const queryOpts: { signal?: AbortSignal; query?: string } = {};
    if (opts.signal) queryOpts.signal = opts.signal;
    if (opts.query) queryOpts.query = opts.query;
    return getScreener(market, Object.keys(queryOpts).length ? queryOpts : undefined);
  }

  async getScreener(
    market: "bcba" | "us" = "bcba",
    opts: { signal?: AbortSignal; query?: string } | string = {},
  ): Promise<AnalysisEnvelope<ScreenerRow[]>> {
    if (typeof opts === "string") return getScreener(market, opts);
    const queryOpts: { signal?: AbortSignal; query?: string } = {};
    if ((opts as { signal?: AbortSignal }).signal) queryOpts.signal = (opts as { signal?: AbortSignal }).signal;
    if ((opts as { query?: string }).query) queryOpts.query = (opts as { query?: string }).query;
    return getScreener(market, Object.keys(queryOpts).length ? queryOpts : undefined);
  }

  async backtest(
    symbol: string,
    opts: AnalysisOpts & { range?: "1y" | "5y"; benchmark?: string | null } = {},
  ): Promise<AnalysisEnvelope<BacktestData>> {
    return runBacktestFn({ symbol, market: opts.market, range: opts.range, benchmark: opts.benchmark }, opts.signal);
  }

  async runBacktest(
    params: { symbol: string; market?: AnalysisMarket; range?: "1y" | "5y"; benchmark?: string | null },
    signal?: AbortSignal,
  ): Promise<AnalysisEnvelope<BacktestData>> {
    return runBacktestFn(params, signal);
  }

  async insights(symbol: string, opts?: AnalysisOpts): Promise<InsightsData> {
    const market = opts?.market;
    // Resolve market for response field (si no market, inferir via symbol)
    let marketOut: string = market ?? "bcba";
    try {
      const resolved = resolveAnalysisSymbols(symbol, market);
      marketOut = resolved.marketDetailed;
    } catch {
      // market inválido → lo deja zod decidir en ruta, acá usamos el input tal cual
      marketOut = market ?? "bcba";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const onOuterAbort = () => controller.abort();
    opts?.signal?.addEventListener("abort", onOuterAbort, { once: true });

    // Merge signals: outer signal + timeout controller
    const signal = controller.signal;

    const results = await Promise.allSettled([
      getFundamentals(symbol, { market: market as AnalysisMarket, signal } as AnalysisOpts),
      getConsensus(symbol, { market: market as AnalysisMarket, signal } as AnalysisOpts),
      getNews(symbol, { market: market as AnalysisMarket, signal } as AnalysisOpts),
    ]);

    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", onOuterAbort);

    const toBlock = (
      settled: PromiseSettledResult<AnalysisEnvelope<unknown>>,
      fallbackSource: string,
    ): InsightBlock<unknown> => {
      if (settled.status === "fulfilled") {
        const env = settled.value as AnalysisEnvelope<unknown>;
        return toInsightBlock(env as AnalysisEnvelope<unknown>, fallbackSource) as InsightBlock<unknown>;
      }
      // rejected → timeout/abort
      const reason = (settled.reason as Error | undefined)?.message ?? "";
      const isAbort = reason.toLowerCase().includes("abort") || (settled.reason as { name?: string })?.name === "AbortError";
      return toErrorBlock(fallbackSource, isAbort ? "Timeout 15s" : "Fuente no responde") as InsightBlock<unknown>;
    };

    const fundamentals = toBlock(results[0], "yahoo") as InsightBlock<FundamentalsData>;
    const consensus = toBlock(results[1], "tradingview") as InsightBlock<ConsensusData>;
    const newsBlock = toBlock(results[2], "tradingview") as InsightBlock<NewsData>;

    return {
      symbol: symbol.toUpperCase(),
      market: marketOut,
      generatedAt: new Date().toISOString(),
      insights: {
        fundamentals,
        consensus,
        news: newsBlock,
      },
    };
  }

  async getInsights(symbol: string, opts?: AnalysisOpts): Promise<InsightsData> {
    return this.insights(symbol, opts);
  }
}
