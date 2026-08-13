import type { IolProvider } from "./IolProvider.js";
import type {
  IolCredentials,
  MonthClose,
  MonthlyReport,
  Operation,
  PanelQuote,
  PanelSummary,
  PortfolioSummary,
  PortfolioSnapshotPoint,
  Position,
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

const API_BASE = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free";

interface BymaResponse {
  content?: {
    page_number: number;
    page_count: number;
    page_size: number;
    total_elements_count: number;
  };
  data: BymaInstrument[];
  empty: boolean;
}

interface BymaInstrument {
  symbol?: string;
  name?: string;
  description?: string;
  lastPrice?: number;
  openPrice?: number;
  closePrice?: number;
  highPrice?: number;
  lowPrice?: number;
  volume?: number;
  nominalVolume?: number;
  changePercentage?: number;
  bid?: number;
  offer?: number;
  ticker?: string;
  [key: string]: unknown;
}

const REQUEST_BODY = {
  excludeZeroPxAndQty: true,
  T1: true,
  T0: false,
};

export class BymaDataProvider implements IolProvider {
  private async postPanel(endpoint: string): Promise<BymaInstrument[]> {
    const res = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(REQUEST_BODY),
    });

    if (!res.ok) {
      throw new Error(`BYMADATA ${endpoint}: HTTP ${res.status}`);
    }

    const json = (await res.json()) as BymaResponse;
    return json.data ?? [];
  }

  private async getMarketOpen(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/market-open`);
      if (!res.ok) return false;
      return (await res.json()) as boolean;
    } catch {
      return false;
    }
  }

  private mapInstrument(i: BymaInstrument, market: string, assetType: string): PanelQuote {
    const symbol = (i.symbol ?? i.ticker ?? "").toUpperCase();
    return {
      symbol,
      name: i.description ?? i.name ?? symbol,
      assetType: mapAssetType(assetType, symbol),
      market: mapMarket(market),
      lastPrice: Number(i.lastPrice ?? 0),
      variationPct: Number(i.changePercentage ?? 0),
      bid: i.bid != null ? Number(i.bid) : null,
      ask: i.offer != null ? Number(i.offer) : null,
      open: i.openPrice != null ? Number(i.openPrice) : null,
      low: i.lowPrice != null ? Number(i.lowPrice) : null,
      high: i.highPrice != null ? Number(i.highPrice) : null,
      close: i.closePrice != null ? Number(i.closePrice) : null,
      volume: Number(i.volume ?? i.nominalVolume ?? 0),
      currency: "ARS",
    };
  }

  async getPanel(
    _creds: IolCredentials,
    market: string,
    assetType: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[] }> {
    // Mapear tipo de activo → endpoint de BYMADATA
    let endpoint: string;
    switch (assetType) {
      case "cedear":
        endpoint = "cedears";
        break;
      case "bono":
        endpoint = "public-bonds";
        break;
      case "accion":
        endpoint = "leading-equity";
        break;
      default:
        endpoint = "leading-equity";
    }

    const instruments = await this.postPanel(endpoint);
    const marketOpen = await this.getMarketOpen();

    const quotes = instruments
      .filter((i) => (i.symbol ?? i.ticker ?? "") !== "")
      .map((i) => this.mapInstrument(i, market, assetType))
      .filter((q) => q.lastPrice > 0); // descartar sin precio

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
    };
  }

  async getQuote(_creds: IolCredentials, symbol: string, market: string): Promise<Quote> {
    // Buscar el símbolo en los paneles disponibles
    const panels: BymaInstrument[][] = [];
    try {
      panels.push(await this.postPanel("leading-equity"));
      panels.push(await this.postPanel("cedears"));
      panels.push(await this.postPanel("public-bonds"));
    } catch {
      // si fallan los paneles, devolvemos cotización vacía honesta
    }

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
      };
    }

    return {
      symbol: target,
      market: mapMarket(market),
      lastPrice: Number(found.lastPrice ?? 0),
      variationPct: Number(found.changePercentage ?? 0),
      currency: "ARS",
      updatedAt: new Date().toISOString(),
    };
  }

  async getQuoteHistory(
    _creds: IolCredentials,
    symbol: string,
    _market: string,
    days: number
  ): Promise<{ date: string; close: number }[]> {
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - days * 24 * 60 * 60;
      const res = await fetch(
        `${API_BASE}/chart/historical-series/history?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}`,
        { headers: { "Content-Type": "application/json" } }
      );
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { t?: number[]; c?: number[] };
      if (!data.t || !data.c || data.t.length === 0) {
        return [];
      }
      return data.t.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString(),
        close: Number(data.c?.[i] ?? 0),
      }));
    } catch {
      return [];
    }
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
  async getMonthlyCloses(_c: IolCredentials, _a: string): Promise<MonthClose[]> {
    throw new Error("BymaDataProvider no maneja cierres");
  }
  async getMonthlyReport(_c: IolCredentials, _a: string, _m: string): Promise<MonthlyReport> {
    throw new Error("BymaDataProvider no maneja reportes");
  }
}

// ============================================================
// Mapeadores
// ============================================================

function mapMarket(market: string): PanelQuote["market"] {
  const m = market.toLowerCase();
  if (m.includes("nyse")) return "nyse";
  if (m.includes("nasdaq")) return "nasdaq";
  if (m.includes("bono") || m.includes("mae") || m.includes("bonds")) return "bonds";
  if (m.includes("fci") || m.includes("fondo")) return "fci";
  if (m.includes("crypto")) return "crypto";
  return "bcba";
}

function mapAssetType(assetType: string, symbol: string): PanelQuote["assetType"] {
  if (assetType === "cedear") return "cedear";
  if (assetType === "bono") return "bono";
  if (assetType === "accion") return "accion";
  // fallback por símbolo
  if (symbol.startsWith("CEDEAR")) return "cedear";
  return assetType as PanelQuote["assetType"];
}
