// ============================================================
// backtest.ts — Yahoo chart + metrics.ts (spec A.6, D4)
// TTL none (compute on demand, reusa fetchChart cacheado)
// Reusa fetchChart (.BA via resolveAnalysisSymbols yahoo key)
// + metrics: periodReturn, annualizedVolatility, sharpe, maxDrawdown
// BacktestData shape: {series, metrics, benchmark?} (types.ts)
// También expone alias legacy: symbol, period, returns, volatility, sharpe, maxDrawdown, benchmarkComparison
// Nunca lanza salvo market inválido (throw). Otros fallos → envelope status.
// benchmark failure → degrade (main result usable sin benchmark).
// ============================================================

import { fetchChart } from "../market/yahoo.js";
import { resolveAnalysisSymbols } from "./symbol.js";
import {
  annualizedVolatility,
  dailyReturns,
  maxDrawdown,
  periodReturn,
  sharpe as sharpeFn,
} from "../reports/metrics.js";
import type { AnalysisEnvelope, AnalysisMarket, BacktestData, BacktestMetrics } from "./types.js";

export type BacktestRange = "1y" | "5y";
export type BacktestResult = BacktestData;

export interface RunBacktestParams {
  symbol: string;
  market?: AnalysisMarket;
  range?: BacktestRange;
  benchmark?: string | null;
}

const DEFAULT_BENCHMARK = "^MERV";
const TRADING_DAYS = 252;

function mapStatusToError(status: string): string {
  if (status === "symbol_not_found") return "Símbolo no encontrado";
  if (status === "rate_limited") return "Rate limit";
  return "Fuente no responde";
}

function computeMetrics(closes: number[]): BacktestMetrics {
  const totalReturn = periodReturn(closes);
  const n = closes.length;
  const annualizedReturn = n >= 2 ? Math.pow(1 + totalReturn, TRADING_DAYS / n) - 1 : 0;
  const returns = dailyReturns(closes);
  return {
    totalReturn,
    annualizedReturn,
    volatility: annualizedVolatility(returns),
    sharpe: sharpeFn(returns),
    maxDrawdown: maxDrawdown(closes),
  };
}

function resolveRunArgs(
  symbolOrParams: string | RunBacktestParams,
  marketOrSignal?: AnalysisMarket | string | AbortSignal | { market?: AnalysisMarket; signal?: AbortSignal },
  maybeSignal?: AbortSignal,
): { symbol: string; market?: AnalysisMarket; range: BacktestRange; benchmark: string | null; signal?: AbortSignal } {
  let symbol: string;
  let market: AnalysisMarket | undefined;
  let range: BacktestRange = "1y";
  let benchmark: string | null = DEFAULT_BENCHMARK;
  let signal: AbortSignal | undefined;

  if (typeof symbolOrParams === "string") {
    symbol = symbolOrParams;
    if (marketOrSignal && typeof marketOrSignal === "object" && "aborted" in (marketOrSignal as AbortSignal)) {
      signal = marketOrSignal as AbortSignal;
    } else if (typeof marketOrSignal === "string") {
      market = marketOrSignal as AnalysisMarket;
      signal = maybeSignal;
    } else if (marketOrSignal && typeof marketOrSignal === "object") {
      const o = marketOrSignal as { market?: AnalysisMarket; range?: BacktestRange; benchmark?: string | null; signal?: AbortSignal };
      market = o.market;
      if (o.range) range = o.range;
      if (o.benchmark !== undefined) benchmark = o.benchmark as string | null;
      signal = o.signal ?? maybeSignal;
    }
  } else {
    const p = symbolOrParams as RunBacktestParams;
    symbol = p.symbol;
    market = p.market;
    if (p.range) range = p.range;
    if (p.benchmark !== undefined) benchmark = p.benchmark as string | null;
    // second arg may be signal
    if (marketOrSignal && typeof marketOrSignal === "object" && "aborted" in (marketOrSignal as AbortSignal)) {
      signal = marketOrSignal as AbortSignal;
    } else if (marketOrSignal && typeof marketOrSignal === "object") {
      const o = marketOrSignal as { signal?: AbortSignal };
      signal = o.signal;
    } else {
      signal = maybeSignal;
    }
  }

  // normalize range
  if (range !== "1y" && range !== "5y") range = "1y";
  // benchmark: if explicitly undefined treat as default, if null → no benchmark
  return { symbol, market, range, benchmark, signal };
}

/**
 * Backtest buy&hold via Yahoo chart.
 * @param symbolOrParams - ticker or {symbol, market, range, benchmark}
 * @param marketOrSignal - market string or AbortSignal or opts
 * @param maybeSignal - AbortSignal when second arg is market string
 * @returns AnalysisEnvelope<BacktestData> — status ok|symbol_not_found|rate_limited|down, data T|null
 */
export async function runBacktest(
  symbolOrParams: string | RunBacktestParams,
  marketOrSignal?: AnalysisMarket | string | AbortSignal | { market?: AnalysisMarket; range?: BacktestRange; benchmark?: string | null; signal?: AbortSignal },
  maybeSignal?: AbortSignal,
): Promise<AnalysisEnvelope<BacktestData>> {
  const { symbol, market, range, benchmark, signal } = resolveRunArgs(symbolOrParams as never, marketOrSignal as never, maybeSignal);

  if (typeof symbol !== "string" || symbol.trim().length === 0) {
    return { status: "symbol_not_found", data: null, cached: false, source: "yahoo", error: "Símbolo no encontrado" };
  }

  // resolve yahoo symbol (lanza si market inválido → propagar throw spec A.1)
  const { yahoo } = resolveAnalysisSymbols(symbol, market as AnalysisMarket);

  let chartRes: Awaited<ReturnType<typeof fetchChart>>;
  try {
    chartRes = await fetchChart(yahoo, range, signal);
  } catch {
    return { status: "down", data: null, cached: false, source: "yahoo", error: "Fuente no responde" };
  }

  if (chartRes.status !== "ok" || !chartRes.data) {
    const status = chartRes.status as AnalysisEnvelope<BacktestData>["status"];
    return {
      status,
      data: null,
      cached: false,
      source: "yahoo",
      error: mapStatusToError(status),
    };
  }

  const { dates, closes } = chartRes.data;
  if (!closes || closes.length < 2) {
    return { status: "down", data: null, cached: false, source: "yahoo", error: "Fuente no responde" };
  }

  // Build series (align dates/closes, skip non-finite)
  const series: { date: string; close: number }[] = [];
  for (let i = 0; i < dates.length; i++) {
    const c = closes[i];
    if (c == null || !Number.isFinite(c)) continue;
    series.push({ date: dates[i], close: c });
  }
  if (series.length < 2) {
    return { status: "down", data: null, cached: false, source: "yahoo", error: "Fuente no responde" };
  }

  const closesClean = series.map((p) => p.close);
  const metrics = computeMetrics(closesClean);

  // Base data (canonical shape)
  const data: BacktestData & Record<string, unknown> = {
    series,
    metrics,
    // legacy alias fields (spec prompt: returns, volatility, sharpe, maxDrawdown, period, symbol, benchmarkComparison)
    symbol: symbol.toUpperCase(),
    period: range,
    returns: metrics.totalReturn,
    volatility: metrics.volatility,
    sharpe: metrics.sharpe,
    maxDrawdown: metrics.maxDrawdown,
  };

  // Benchmark degrade: try fetch, if fails keep main result usable
  if (benchmark) {
    try {
      const benchRes = await fetchChart(benchmark, range, signal);
      if (benchRes.status === "ok" && benchRes.data && benchRes.data.closes.length >= 2) {
        const benchCloses: number[] = [];
        for (let i = 0; i < benchRes.data.closes.length; i++) {
          const c = benchRes.data.closes[i];
          if (c != null && Number.isFinite(c)) benchCloses.push(c);
        }
        if (benchCloses.length >= 2) {
          const benchMetrics = computeMetrics(benchCloses);
          (data as BacktestData).benchmark = { name: benchmark, metrics: benchMetrics };
          // legacy alias
          (data as Record<string, unknown>).benchmarkComparison = { name: benchmark, metrics: benchMetrics };
        }
      }
      // any non-ok benchmark → degrade silently (no benchmark field)
    } catch {
      // network abort/timeout for benchmark → degrade
    }
  }

  return {
    status: "ok",
    data: data as BacktestData,
    cached: Boolean(chartRes.cached),
    source: "yahoo",
  };
}

// Aliases for callers que esperan nombres alternativos
export const fetchBacktest = runBacktest;
export const getBacktest = runBacktest;
