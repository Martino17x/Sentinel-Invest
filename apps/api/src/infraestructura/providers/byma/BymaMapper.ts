import { getInstrumentDisplayName } from "@sentinel/domain";
import type { PanelQuote } from "../../../services/iol/types.js";

export interface BymaResponse {
  content?: {
    page_number: number;
    page_count: number;
    page_size: number;
    total_elements_count: number;
  };
  data: BymaInstrument[];
  empty: boolean;
}

export interface BymaInstrument {
  symbol?: string;
  name?: string;
  description?: string;
  trade?: number;
  previousClosingPrice?: number;
  previousSettlementPrice?: number;
  openingPrice?: number;
  tradingHighPrice?: number;
  tradingLowPrice?: number;
  bidPrice?: number;
  offerPrice?: number;
  tradeVolume?: number;
  volumeAmount?: number;
  denominationCcy?: string;
  securityType?: string;
  securitySubType?: string;
  tradeHour?: string;
  ticker?: string;
  [key: string]: unknown;
}

export function mapInstrument(i: BymaInstrument, market: string, assetType: string): PanelQuote {
  const symbol = (i.symbol ?? i.ticker ?? "").toUpperCase();
  const tradePx = Number(i.trade ?? 0);
  const prevClose = Number(i.previousClosingPrice ?? i.previousSettlementPrice ?? 0);
  const lastPrice = tradePx > 0 ? tradePx : prevClose > 0 ? prevClose : 0;
  const variationPct = prevClose > 0 && lastPrice > 0 ? ((lastPrice - prevClose) / prevClose) * 100 : 0;
  const volNom = i.tradeVolume != null ? Number(i.tradeVolume) : null;
  const volEfe = i.volumeAmount != null ? Number(i.volumeAmount) : null;

  return {
    symbol,
    name: (i.description || i.name || getInstrumentDisplayName(symbol)).trim(),
    assetType: mapAssetType(assetType, symbol),
    market: mapMarket(market),
    lastPrice,
    variationPct,
    bid: i.bidPrice != null ? Number(i.bidPrice) : null,
    ask: i.offerPrice != null ? Number(i.offerPrice) : null,
    open: i.openingPrice != null ? Number(i.openingPrice) : null,
    low: i.tradingLowPrice != null ? Number(i.tradingLowPrice) : null,
    high: i.tradingHighPrice != null ? Number(i.tradingHighPrice) : null,
    close: prevClose > 0 ? prevClose : null,
    volume: Number.isFinite(volNom as number) ? (volNom as number) : null,
    volumeNominal: Number.isFinite(volNom as number) ? (volNom as number) : null,
    volumeEfectivo: Number.isFinite(volEfe as number) ? (volEfe as number) : null,
    currency: i.denominationCcy === "USD" ? "USD" : "ARS",
  };
}

export function mapMarket(market: string): PanelQuote["market"] {
  const m = market.toLowerCase();
  if (m.includes("nyse")) return "nyse";
  if (m.includes("nasdaq")) return "nasdaq";
  if (m.includes("bono") || m.includes("mae") || m.includes("bonds")) return "bonds";
  if (m.includes("fci") || m.includes("fondo")) return "fci";
  if (m.includes("crypto")) return "crypto";
  return "bcba";
}

export function mapAssetType(assetType: string, symbol: string): PanelQuote["assetType"] {
  if (assetType === "cedear") return "cedear";
  if (assetType === "bono") return "bono";
  if (assetType === "accion") return "accion";
  if (assetType === "on") return "bono";
  if (assetType === "caucion") return "caucion";
  if (symbol.startsWith("CEDEAR")) return "cedear";
  return assetType as PanelQuote["assetType"];
}
