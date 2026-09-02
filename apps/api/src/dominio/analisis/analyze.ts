// ============================================================
// Engine de análisis — analiza UN instrumento y devuelve un objeto
// estructurado completo (técnico + fundamental + señal + resumen).
//
// Flujo: mapMarketToYahoo → fetchChart → indicadores →
// fetchFundamentals → scoreSignal. Compartido entre la ruta
// GET /api/analysis/:symbol, el tool analyze_stock y (vía registry)
// el MCP. Nunca lanza por causas de Yahoo.
// ============================================================

import { fetchChart, fetchFundamentals, type Fundamentals, type MarketStatus } from "./yahoo.js";
import { resolveAnalysisSymbol, type Market } from "./ticker-map.js";
import { rsi, macd, sma, volumeRatio, positionIn52w, type MacdResult } from "./indicators.js";
import { scoreSignal, SIGNAL_WEIGHTS, type SignalResult, type Verdict } from "./signal.js";

export interface AnalysisTechnicals {
  price: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macd: MacdResult | null;
  volumeRatio: number | null;
  position52w: number | null;
  /** Score del factor tendencia (0..100) — 0/100 en los extremos */
  trend: number | null;
}

export interface Analysis {
  symbol: string;
  tickerYahoo: string;
  market: Market | null;
  /** Nombre para mostrar: catálogo local si existe, si no el de Yahoo */
  name: string | null;
  status: MarketStatus;
  price: number | null;
  changePct: number | null;
  currency: string | null;
  range52w: { low: number | null; high: number | null };
  isMarketClosed: boolean;
  lastCloseDate: string | null;
  cached: boolean;
  stale?: boolean;
  technicals: AnalysisTechnicals | null;
  fundamentals: Fundamentals | null;
  signal: SignalResult | null;
  /** Serie diaria de cierres (1y) — para sparkline/overlays en la UI */
  series: { date: string; close: number }[];
  summary: string;
}

export interface AnalyzeOptions {
  market?: Market;
  /** AbortSignal del ejecutor (timeout 15s de tools) — se propaga a los fetch */
  signal?: AbortSignal;
}

// ============================================================
// Formato argentino (resumen en texto plano)
// ============================================================

const esAr = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function fmtPrice(n: number): string {
  return `$${esAr.format(n)}`;
}

function fmtPct(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function verdictLabel(verdict: Verdict): string {
  switch (verdict) {
    case "bullish": return "alcista";
    case "bearish": return "bajista";
    default: return "neutral";
  }
}

function todayLocalKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// ============================================================
// Engine
// ============================================================

export async function analyzeStock(
  symbol: string,
  opts: AnalyzeOptions = {}
): Promise<Analysis> {
  const { yahooSymbol, targetName } = resolveAnalysisSymbol(symbol, opts.market);
  const chart = await fetchChart(yahooSymbol, "1y", opts.signal);

  if (chart.status !== "ok" || !chart.data) {
    return {
      symbol,
      tickerYahoo: yahooSymbol,
      market: opts.market ?? null,
      name: targetName,
      status: chart.status,
      price: null,
      changePct: null,
      currency: null,
      range52w: { low: null, high: null },
      isMarketClosed: false,
      lastCloseDate: null,
      cached: chart.cached ?? false,
      stale: chart.stale,
      technicals: null,
      fundamentals: null,
      signal: null,
      series: [],
      summary: errorSummary(chart.status, symbol),
    };
  }

  const { dates, closes, volumes, meta } = chart.data;
  const lastClose = closes.length > 0 ? closes[closes.length - 1] : null;
  const prevClose = closes.length > 1 ? closes[closes.length - 2] : null;
  const price = meta.regularMarketPrice ?? lastClose;
  const lastCloseDate = dates.length > 0 ? dates[dates.length - 1] : null;

  const changePct =
    lastClose != null && prevClose != null && prevClose !== 0
      ? ((lastClose - prevClose) / prevClose) * 100
      : null;

  const isMarketClosed = lastCloseDate != null && lastCloseDate < todayLocalKey();

  const technicals: AnalysisTechnicals = {
    price,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    rsi: rsi(closes),
    macd: macd(closes),
    volumeRatio: volumeRatio(volumes),
    position52w: positionIn52w(price, meta.fiftyTwoWeekLow, meta.fiftyTwoWeekHigh),
    trend: null,
  };

  const fundamentals = await fetchFundamentals(yahooSymbol, opts.signal);

  const signal = scoreSignal({
    price,
    sma50: technicals.sma50,
    sma200: technicals.sma200,
    rsi: technicals.rsi,
    macd: technicals.macd,
    volumeRatio: technicals.volumeRatio,
    position52w: technicals.position52w,
  });
  if (signal) {
    technicals.trend = signal.breakdown.find((f) => f.id === "trend")?.score ?? null;
  }

  return {
    symbol,
    tickerYahoo: yahooSymbol,
    market: opts.market ?? null,
    name: targetName ?? meta.name,
    status: "ok",
    price,
    changePct,
    currency: meta.currency,
    range52w: { low: meta.fiftyTwoWeekLow, high: meta.fiftyTwoWeekHigh },
    isMarketClosed,
    lastCloseDate,
    cached: chart.cached ?? false,
    stale: chart.stale,
    technicals,
    fundamentals,
    signal,
    series: dates.map((date, i) => ({ date, close: closes[i] })),
    summary: buildSummary({ yahooSymbol, targetName, price, changePct, currency: meta.currency, isMarketClosed, fundamentals, signal, status: chart.status }),
  };
}

// ============================================================
// Resúmenes
// ============================================================

function errorSummary(status: MarketStatus, symbol: string): string {
  switch (status) {
    case "symbol_not_found":
      return `Símbolo ${symbol} no encontrado en Yahoo Finance. Verificá que el ticker exista.`;
    case "rate_limited":
      return "Límite de consultas a Yahoo Finance alcanzado. Probá de nuevo en unos minutos.";
    case "down":
      return "Yahoo Finance no responde en este momento. Probá de nuevo más tarde.";
    default:
      return `No hay datos para ${symbol}.`;
  }
}

function buildSummary(params: {
  yahooSymbol: string;
  targetName: string | null;
  price: number | null;
  changePct: number | null;
  currency: string | null;
  isMarketClosed: boolean;
  fundamentals: Fundamentals | null;
  signal: SignalResult | null;
  status: MarketStatus;
}): string {
  const { yahooSymbol, targetName, price, changePct, currency, isMarketClosed, fundamentals, signal } = params;

  const name = targetName ? `${targetName} (${yahooSymbol})` : yahooSymbol;
  const priceText = price != null ? `${fmtPrice(price)}${currency ? ` ${currency}` : ""}` : "sin precio";
  const changeText = changePct != null ? ` (${fmtPct(changePct)})` : "";
  const firstLine = `${name}: ${priceText}${changeText}`;

  const lines: string[] = [firstLine];

  if (signal) {
    const score = Math.round(signal.score);
    const top = [...signal.breakdown].sort((a, b) => b.score - a.score)[0];
    const topText = top ? ` Factor más fuerte: ${top.label} (${Math.round(top.score)}/100).` : "";
    lines.push(
      `Señal: ${verdictLabel(signal.verdict).toUpperCase()} (${score}/100). Pesos: tendencia ${Math.round(SIGNAL_WEIGHTS.trend * 100)}%, MACD ${Math.round(SIGNAL_WEIGHTS.macd * 100)}%, RSI ${Math.round(SIGNAL_WEIGHTS.rsi * 100)}%, rango 52s ${Math.round(SIGNAL_WEIGHTS.week52 * 100)}%, volumen ${Math.round(SIGNAL_WEIGHTS.volume * 100)}%.${topText}`
    );
  } else if (params.status === "ok") {
    lines.push("Señal: sin datos suficientes.");
  }

  if (!fundamentals) {
    lines.push("Fundamentos no disponibles: Yahoo Finance no respondió (análisis solo técnico).");
  }
  if (isMarketClosed) {
    lines.push("Mercado cerrado: los datos corresponden al último cierre.");
  }

  return lines.join("\n");
}
