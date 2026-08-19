// ============================================================
// resolveAnalysisSymbols — normalización central (spec A.1)
// yahoo: bcba → .BA, nyse|nasdaq → pelado, sin market → CEDEAR→pelado else .BA
// tv: BCBA:/NYSE:/NASDAQ: + símbolo, sin market CEDEAR→NASDAQ: else BCBA:
// base: subyacente pelado (CEDEAR→mismo símbolo)
// local: input tal cual (para display/screener)
// Soporta input .BA suffix y BCBA: prefix (normaliza)
// CEDEAR detection vía INSTRUMENT_NAMES (ticker-map.ts)
// ============================================================

import { isCedear, isMarket } from "../market/ticker-map.js";
import type { AnalysisMarket } from "./types.js";

export interface ResolvedAnalysisSymbols {
  local: string;
  yahoo: string;
  tv: string;
  base: string;
  /** Alias para compat con prompt A1 (swsBase === base) */
  swsBase: string;
  /** Mercado normalizado bcba|us (alias extra, no rompe spec) */
  market: "bcba" | "us";
  /** Mercado detallado bcba|nyse|nasdaq (para callers spec) */
  marketDetailed: AnalysisMarket;
}

type Input =
  | string
  | { symbol: string; market?: AnalysisMarket | string };

const MARKETS: readonly AnalysisMarket[] = ["bcba", "nyse", "nasdaq"] as const;

function normalizeBase(inputSymbol: string): string {
  let s = inputSymbol.trim().toUpperCase();
  // strip exchange prefix BCBA:/NYSE:/NASDAQ:
  if (s.includes(":")) {
    const parts = s.split(":");
    s = parts[parts.length - 1] ?? s;
  }
  // strip .BA suffix
  if (s.endsWith(".BA")) {
    s = s.slice(0, -3);
  }
  // strip any other suffix like .D etc? keep as-is for non-BA?
  return s;
}

function validateMarket(market: unknown): asserts market is AnalysisMarket | undefined {
  if (market === undefined) return;
  if (typeof market !== "string" || !(MARKETS as readonly string[]).includes(market)) {
    throw new Error(`Mercado inválido: ${String(market)}`);
  }
}

function resolveMarketDetailed(
  base: string,
  market: AnalysisMarket | undefined
): AnalysisMarket {
  if (market) return market;
  // sin market: CEDEAR → us (nasdaq como default US), else bcba
  if (isCedear(base)) return "nasdaq";
  return "bcba";
}

export function resolveAnalysisSymbols(
  input: Input,
  marketParam?: AnalysisMarket | string
): ResolvedAnalysisSymbols {
  let symbol: string;
  let market: AnalysisMarket | string | undefined;

  if (typeof input === "object" && input !== null && "symbol" in input) {
    symbol = input.symbol;
    market = (input as { market?: string }).market ?? marketParam;
  } else {
    symbol = input as string;
    market = marketParam;
  }

  if (typeof symbol !== "string" || symbol.trim().length === 0) {
    throw new Error("symbol requerido");
  }

  // validate market before normalizing
  validateMarket(market as AnalysisMarket | undefined);
  const marketTyped = market as AnalysisMarket | undefined;

  const local = symbol.trim().toUpperCase();
  const base = normalizeBase(symbol);

  // yahoo
  let yahoo: string;
  if (marketTyped === "bcba") yahoo = `${base}.BA`;
  else if (marketTyped === "nyse" || marketTyped === "nasdaq") yahoo = base;
  else {
    // sin market → usar isCedear sobre base
    yahoo = isCedear(base) ? base : `${base}.BA`;
  }

  // tv
  let tv: string;
  if (marketTyped === "bcba") tv = `BCBA:${base}`;
  else if (marketTyped === "nyse") tv = `NYSE:${base}`;
  else if (marketTyped === "nasdaq") tv = `NASDAQ:${base}`;
  else {
    // sin market
    if (isCedear(base)) tv = `NASDAQ:${base}`;
    else tv = `BCBA:${base}`;
  }

  const marketDetailed = resolveMarketDetailed(base, marketTyped);
  const marketNormalized: "bcba" | "us" =
    marketDetailed === "bcba" ? "bcba" : "us";

  return {
    local,
    yahoo,
    tv,
    base,
    swsBase: base,
    market: marketNormalized,
    marketDetailed,
  };
}

// Alias para compatibilidad con spec que nombra resolveAnalysisSymbols con firma (symbol, market?)
export const resolveAnalysisSymbol = resolveAnalysisSymbols;
