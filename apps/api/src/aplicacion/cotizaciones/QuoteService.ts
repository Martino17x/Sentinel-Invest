import type { MarketDataPort } from "../../services/iol/ports.js";
import type {
  IolCredentials,
  PanelQuote,
  PanelSummary,
  Quote,
} from "../../services/iol/types.js";
import type { BondSchedule, BondCashflow } from "../../services/market/bonds/types.js";
import { buildSchedule } from "../../services/market/bonds/cashflow.js";
import type { BymaFicha as DomainBymaFicha } from "../../dominio/bonos/ficha.js";
import {
  normalizeFichaToSchedule,
  inferMaeTipo,
} from "../../dominio/bonos/ficha.js";
import { BymaClient } from "../../infraestructura/providers/byma/BymaClient.js";
import { BymaFichaClient } from "../../infraestructura/providers/byma/BymaFichaClient.js";
import {
  mapInstrument,
  mapMarket,
  mapAssetType,
  type BymaInstrument,
} from "../../infraestructura/providers/byma/BymaMapper.js";
import { getInstrumentDisplayName } from "@sentinel/domain";

/**
 * QuoteService — fachada de cotizaciones en capa application.
 * Implementa MarketDataPort y orquesta BymaClient + BymaFichaClient + BymaMapper.
 * Sin estado propio; delega cache/TTL/dedup a los clients inyectados.
 */
export class QuoteService implements MarketDataPort {
  constructor(
    private readonly client: BymaClient,
    private readonly fichaClient: BymaFichaClient,
  ) {}

  async getPanel(
    _creds: IolCredentials,
    market: string,
    assetType: string,
    page = 1,
    pageSize = 25,
    q?: string,
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }> {
    let endpoint: string;
    switch (assetType) {
      case "cedear":
        endpoint = "cedears";
        break;
      case "bono":
        endpoint = "public-bonds";
        break;
      case "on":
        endpoint = "negociable-obligations";
        break;
      case "caucion":
        endpoint = "cauciones";
        break;
      case "accion":
      default:
        endpoint = "leading-equity";
    }

    const instruments = await this.client.postPanel(endpoint);
    const marketOpen = await this.client.getMarketOpen();

    const allQuotes = instruments
      .filter((i) => (i.symbol ?? i.ticker ?? "") !== "")
      .map((i) => mapInstrument(i, market, assetType))
      .filter((qq) => qq.lastPrice > 0 || qq.close != null);

    const query = q?.trim().toUpperCase();
    const filtered = query
      ? allQuotes.filter(
          (quote) =>
            quote.symbol.toUpperCase().includes(query) ||
            quote.name.toUpperCase().includes(query),
        )
      : allQuotes;

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const quotes = filtered.slice(start, start + pageSize);

    const avgVariation =
      quotes.length > 0
        ? quotes.reduce((s, qq) => s + qq.variationPct, 0) / quotes.length
        : 0;

    return {
      summary: {
        market: mapMarket(market),
        assetType,
        totalVariationPct: avgVariation,
        updatedAt: new Date().toISOString(),
        isRealtime: marketOpen,
      },
      quotes,
      total,
    };
  }

  async getQuote(_creds: IolCredentials, symbol: string, market: string): Promise<Quote> {
    const endpoints = ["leading-equity", "cedears", "public-bonds"] as const;
    const settled = await Promise.allSettled(
      endpoints.map((ep) => this.client.postPanel(ep)),
    );
    const panels: BymaInstrument[][] = settled
      .filter((r): r is PromiseFulfilledResult<BymaInstrument[]> => r.status === "fulfilled")
      .map((r) => r.value);

    const target = symbol.toUpperCase();
    const found = panels.flat().find((i) => (i.symbol ?? i.ticker ?? "").toUpperCase() === target);

    if (!found) {
      return {
        symbol,
        market: mapMarket(market),
        lastPrice: 0,
        variationPct: 0,
        currency: "ARS",
        updatedAt: new Date().toISOString(),
        bid: null,
        ask: null,
        open: null,
        high: null,
        low: null,
        prevClose: null,
        volume: null,
      };
    }

    const tradePx = Number(found.trade ?? 0);
    const prevClose = Number(found.previousClosingPrice ?? found.previousSettlementPrice ?? 0);
    const effPrice = tradePx > 0 ? tradePx : prevClose > 0 ? prevClose : 0;
    return {
      symbol: target,
      market: mapMarket(market),
      lastPrice: effPrice,
      variationPct: prevClose > 0 && effPrice > 0 ? ((effPrice - prevClose) / prevClose) * 100 : 0,
      currency: found.denominationCcy === "USD" ? "USD" : "ARS",
      name: (found.description || found.name || getInstrumentDisplayName(target) || undefined)?.trim() || undefined,
      updatedAt: new Date().toISOString(),
      bid: found.bidPrice != null ? Number(found.bidPrice) : null,
      ask: found.offerPrice != null ? Number(found.offerPrice) : null,
      open: found.openingPrice != null ? Number(found.openingPrice) : null,
      high: found.highPrice != null ? Number(found.highPrice) : null,
      low: found.lowPrice != null ? Number(found.lowPrice) : null,
      prevClose: found.previousClosingPrice != null ? Number(found.previousClosingPrice) : null,
      volume: found.tradeVolume != null ? Number(found.tradeVolume) : null,
    };
  }

  async getQuoteHistory(
    _creds: IolCredentials,
    symbol: string,
    _market: string,
    days: number,
  ): Promise<{ date: string; close: number }[]> {
    return this.client.getQuoteHistory(symbol, days);
  }

  async getBondFichaRaw(symbol: string, signal?: AbortSignal): Promise<DomainBymaFicha | null> {
    const raw = await this.fichaClient.getBondFichaRaw(symbol, signal);
    return raw as unknown as DomainBymaFicha | null;
  }

  async getBondSchedule(symbol: string, signal?: AbortSignal): Promise<BondSchedule> {
    const sym = symbol.toUpperCase().trim();
    const ficha = await this.fichaClient.fetchBondFicha(sym, signal);
    const schedule = normalizeFichaToSchedule(sym, ficha as unknown as DomainBymaFicha | null);

    if (!schedule.cashflows || schedule.cashflows.length === 0) {
      const fallback = await this.fichaClient.fetchMaeDetalleFallback(sym, signal);
      if (fallback && fallback.length > 0) {
        return buildSchedule({
          symbol: sym,
          moneda: schedule.moneda,
          tipo: schedule.tipo === "bullet" ? inferMaeTipo(fallback) : schedule.tipo,
          vencimiento: schedule.vencimiento,
          cashflows: fallback,
          cerAjustado: schedule.cerAjustado,
        });
      }
    }

    return schedule;
  }
}
