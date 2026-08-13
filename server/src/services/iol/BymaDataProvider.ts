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
  // Estructura REAL de BYMADATA (verificado 13/08/2026 con mercado abierto):
  trade?: number; // último precio operado
  previousClosingPrice?: number; // cierre anterior (para calcular variación)
  previousSettlementPrice?: number;
  openingPrice?: number; // apertura
  tradingHighPrice?: number; // máximo
  tradingLowPrice?: number; // mínimo
  bidPrice?: number; // precio compra
  offerPrice?: number; // precio venta
  tradeVolume?: number; // volumen operado
  volumeAmount?: number; // monto operado
  denominationCcy?: string; // moneda (ARS/USD)
  securityType?: string; // tipo de instrumento
  securitySubType?: string;
  tradeHour?: string;
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
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Referer: "https://open.bymadata.com.ar/",
        Origin: "https://open.bymadata.com.ar",
      },
      body: JSON.stringify(REQUEST_BODY),
    });

    if (!res.ok) {
      throw new Error(`BYMADATA ${endpoint}: HTTP ${res.status}`);
    }

    const json = (await res.json()) as BymaResponse | BymaInstrument[];
    // La respuesta de BYMADATA es un ARRAY DIRECTO de instrumentos
    // (NO un objeto {data: [...]} — eso es del wrapper de paginación
    //  que usan otros endpoints)
    if (Array.isArray(json)) {
      return json;
    }
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
    const lastPrice = Number(i.trade ?? 0);
    const prevClose = Number(i.previousClosingPrice ?? i.previousSettlementPrice ?? 0);
    const variationPct =
      prevClose > 0 && lastPrice > 0
        ? ((lastPrice - prevClose) / prevClose) * 100
        : 0;

    return {
      symbol,
      name: i.description ?? i.name ?? symbol,
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
      volume: Number(i.tradeVolume ?? 0),
      currency: i.denominationCcy === "USD" ? "USD" : "ARS",
    };
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

    // Paginación local: BYMADATA pagina en bloques, nosotros tomamos la
    // página del array completo (consistente entre endpoints)
    const allQuotes = instruments
      .filter((i) => (i.symbol ?? i.ticker ?? "") !== "")
      .map((i) => this.mapInstrument(i, market, assetType))
      .filter((q) => q.lastPrice > 0); // descartar sin precio

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
      lastPrice: Number(found.trade ?? 0),
      variationPct:
        Number(found.previousClosingPrice ?? 0) > 0 && Number(found.trade ?? 0) > 0
          ? ((Number(found.trade) - Number(found.previousClosingPrice)) / Number(found.previousClosingPrice)) * 100
          : 0,
      currency: found.denominationCcy === "USD" ? "USD" : "ARS",
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
  if (assetType === "on") return "bono"; // ONs se muestran como bonos
  if (assetType === "caucion") return "caucion";
  // fallback por símbolo
  if (symbol.startsWith("CEDEAR")) return "cedear";
  return assetType as PanelQuote["assetType"];
}
