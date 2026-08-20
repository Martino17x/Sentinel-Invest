/**
 * Cálculo puro del CCL implícito por CEDEAR.
 *
 *   ccl = cedearArs * ratioCedearsPerShare / underlyingUsd
 *
 * Funciones puras, sin I/O. Ver `cedear-ratios.ts` para la tabla de ratios.
 */

// ---------------------------------------------------------------------------
// calcCcl
// ---------------------------------------------------------------------------

/**
 * Calcula el CCL implícito de un CEDEAR.
 *
 * @param cedearArs - Precio del CEDEAR en ARS (último operado BYMA)
 * @param underlyingUsd - Precio del subyacente en USD (Yahoo Finance)
 * @param ratio - CEDEARs por acción subyacente (entero >0, ver cedear-ratios.ts)
 * @returns CCL en ARS por USD, o `null` si `underlyingUsd === 0` o `ratio <= 0`
 *
 * @example
 * calcCcl(32100, 230, 10) // ≈1395.65  (AAPL)
 * calcCcl(4820, 36, 10)   // ≈1338.88  (GGAL ADR)
 */
export function calcCcl(
  cedearArs: number,
  underlyingUsd: number,
  ratio: number,
): number | null {
  if (!Number.isFinite(cedearArs) || !Number.isFinite(underlyingUsd) || !Number.isFinite(ratio)) {
    return null;
  }
  if (underlyingUsd === 0 || ratio <= 0) return null;
  return (cedearArs * ratio) / underlyingUsd;
}

// ---------------------------------------------------------------------------
// calcPromedio / calcMedianCcl — mediana de CCLs válidos
// ---------------------------------------------------------------------------

/**
 * Mediana de una lista de CCLs. Ignora valores no finitos / null ya filtrados fuera.
 * Lista vacía → null.
 * Impar → elemento central ordenado; Par → promedio de los dos centrales.
 */
export function calcPromedio(ccls: number[]): number | null {
  const vals = ccls.filter((v) => Number.isFinite(v));
  if (vals.length === 0) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Alias requerido por tasks spec — idéntico a `calcPromedio` (mediana). */
export const calcMedianCcl = calcPromedio;

// ---------------------------------------------------------------------------
// calcSpread
// ---------------------------------------------------------------------------

/**
 * Desvío porcentual de un CCL respecto del promedio.
 *   spread = (ccl - promedio) / promedio * 100
 *
 * @returns porcentaje (ej. +2.5 significa 2.5% por encima del promedio), o null si promedio es 0/null/no finito
 */
export function calcSpread(ccl: number, promedio: number): number | null {
  if (!Number.isFinite(ccl) || !Number.isFinite(promedio)) return null;
  if (promedio === 0) return null;
  return ((ccl - promedio) / promedio) * 100;
}
