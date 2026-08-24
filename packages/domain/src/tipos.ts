/**
 * Tipos de mercado y liquidación — fuente única para IOL y dominio. // MarketCode + SettlementType (SDD6)
 * Centraliza magic strings de mercado y liquidación que antes vivían
 * desperdigadas en routes/orders.ts y services/iol/*.
 * Re-exportado vía apps/api/src/dominio/tipos.ts para consumers api.
 */

export enum MarketCode {
  BCBA = "bCBA",
  NYSE = "nYSE",
  NASDAQ = "nASDAQ",
  BONDS = "bCBA",
}

/**
 * MarketCode para input API (lowercase) — usado en schema Zod de /api/orders
 * Mantiene compatibilidad con clientes que mandan "bcba" minúsculo.
 * La traducción a código IOL se hace vía IOL_MARKET_CODE_MAP.
 */
export const IOL_MARKET_CODE_MAP: Record<string, MarketCode> = {
  bcba: MarketCode.BCBA,
  nyse: MarketCode.NYSE,
  nasdaq: MarketCode.NASDAQ,
  bonds: MarketCode.BONDS,
};

export enum SettlementType {
  D = "D",
  C = "C",
  T24 = "24hs",
  CCL = "CCL",
  MEP = "MEP",
}

// Alias para compatibilidad con settlement.ts domain (24hs/CCL/MEP)
export type SettlementVariant = SettlementType.T24 | SettlementType.CCL | SettlementType.MEP;
