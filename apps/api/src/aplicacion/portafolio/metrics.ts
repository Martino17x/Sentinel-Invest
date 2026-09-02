// ============================================================
// MÉTRICAS DE CARTERA — funciones PURAS (spec F3-A1, design D11)
//
// Sin DB, sin I/O: reciben arrays planos y devuelven números.
// Testables con node:test. La serie del benchmark (^MERV) la
// provee el caller (fetchYahooDaily del reportBuilder); acá solo
// se correlacionan los retornos.
//
// Convenciones:
//  - Volatilidad: desvío estándar POBLACIONAL (÷n) × √252
//    (252 días hábiles por año; parametrizable).
//  - Sharpe: (media ANUALIZADA − rf ANUAL) / vol ANUALIZADA.
//    rf default 0 (D11: sin fuente confiable de tasa libre de
//    riesgo en ARS hoy).
//  - maxDrawdown y periodReturn devuelven FRACCIONES (0.15 = 15%).
//  - null = "no computable con estos datos" (nunca 0 inventado).
// ============================================================

const TRADING_DAYS_PER_YEAR = 252;

// ============================================================
// Helpers numéricos (poblacionales)
// ============================================================

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function std(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null; // serie constante → varianza 0
  return num / Math.sqrt(dx2 * dy2);
}

// ============================================================
// Métricas públicas
// ============================================================

/** Retornos diarios compuestos de una serie de valores (v[i]/v[i−1] − 1). */
export function dailyReturns(values: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    if (!Number.isFinite(prev) || prev === 0) continue;
    returns.push(values[i] / prev - 1);
  }
  return returns;
}

/**
 * Volatilidad anualizada: std poblacional de los retornos × √periodsPerYear.
 * 0 con menos de 2 retornos (datos insuficientes).
 */
export function annualizedVolatility(
  returns: number[],
  periodsPerYear = TRADING_DAYS_PER_YEAR
): number {
  if (returns.length < 2) return 0;
  return std(returns) * Math.sqrt(periodsPerYear);
}

/**
 * Sharpe anualizado: (media anualizada − rf) / vol anualizada.
 * rf es la tasa ANUAL libre de riesgo (default 0, D11). null si no
 * computable (< 2 retornos o volatilidad 0).
 */
export function sharpe(
  returns: number[],
  opts: { rf?: number; periodsPerYear?: number } = {}
): number | null {
  const rf = opts.rf ?? 0;
  const periodsPerYear = opts.periodsPerYear ?? TRADING_DAYS_PER_YEAR;
  if (returns.length < 2) return null;
  const vol = annualizedVolatility(returns, periodsPerYear);
  if (vol === 0) return null;
  const meanAnnualized = mean(returns) * periodsPerYear;
  return (meanAnnualized - rf) / vol;
}

/**
 * Máxima caída pico→valle como fracción positiva (0.15 = −15%).
 * 0 con menos de 2 valores.
 */
export function maxDrawdown(values: number[]): number {
  if (values.length < 2) return 0;
  let peak = values[0];
  let maxDd = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v > peak) peak = v;
    if (peak > 0 && v < peak) {
      const dd = (peak - v) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

/** Retorno total del período: último/primer − 1. 0 con < 2 valores o primer valor no usable. */
export function periodReturn(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  if (!Number.isFinite(first) || first === 0) return 0;
  return values[values.length - 1] / first - 1;
}

/**
 * Retorno YTD: desde el 1° de enero del año de `now` hasta el último
 * punto del año (usa la primera observación ≥ 1/1 como base). null si
 * no hay puntos del año en curso. `now` es inyectable (default: hoy UTC).
 */
export function ytdReturn(
  points: { date: string; value: number }[],
  opts: { now?: Date } = {}
): number | null {
  const now = opts.now ?? new Date();
  const yearKey = String(now.getUTCFullYear());
  const inYear = points
    .filter((p) => p.date >= `${yearKey}-01-01`)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (inYear.length === 0) return null;
  const first = inYear[0].value;
  if (!Number.isFinite(first) || first === 0) return 0;
  return inYear[inYear.length - 1].value / first - 1;
}

/**
 * Correlación de Pearson entre los RETORNOS DIARIOS de dos series de
 * valores, alineadas por el FINAL (se truncan a la longitud común).
 * null si hay < 2 retornos alineados o alguna serie es constante.
 */
export function correlation(valuesA: number[], valuesB: number[]): number | null {
  const a = dailyReturns(valuesA);
  const b = dailyReturns(valuesB);
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  return pearson(a.slice(a.length - n), b.slice(b.length - n));
}