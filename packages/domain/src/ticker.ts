/**
 * Normalización de tickers.
 *
 * Hoja pura del package: cero imports.
 */

/**
 * Normaliza símbolo: trim + uppercase.
 * Vacío/null → "".
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol || typeof symbol !== "string") return "";
  return symbol.trim().toUpperCase();
}
