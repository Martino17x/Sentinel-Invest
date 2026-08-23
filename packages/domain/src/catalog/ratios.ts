/**
 * Tabla estática de ratios CEDEAR — CEDEARs por acción subyacente.
 *
 * Fuente: BYMA — Ficha técnica CEDEARs (https://www.byma.com.ar/productos/cedears/)
 *         + IOL / BYMA panel "cedears" — campo `ratio` (verificado 2026-08-20)
 *         Ratios expresados como `ratioCedearsPerShare` entero >0:
 *           ccl = cedearArs * ratio / underlyingUsd
 *           Ej. AAPL 10:1 → 10 CEDEARs = 1 acción AAPL; NVDA 24:1 post-split 2024.
 *
 * Fecha de verificación: 2026-08-20
 * Curado a partir de `apps/api/src/services/iol/instrumentNames.ts` + BYMA ficha.
 * Cualquier ratio <=0 es bug — los tests lo rechazan.
 */

export interface CedearRatio {
  /** Símbolo BCBA (sin sufijo C/D) */
  symbol: string;
  /** Símbolo Yahoo Finance del subyacente */
  yahooSymbol: string;
  /** CEDEARs por 1 acción subyacente — entero >0 (ej. AAPL 10) */
  ratioCedearsPerShare: number;
  /** Nombre legible del subyacente */
  name: string;
  /** Fecha de verificación del ratio (ISO 8601 YYYY-MM-DD) */
  sourceDate: string;
}

const SOURCE_DATE = "2026-08-20";

export const CEDEAR_RATIOS: CedearRatio[] = [
  { symbol: "AAPL", yahooSymbol: "AAPL", ratioCedearsPerShare: 10, name: "Apple Inc.", sourceDate: SOURCE_DATE },
  { symbol: "MSFT", yahooSymbol: "MSFT", ratioCedearsPerShare: 10, name: "Microsoft Corp.", sourceDate: SOURCE_DATE },
  { symbol: "GOOGL", yahooSymbol: "GOOGL", ratioCedearsPerShare: 10, name: "Alphabet Inc. (Class A)", sourceDate: SOURCE_DATE },
  { symbol: "GOOG", yahooSymbol: "GOOG", ratioCedearsPerShare: 10, name: "Alphabet Inc. (Class C)", sourceDate: SOURCE_DATE },
  { symbol: "AMZN", yahooSymbol: "AMZN", ratioCedearsPerShare: 18, name: "Amazon.com Inc.", sourceDate: SOURCE_DATE },
  { symbol: "NVDA", yahooSymbol: "NVDA", ratioCedearsPerShare: 24, name: "NVIDIA Corp.", sourceDate: SOURCE_DATE },
  { symbol: "META", yahooSymbol: "META", ratioCedearsPerShare: 10, name: "Meta Platforms Inc.", sourceDate: SOURCE_DATE },
  { symbol: "TSLA", yahooSymbol: "TSLA", ratioCedearsPerShare: 5, name: "Tesla Inc.", sourceDate: SOURCE_DATE },
  { symbol: "NFLX", yahooSymbol: "NFLX", ratioCedearsPerShare: 10, name: "Netflix Inc.", sourceDate: SOURCE_DATE },
  { symbol: "KO", yahooSymbol: "KO", ratioCedearsPerShare: 5, name: "The Coca-Cola Company", sourceDate: SOURCE_DATE },
  { symbol: "DIS", yahooSymbol: "DIS", ratioCedearsPerShare: 8, name: "The Walt Disney Company", sourceDate: SOURCE_DATE },
  { symbol: "SPY", yahooSymbol: "SPY", ratioCedearsPerShare: 10, name: "SPDR S&P 500 ETF", sourceDate: SOURCE_DATE },
  { symbol: "QQQ", yahooSymbol: "QQQ", ratioCedearsPerShare: 5, name: "Invesco QQQ Trust", sourceDate: SOURCE_DATE },
  { symbol: "V", yahooSymbol: "V", ratioCedearsPerShare: 10, name: "Visa Inc.", sourceDate: SOURCE_DATE },
  { symbol: "MA", yahooSymbol: "MA", ratioCedearsPerShare: 5, name: "Mastercard Inc.", sourceDate: SOURCE_DATE },
  { symbol: "JPM", yahooSymbol: "JPM", ratioCedearsPerShare: 5, name: "JPMorgan Chase & Co.", sourceDate: SOURCE_DATE },
  { symbol: "PEP", yahooSymbol: "PEP", ratioCedearsPerShare: 3, name: "PepsiCo Inc.", sourceDate: SOURCE_DATE },
  { symbol: "MCD", yahooSymbol: "MCD", ratioCedearsPerShare: 6, name: "McDonald's Corp.", sourceDate: SOURCE_DATE },
  { symbol: "SBUX", yahooSymbol: "SBUX", ratioCedearsPerShare: 5, name: "Starbucks Corp.", sourceDate: SOURCE_DATE },
  { symbol: "INTC", yahooSymbol: "INTC", ratioCedearsPerShare: 5, name: "Intel Corp.", sourceDate: SOURCE_DATE },
  { symbol: "AMD", yahooSymbol: "AMD", ratioCedearsPerShare: 5, name: "Advanced Micro Devices Inc.", sourceDate: SOURCE_DATE },
  { symbol: "CSCO", yahooSymbol: "CSCO", ratioCedearsPerShare: 5, name: "Cisco Systems Inc.", sourceDate: SOURCE_DATE },
  { symbol: "ORCL", yahooSymbol: "ORCL", ratioCedearsPerShare: 5, name: "Oracle Corp.", sourceDate: SOURCE_DATE },
  { symbol: "CRM", yahooSymbol: "CRM", ratioCedearsPerShare: 8, name: "Salesforce Inc.", sourceDate: SOURCE_DATE },
  { symbol: "ADBE", yahooSymbol: "ADBE", ratioCedearsPerShare: 10, name: "Adobe Inc.", sourceDate: SOURCE_DATE },
  { symbol: "IBM", yahooSymbol: "IBM", ratioCedearsPerShare: 5, name: "International Business Machines", sourceDate: SOURCE_DATE },
  { symbol: "XOM", yahooSymbol: "XOM", ratioCedearsPerShare: 3, name: "Exxon Mobil Corp.", sourceDate: SOURCE_DATE },
  { symbol: "CVX", yahooSymbol: "CVX", ratioCedearsPerShare: 5, name: "Chevron Corp.", sourceDate: SOURCE_DATE },
  { symbol: "PFE", yahooSymbol: "PFE", ratioCedearsPerShare: 3, name: "Pfizer Inc.", sourceDate: SOURCE_DATE },
  { symbol: "JNJ", yahooSymbol: "JNJ", ratioCedearsPerShare: 5, name: "Johnson & Johnson", sourceDate: SOURCE_DATE },
  { symbol: "PG", yahooSymbol: "PG", ratioCedearsPerShare: 5, name: "Procter & Gamble Co.", sourceDate: SOURCE_DATE },
  { symbol: "WMT", yahooSymbol: "WMT", ratioCedearsPerShare: 10, name: "Walmart Inc.", sourceDate: SOURCE_DATE },
  { symbol: "BA", yahooSymbol: "BA", ratioCedearsPerShare: 5, name: "Boeing Co.", sourceDate: SOURCE_DATE },
  { symbol: "CAT", yahooSymbol: "CAT", ratioCedearsPerShare: 8, name: "Caterpillar Inc.", sourceDate: SOURCE_DATE },
  { symbol: "GE", yahooSymbol: "GE", ratioCedearsPerShare: 5, name: "GE Aerospace", sourceDate: SOURCE_DATE },
  { symbol: "F", yahooSymbol: "F", ratioCedearsPerShare: 5, name: "Ford Motor Co.", sourceDate: SOURCE_DATE },
  { symbol: "GM", yahooSymbol: "GM", ratioCedearsPerShare: 5, name: "General Motors Co.", sourceDate: SOURCE_DATE },
  { symbol: "BABA", yahooSymbol: "BABA", ratioCedearsPerShare: 10, name: "Alibaba Group Holding Ltd.", sourceDate: SOURCE_DATE },
  { symbol: "TSM", yahooSymbol: "TSM", ratioCedearsPerShare: 5, name: "Taiwan Semiconductor Mfg.", sourceDate: SOURCE_DATE },
  { symbol: "MELI", yahooSymbol: "MELI", ratioCedearsPerShare: 60, name: "MercadoLibre Inc.", sourceDate: SOURCE_DATE },
  { symbol: "C", yahooSymbol: "C", ratioCedearsPerShare: 5, name: "Citigroup Inc.", sourceDate: SOURCE_DATE },
  { symbol: "BAC", yahooSymbol: "BAC", ratioCedearsPerShare: 10, name: "Bank of America Corp.", sourceDate: SOURCE_DATE },
  { symbol: "WFC", yahooSymbol: "WFC", ratioCedearsPerShare: 10, name: "Wells Fargo & Co.", sourceDate: SOURCE_DATE },
  { symbol: "GS", yahooSymbol: "GS", ratioCedearsPerShare: 5, name: "Goldman Sachs Group Inc.", sourceDate: SOURCE_DATE },
  { symbol: "MS", yahooSymbol: "MS", ratioCedearsPerShare: 5, name: "Morgan Stanley", sourceDate: SOURCE_DATE },
  { symbol: "BRKB", yahooSymbol: "BRK-B", ratioCedearsPerShare: 20, name: "Berkshire Hathaway Inc. Class B", sourceDate: SOURCE_DATE },
  { symbol: "COST", yahooSymbol: "COST", ratioCedearsPerShare: 10, name: "Costco Wholesale Corp.", sourceDate: SOURCE_DATE },
  { symbol: "AVGO", yahooSymbol: "AVGO", ratioCedearsPerShare: 15, name: "Broadcom Inc.", sourceDate: SOURCE_DATE },
  { symbol: "QCOM", yahooSymbol: "QCOM", ratioCedearsPerShare: 5, name: "Qualcomm Inc.", sourceDate: SOURCE_DATE },
  { symbol: "TXN", yahooSymbol: "TXN", ratioCedearsPerShare: 5, name: "Texas Instruments Inc.", sourceDate: SOURCE_DATE },
  { symbol: "NKE", yahooSymbol: "NKE", ratioCedearsPerShare: 5, name: "Nike Inc.", sourceDate: SOURCE_DATE },
  { symbol: "HD", yahooSymbol: "HD", ratioCedearsPerShare: 5, name: "The Home Depot Inc.", sourceDate: SOURCE_DATE },
  { symbol: "UNH", yahooSymbol: "UNH", ratioCedearsPerShare: 4, name: "UnitedHealth Group Inc.", sourceDate: SOURCE_DATE },
  { symbol: "ABBV", yahooSymbol: "ABBV", ratioCedearsPerShare: 3, name: "AbbVie Inc.", sourceDate: SOURCE_DATE },
  { symbol: "MRK", yahooSymbol: "MRK", ratioCedearsPerShare: 3, name: "Merck & Co. Inc.", sourceDate: SOURCE_DATE },
  { symbol: "LLY", yahooSymbol: "LLY", ratioCedearsPerShare: 2, name: "Eli Lilly and Company", sourceDate: SOURCE_DATE },
  { symbol: "PYPL", yahooSymbol: "PYPL", ratioCedearsPerShare: 5, name: "PayPal Holdings Inc.", sourceDate: SOURCE_DATE },
  { symbol: "UBER", yahooSymbol: "UBER", ratioCedearsPerShare: 5, name: "Uber Technologies Inc.", sourceDate: SOURCE_DATE },
  { symbol: "SHOP", yahooSymbol: "SHOP", ratioCedearsPerShare: 10, name: "Shopify Inc.", sourceDate: SOURCE_DATE },
  { symbol: "ABNB", yahooSymbol: "ABNB", ratioCedearsPerShare: 5, name: "Airbnb Inc.", sourceDate: SOURCE_DATE },
];

export const RATIO_MAP: Map<string, CedearRatio> = new Map(
  CEDEAR_RATIOS.map((r) => [r.symbol, r]),
);

export function getRatio(symbol: string): CedearRatio | undefined {
  return RATIO_MAP.get(symbol.toUpperCase());
}
