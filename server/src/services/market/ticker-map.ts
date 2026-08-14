// ============================================================
// Mapeo ticker local → símbolo Yahoo Finance
//
// - market=bcba   → `${sym}.BA`
// - market nyse|nasdaq → símbolo pelado (analiza el SUBYACENTE)
// - sin market     → CEDEAR (nombre del catálogo contiene
//                    "CEDEAR") → subyacente pelado; si no, BCBA
// - market explícito SIEMPRE sobreescribe la resolución automática
// - enum inválido → Error (los límites zod rechazan antes con 400)
// ============================================================

import { INSTRUMENT_NAMES } from "../iol/instrumentNames.js";

export type Market = "bcba" | "nyse" | "nasdaq";

export const MARKETS: readonly Market[] = ["bcba", "nyse", "nasdaq"] as const;

export function isMarket(value: unknown): value is Market {
  return typeof value === "string" && (MARKETS as readonly string[]).includes(value);
}

/** true si el instrumento local es un CEDEAR (catálogo INSTRUMENT_NAMES) */
export function isCedear(symbol: string): boolean {
  return (INSTRUMENT_NAMES[symbol] ?? "").includes("CEDEAR");
}

export function mapMarketToYahoo(symbol: string, market?: Market): string {
  if (market !== undefined && !isMarket(market)) {
    throw new Error(`Mercado inválido: ${String(market)}`);
  }
  if (market === "bcba") return `${symbol}.BA`;
  if (market === "nyse" || market === "nasdaq") return symbol;
  return isCedear(symbol) ? symbol : `${symbol}.BA`;
}

export interface ResolvedSymbol {
  yahooSymbol: string;
  /** Nombre del instrumento LOCAL (catálogo) — null si no está catalogado */
  targetName: string | null;
}

export function resolveAnalysisSymbol(symbol: string, market?: Market): ResolvedSymbol {
  return {
    yahooSymbol: mapMarketToYahoo(symbol, market),
    targetName: INSTRUMENT_NAMES[symbol] ?? null,
  };
}
