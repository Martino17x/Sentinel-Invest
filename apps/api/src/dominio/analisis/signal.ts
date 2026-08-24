// ============================================================
// Señal compuesta — pesos configurables, scoring 0..100
//
//   trend   30%  precio vs SMA50 (50%) + SMA200 (30%) + golden/death (20%)
//   macd    25%  histograma >0 (50%) + cruce señal (50%)
//   rsi     20%  >70 → 0 (sobrecompra), <30 → 100 (sobreventa), lineal entre
//   week52  15%  posición en rango 52 semanas (0..1 → 0..100)
//   volume  10%  ratio ≥1 → 100 (lineal por debajo)
//
// Verdict: score ≥ 60 bullish / ≤ 40 bearish / resto neutral.
// Factor con datos insuficientes (null) → se omite y los pesos de los
// restantes se RENORMALIZAN (la suma vuelve a 1 → score sigue en 0..100).
// Si ningún factor tiene datos → null.
// ============================================================

import type { MacdResult } from "./indicators.js";

export const SIGNAL_WEIGHTS = {
  trend: 0.3,
  macd: 0.25,
  rsi: 0.2,
  week52: 0.15,
  volume: 0.1,
} as const;

export const VERDICT_BULLISH_MIN = 60;
export const VERDICT_BEARISH_MAX = 40;

export type Verdict = "bullish" | "neutral" | "bearish";
export type FactorId = keyof typeof SIGNAL_WEIGHTS;

export interface SignalInput {
  price: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macd: MacdResult | null;
  volumeRatio: number | null;
  position52w: number | null;
}

export interface FactorScore {
  id: FactorId;
  label: string;
  /** Peso ORIGINAL (antes de renorm) — para mostrar en la UI */
  weight: number;
  score: number;
  detail: string;
}

export interface SignalResult {
  score: number;
  verdict: Verdict;
  breakdown: FactorScore[];
}

// ============================================================
// Sub-scores
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** % de distancia vs el SMA → 50±10pp por cada 1% (clamp 0..100) */
function scoreVsSma(price: number, smaValue: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(smaValue) || smaValue === 0) return 50;
  const pct = ((price - smaValue) / smaValue) * 100;
  return clamp(50 + pct * 10, 0, 100);
}

/** Contrarian: RSI alto (sobrecompra) resta, RSI bajo (sobreventa) suma */
function scoreFromRsi(rsiValue: number): number {
  if (rsiValue >= 70) return 0;
  if (rsiValue <= 30) return 100;
  return clamp(175 - 2.5 * rsiValue, 0, 100); // lineal entre (30,100) y (70,0)
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function verdictForScore(score: number): Verdict {
  if (score >= VERDICT_BULLISH_MIN) return "bullish";
  if (score <= VERDICT_BEARISH_MAX) return "bearish";
  return "neutral";
}

// ============================================================
// Factores
// ============================================================

function trendFactor(input: SignalInput): FactorScore | null {
  const { price, sma50, sma200 } = input;
  const parts: { weight: number; score: number }[] = [];
  const labels: string[] = [];

  if (price != null && sma50 != null) {
    parts.push({ weight: 0.5, score: scoreVsSma(price, sma50) });
    labels.push(`vs SMA50 ${fmt(sma50)}`);
  }
  if (price != null && sma200 != null) {
    parts.push({ weight: 0.3, score: scoreVsSma(price, sma200) });
    labels.push(`vs SMA200 ${fmt(sma200)}`);
  }
  if (sma50 != null && sma200 != null) {
    parts.push({ weight: 0.2, score: sma50 > sma200 ? 100 : 0 });
    labels.push(sma50 > sma200 ? "golden cross" : "death cross");
  }
  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = parts.reduce((a, p) => a + p.score * (p.weight / totalWeight), 0);
  return {
    id: "trend",
    label: "Tendencia",
    weight: SIGNAL_WEIGHTS.trend,
    score,
    detail: labels.length > 0 ? labels.join(" · ") : "sin datos",
  };
}

function macdFactor(input: SignalInput): FactorScore | null {
  const macdValue = input.macd;
  if (!macdValue) return null;

  const direction = macdValue.histogram > 0 ? 50 : 0;
  const { prevHistogram, histogram } = macdValue;
  let cross = 50; // sin cruce reciente → neutro
  if (prevHistogram != null) {
    if (prevHistogram <= 0 && histogram > 0) cross = 100; // cruce alcista
    else if (prevHistogram >= 0 && histogram < 0) cross = 0; // cruce bajista
  }

  const crossLabel =
    cross === 100 ? "cruce alcista" : cross === 0 ? "cruce bajista" : "sin cruce";
  return {
    id: "macd",
    label: "MACD",
    weight: SIGNAL_WEIGHTS.macd,
    score: direction + cross * 0.5,
    detail: `histograma ${histogram >= 0 ? "positivo" : "negativo"} · ${crossLabel}`,
  };
}

function rsiFactor(input: SignalInput): FactorScore | null {
  if (input.rsi == null) return null;
  const zone =
    input.rsi >= 70 ? "sobrecompra" : input.rsi <= 30 ? "sobreventa" : "zona neutral";
  return {
    id: "rsi",
    label: "RSI",
    weight: SIGNAL_WEIGHTS.rsi,
    score: scoreFromRsi(input.rsi),
    detail: `RSI ${fmt(input.rsi, 1)} (${zone})`,
  };
}

function week52Factor(input: SignalInput): FactorScore | null {
  if (input.position52w == null) return null;
  return {
    id: "week52",
    label: "Rango 52 semanas",
    weight: SIGNAL_WEIGHTS.week52,
    score: clamp(input.position52w, 0, 1) * 100,
    detail: `posición ${fmt(input.position52w * 100, 0)}% del rango anual`,
  };
}

function volumeFactor(input: SignalInput): FactorScore | null {
  if (input.volumeRatio == null) return null;
  return {
    id: "volume",
    label: "Volumen",
    weight: SIGNAL_WEIGHTS.volume,
    score: clamp(input.volumeRatio, 0, 1) * 100,
    detail: `ratio ${fmt(input.volumeRatio, 2)}x vs promedio 20 días`,
  };
}

// ============================================================
// Score final
// ============================================================

export function scoreSignal(input: SignalInput): SignalResult | null {
  const breakdown = [
    trendFactor(input),
    macdFactor(input),
    rsiFactor(input),
    week52Factor(input),
    volumeFactor(input),
  ].filter((f): f is FactorScore => f !== null);

  if (breakdown.length === 0) return null;

  const totalWeight = breakdown.reduce((a, f) => a + f.weight, 0);
  const score = breakdown.reduce((a, f) => a + f.score * (f.weight / totalWeight), 0);

  return {
    score,
    verdict: verdictForScore(score),
    breakdown,
  };
}
