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

import {
  INSTRUMENT_NAMES,
  getBaseSymbol,
  getInstrumentDisplayName,
  normalizeSymbol,
} from "../iol/instrumentNames.js";

export type Market = "bcba" | "nyse" | "nasdaq";

export const MARKETS: readonly Market[] = ["bcba", "nyse", "nasdaq"] as const;

export function isMarket(value: unknown): value is Market {
  return typeof value === "string" && (MARKETS as readonly string[]).includes(value);
}

/**
 * true si el instrumento local es un CEDEAR (catálogo INSTRUMENT_NAMES).
 * Considera variantes C/D con base CEDEAR (AAPLC/AAPLD → AAPL).
 * Usa getBaseSymbol para normalizar sufijo C/D antes de chequear CEDEAR.
 */
export function isCedear(symbol: string): boolean {
  const norm = normalizeSymbol(symbol);
  if (!norm) return false;
  const direct = INSTRUMENT_NAMES[norm];
  if (direct !== undefined && direct.includes("CEDEAR")) return true;
  const base = getBaseSymbol(norm);
  if (base !== norm) {
    const baseName = INSTRUMENT_NAMES[base];
    if (baseName !== undefined && baseName.includes("CEDEAR")) return true;
  }
  return false;
}

export function mapMarketToYahoo(symbol: string, market?: Market): string {
  if (market !== undefined && !isMarket(market)) {
    throw new Error(`Mercado inválido: ${String(market)}`);
  }
  const norm = normalizeSymbol(symbol);
  // Para CEDEARs, el subyacente Yahoo es el base sin sufijo C/D (AAPLC → AAPL).
  // Para no-CEDEARs, mantener símbolo tal cual.
  const yahooBase = isCedear(norm) ? getBaseSymbol(norm) : norm;
  if (market === "bcba") return `${yahooBase}.BA`;
  if (market === "nyse" || market === "nasdaq") return yahooBase;
  return isCedear(norm) ? yahooBase : `${yahooBase}.BA`;
}

export interface ResolvedSymbol {
  yahooSymbol: string;
  /** Nombre del instrumento LOCAL (catálogo) — null si no está catalogado */
  targetName: string | null;
}

export function resolveAnalysisSymbol(symbol: string, market?: Market): ResolvedSymbol {
  const norm = normalizeSymbol(symbol);
  const display = getInstrumentDisplayName(norm);
  const isKnown = display !== norm;
  return {
    yahooSymbol: mapMarketToYahoo(norm, market),
    targetName: isKnown ? display : null,
  };
}
