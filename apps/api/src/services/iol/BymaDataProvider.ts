import type { IolProvider } from "./IolProvider.js";
import type {
  IolCredentials,
  MonthClose,
  MonthlyReport,
  FciRedemptionRequest,
  FciSubscriptionRequest,
  Operation,
  OrderRequest,
  OrderResult,
  PanelQuote,
  PanelSummary,
  PortfolioSummary,
  PortfolioSnapshotPoint,
  Quote,
} from "./types.js";

/**
 * PROVEEDOR DE COTIZACIONES — BYMADATA (BYMA open).
 *
 * API pública y gratuita del dashboard oficial de BYMA
 * (open.bymadata.com.ar). Endpoints descubiertos inspeccionando
 * el tráfico del dashboard (13/08/2026):
 *
 *   POST /vanoms-be-core/rest/api/bymadata/free/cedears
 *   POST /vanoms-be-core/rest/api/bymadata/free/public-bonds
 *   POST /vanoms-be-core/rest/api/bymadata/free/leading-equity
 *   GET  /vanoms-be-core/rest/api/bymadata/free/market-open
 *   GET  /vanoms-be-core/rest/api/bymadata/free/server-time
 *   GET  /vanoms-be-core/rest/api/bymadata/free/chart/historical-series/history?symbol=X&resolution=D&from=&to=
 *
 * Body estándar de los POST:
 *   {"excludeZeroPxAndQty":true,"T1":true,"T0":false}
 *
 * IMPORTANTE: con mercado cerrado devuelve data vacía (market-open: false).
 * El frontend debe mostrar el estado honesto (badge "Mercado cerrado").
 */

import { getInstrumentDisplayName } from "@sentinel/domain";
import type { BondSchedule, BondCashflow } from "../market/bonds/types.js";
import { buildSchedule } from "../market/bonds/cashflow.js";
import {
  normalizeFichaToSchedule as normalizeFichaToScheduleFromDomain,
  inferMaeTipo as inferMaeTipoFromDomain,
} from "../../domain/bonos/ficha.js";
import {
  type BymaInstrument,
  type BymaResponse,
  mapInstrument as mapInstrumentPure,
  mapMarket,
  mapAssetType,
} from "../../infrastructure/providers/byma/BymaMapper.js";
import { BymaClient } from "../../infrastructure/providers/byma/BymaClient.js";
import { BymaFichaClient } from "../../infrastructure/providers/byma/BymaFichaClient.js";

const API_BASE = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free";

export class BymaDataProvider implements IolProvider {
  private bymaClient = new BymaClient();
  private bymaFichaClient = new BymaFichaClient();

  private async postPanel(endpoint: string, signal?: AbortSignal): Promise<BymaInstrument[]> {
    return this.bymaClient.postPanel(endpoint, signal);
  }

  private async fetchPanel(endpoint: string, outerSignal?: AbortSignal): Promise<BymaInstrument[]> {
    return this.bymaClient.fetchPanel(endpoint, outerSignal);
  }

  private async getMarketOpen(): Promise<boolean> {
    return this.bymaClient.getMarketOpen();
  }

  private mapInstrument(i: BymaInstrument, market: string, assetType: string): PanelQuote {
    return mapInstrumentPure(i, market, assetType);
  }

  /** Público — raw BYMA ficha para consumidores avanzados (panel/ficha). Delegado a BymaFichaClient. */
  async getBondFichaRaw(symbol: string, signal?: AbortSignal): Promise<BymaFicha | null> {
    const raw = await this.bymaFichaClient.getBondFichaRaw(symbol, signal);
    return raw as unknown as BymaFicha | null;
  }

  async getPanel(
    _creds: IolCredentials,
    market: string,
    assetType: string,
    page = 1,
    pageSize = 25,
    q?: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }> {
    // Mapear tipo de activo → endpoint de BYMADATA
    let endpoint: string;
    switch (assetType) {
      case "cedear":
        endpoint = "cedears";
        break;
      case "bono":
        endpoint = "public-bonds";
        break;
      case "on": // Obligaciones Negociables
        endpoint = "negociable-obligations";
        break;
      case "caucion":
        endpoint = "cauciones";
        break;
      case "accion":
      default:
        endpoint = "leading-equity";
    }

    const instruments = await this.postPanel(endpoint);
    const marketOpen = await this.getMarketOpen();

    // Paginación local: con page_size=5000 BYMA trae el panel completo en una call.
    // Mapeamos todo y filtramos solo vacío (symbol vacío). El fallback de lastPrice
    // a previousClosingPrice en mapInstrument asegura que weekend no filtre todo.
    const allQuotes = instruments
      .filter((i) => (i.symbol ?? i.ticker ?? "") !== "")
      .map((i) => this.mapInstrument(i, market, assetType))
      .filter((q) => q.lastPrice > 0 || q.close != null);

    // Búsqueda server-side: filtra por símbolo o nombre ANTES de paginar,
    // así "NVDA" aparece aunque viva en la página 20 del panel completo.
    const query = q?.trim().toUpperCase();
    const filtered = query
      ? allQuotes.filter(
          (quote) =>
            quote.symbol.toUpperCase().includes(query) ||
            quote.name.toUpperCase().includes(query)
        )
      : allQuotes;

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const quotes = filtered.slice(start, start + pageSize);

    const avgVariation =
      quotes.length > 0
        ? quotes.reduce((s, q) => s + q.variationPct, 0) / quotes.length
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
    // Buscar el símbolo en los paneles disponibles — 3 fetches en paralelo
    // con timeout 4s c/u (gestionado en fetchPanel) y tolerancia a fallo parcial.
    // Gracias al cache + dedup inflight, N posiciones concurrentes comparten
    // los mismos 3 fetches en vez de N*3.
    const endpoints = ["leading-equity", "cedears", "public-bonds"] as const;
    const settled = await Promise.allSettled(
      endpoints.map((ep) => this.postPanel(ep))
    );
    const panels: BymaInstrument[][] = settled
      .filter((r): r is PromiseFulfilledResult<BymaInstrument[]> => r.status === "fulfilled")
      .map((r) => r.value);
    // Si todos fallan, panels queda vacío y se devuelve cotización 0 honesta abajo

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
      variationPct:
        prevClose > 0 && effPrice > 0
          ? ((effPrice - prevClose) / prevClose) * 100
          : 0,
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

  /**
   * BONOS — Ficha técnica + normalización a BondSchedule.
   *
   * Endpoint: POST /bnown/fichatecnica/especies/general  {symbol}
   * Normaliza bullet / amortizable / cer / step-up → BondSchedule.
   * Si la ficha no trae cronograma explícito (formaAmortizacion texto libre)
   * y MAE tiene detalle[] para el mismo símbolo, usa fallback MAE.
   */
  async getBondSchedule(symbol: string, signal?: AbortSignal): Promise<BondSchedule> {
    const sym = symbol.toUpperCase().trim();
    const ficha = await this.fetchBondFicha(sym, signal);
    const schedule = this.normalizeFichaToSchedule(sym, ficha);

    // Si el schedule quedó sin cashflows útiles, intentar fallback MAE detalle[]
    if (!schedule.cashflows || schedule.cashflows.length === 0) {
      const fallback = await this.fetchMaeDetalleFallback(sym, signal);
      if (fallback && fallback.length > 0) {
        return buildSchedule({
          symbol: sym,
          moneda: schedule.moneda,
          tipo: schedule.tipo === "bullet" ? inferMaeTipoFromDomain(fallback) : schedule.tipo,
          vencimiento: schedule.vencimiento,
          cashflows: fallback,
          cerAjustado: schedule.cerAjustado,
        });
      }
    }

    return schedule;
  }

  private async fetchBondFicha(symbol: string, signal?: AbortSignal): Promise<BymaFicha | null> {
    const raw = await this.bymaFichaClient.fetchBondFicha(symbol, signal);
    return raw as unknown as BymaFicha | null;
  }

  private normalizeFichaToSchedule(symbol: string, ficha: BymaFicha | null): BondSchedule {
    return normalizeFichaToScheduleFromDomain(symbol, ficha as unknown as import("../../domain/bonos/ficha.js").BymaFicha | null);
  }

  private async fetchMaeDetalleFallback(symbol: string, signal?: AbortSignal): Promise<BondCashflow[] | null> {
    return this.bymaFichaClient.fetchMaeDetalleFallback(symbol, signal);
  }

  async getQuoteHistory(
    _creds: IolCredentials,
    symbol: string,
    _market: string,
    days: number
  ): Promise<{ date: string; close: number }[]> {
    return this.bymaClient.getQuoteHistory(symbol, days);
  }

  // ============================================================
  // Métodos de CUENTA — este provider solo sabe de cotizaciones.
  // (En la arquitectura actual, el routing lo hace el factory:
  //  BymaDataProvider se usa para getPanel/getQuote y el resto
  //  cae al provider principal de cuenta.)
  // ============================================================

  async getPortfolio(_c: IolCredentials, _a: string): Promise<PortfolioSummary> {
    throw new Error("BymaDataProvider no maneja portafolio");
  }
  async getOperations(_c: IolCredentials, _a: string): Promise<Operation[]> {
    throw new Error("BymaDataProvider no maneja operaciones");
  }
  async getPortfolioHistory(_c: IolCredentials, _a: string, _d: number): Promise<PortfolioSnapshotPoint[]> {
    throw new Error("BymaDataProvider no maneja historial de portafolio");
  }
  async placeOrder(
    _creds: IolCredentials,
    _accountNumber: string,
    _order: OrderRequest
  ): Promise<OrderResult> {
    throw new Error("BYMADATA es solo datos de mercado: no ejecuta órdenes. Las órdenes van por IolApiProvider.");
  }
  async cancelOperation(
    _creds: IolCredentials,
    _operationNumber: string
  ): Promise<OrderResult> {
    throw new Error("BYMADATA es solo datos de mercado: no cancela órdenes. La cancelación va por IolApiProvider.");
  }

  async subscribeFci(
    _creds: IolCredentials,
    _request: FciSubscriptionRequest
  ): Promise<OrderResult> {
    throw new Error("BYMADATA es solo datos de mercado: no opera FCI. Las suscripciones van por IolApiProvider.");
  }

  async rescueFci(
    _creds: IolCredentials,
    _request: FciRedemptionRequest
  ): Promise<OrderResult> {
    throw new Error("BYMADATA es solo datos de mercado: no opera FCI. Los rescates van por IolApiProvider.");
  }
  async getMonthlyCloses(_c: IolCredentials, _a: string): Promise<MonthClose[]> {
    throw new Error("BymaDataProvider no maneja cierres");
  }
  async getMonthlyReport(_c: IolCredentials, _a: string, _m: string): Promise<MonthlyReport> {
    throw new Error("BymaDataProvider no maneja reportes");
  }
}

// ============================================================
// Helpers para getBondSchedule (ficha técnica)
// ============================================================

export interface BymaFicha {
  ley?: string;
  formaAmortizacion?: string;
  interes?: string;
  denominacionMinima?: number;
  fechaEmision?: string;
  fechaVencimiento?: string;
  fechaDevenganIntereses?: string;
  codigoIsin?: string;
  tipoEspecie?: string;
  tipoObligacion?: string;
  moneda?: string;
  montoNominal?: number;
  montoResidual?: number;
  denominacion?: string;
  emisor?: string;
  paisLey?: string;
  insType?: string;
  default?: string;
}

// Compat — tipos seguirán desde bymaFichaParser, pero re-exportamos parsers puros desde dominio
export type { ParsedCoupon, ParsedAmortizacion } from "../market/bonds/bymaFichaParser.js";
// Shim re-export desde dominio puro (commit 4) — mantiene import legacy estable
export { parseInteresToCouponRate } from "../../domain/bonos/ficha.js";
export { parseFormaAmortizacion } from "../../domain/bonos/ficha.js";
export { isCallableTexto } from "../../domain/bonos/ficha.js";
export { inferMaeTipo } from "../../domain/bonos/ficha.js";
export { parseBymaFichaToSchedule } from "../../domain/bonos/ficha.js";
export { parseBymaFichaToSchedule as bymaFichaParser } from "../../domain/bonos/ficha.js";
export { parseFecha, inferVencimientoFallback, inferMoneda, isCerFicha, inferTipo, parseCashflowsFromFicha, normalizeFichaToSchedule } from "../../domain/bonos/ficha.js";

// Mapeadores delegados a BymaMapper (SRP) — ver infrastructure/providers/byma/BymaMapper.ts
