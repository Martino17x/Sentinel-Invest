// ============================================================
// Indicadores técnicos — FUNCIONES PURAS, nunca lanzan.
//
// Datos insuficientes → null (nunca NaN ni resultados basura).
// Parámetros estándar del corpus del agente (analisis-tecnico):
// RSI-14 Wilder, MACD 12/26/9, SMA 20/50/200.
// ============================================================

/** Promedio móvil simple de los últimos `n` valores (null si faltan) */
export function sma(prices: number[], n: number): number | null {
  if (n <= 0 || prices.length < n) return null;
  const window = prices.slice(-n);
  return window.reduce((a, b) => a + b, 0) / n;
}

/**
 * RSI de Wilder con suavizado exponencial. Min ~30 barras (2×periodo
 * + 2) para que el indicador esté estabilizado. 100 = solo ganancias,
 * 0 = solo pérdidas, 50 = plano.
 */
export function rsi(prices: number[], period = 14): number | null {
  const minBars = period * 2 + 2;
  if (prices.length < minBars) return null;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = prices[i] - prices[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < prices.length; i++) {
    const delta = prices[i] - prices[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return avgGain > 0 ? 100 : 50;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Serie de EMA con seed = SMA de los primeros `period` valores */
function emaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
  /** Histograma de la barra ANTERIOR (null si no hay datos) — para detectar cruces */
  prevHistogram: number | null;
}

/**
 * MACD 12/26/9: línea MACD = EMA12 − EMA26, señal = EMA9 de la línea,
 * histograma = MACD − señal. Min slow + signal − 1 barras (34).
 */
export function macd(prices: number[], fast = 12, slow = 26, signal = 9): MacdResult | null {
  const minBars = slow + signal - 1;
  if (prices.length < minBars) return null;

  const emaFast = emaSeries(prices, fast);
  const emaSlow = emaSeries(prices, slow);

  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macdLine.push(emaFast[i] - emaSlow[i]);
  }

  // La señal se calcula solo sobre los valores válidos de la línea MACD
  // (desde el índice slow-1) y se vuelve a alinear al final de la serie.
  const macdVals = macdLine.slice(slow - 1);
  const signalSeries = emaSeries(macdVals, signal);

  const last = prices.length - 1;
  const lastMacd = macdLine[last];
  const lastSignal = signalSeries[signalSeries.length - 1];
  const hist = lastMacd - lastSignal;

  // Histograma de la barra anterior: existe porque minBars garantiza
  // señal válida en el índice slow+signal-2 (0-based) y una barra antes.
  const prevSignal = signalSeries[signalSeries.length - 2];
  const prevHistogram = Number.isFinite(prevSignal) ? macdLine[last - 1] - prevSignal : null;

  return { macd: lastMacd, signal: lastSignal, histogram: hist, prevHistogram };
}

/**
 * Ratio de volumen: promedio de los últimos 5 días / promedio de los
 * 20 días PREVIOS a esos 5. >1 = volumen elevado.
 */
export function volumeRatio(volumes: number[], window = 20): number | null {
  if (volumes.length < window + 5) return null;
  const recent = volumes.slice(-5);
  const previous = volumes.slice(-(window + 5), -5);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / 5;
  const avgPrev = previous.reduce((a, b) => a + b, 0) / window;
  if (avgPrev === 0) return null;
  return avgRecent / avgPrev;
}

/** Posición del precio dentro del rango 52 semanas, 0..1 (clamp). null si falta algo. */
export function positionIn52w(
  price: number | null,
  low: number | null,
  high: number | null
): number | null {
  if (
    price == null || low == null || high == null ||
    !Number.isFinite(price) || !Number.isFinite(low) || !Number.isFinite(high)
  ) {
    return null;
  }
  if (high <= low) return null;
  return Math.min(1, Math.max(0, (price - low) / (high - low)));
}
