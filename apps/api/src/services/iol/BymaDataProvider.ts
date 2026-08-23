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

const API_BASE = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free";

import { getInstrumentDisplayName } from "./instrumentNames.js";
import type { BondSchedule, BondCashflow } from "../market/bonds/types.js";
import { buildSchedule } from "../market/bonds/cashflow.js";
// T-006: parser dedicado BYMA ficha
import {
  parseBymaFichaToSchedule,
  inferMaeTipo as inferMaeTipoFromParser,
  parseInteresToCouponRate as parseInteresImpl,
  parseFormaAmortizacion as parseFormaImpl,
  isCallableTexto,
} from "../market/bonds/bymaFichaParser.js";
import type { BymaFicha as BymaFichaParserType } from "../market/bonds/bymaFichaParser.js";

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
  excludeZeroPxAndQty: false,
  T1: true,
  T0: false,
  page_size: 5000,
};

// Cache simple para paneles BYMA: evita N*3 fetches concurrentes cuando
// virtualPortfolios hace Promise.all(N getQuote). TTL 30s + dedup inflight.
const PANEL_TTL_MS = 30_000;
const QUOTE_TIMEOUT_MS = 4_000;

export class BymaDataProvider implements IolProvider {
  // Cache de paneles (endpoint -> datos + expiración) + dedup de requests inflight
  private panelCache = new Map<string, { data: BymaInstrument[]; expiresAt: number }>();
  private panelInflight = new Map<string, Promise<BymaInstrument[]>>();

  private async postPanel(endpoint: string, signal?: AbortSignal): Promise<BymaInstrument[]> {
    // Hit de cache
    const cached = this.panelCache.get(endpoint);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    // Dedup: si ya hay un fetch inflight para este endpoint, reutilizarlo
    const inflight = this.panelInflight.get(endpoint);
    if (inflight) return inflight;

    const promise = this.fetchPanel(endpoint, signal);
    this.panelInflight.set(endpoint, promise);
    try {
      const data = await promise;
      this.panelCache.set(endpoint, { data, expiresAt: Date.now() + PANEL_TTL_MS });
      return data;
    } finally {
      this.panelInflight.delete(endpoint);
    }
  }

  private async fetchPanel(endpoint: string, outerSignal?: AbortSignal): Promise<BymaInstrument[]> {
    // AbortSignal con timeout 4s + propagación de signal externo si existe
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
    const onOuterAbort = () => controller.abort();
    if (outerSignal) {
      if (outerSignal.aborted) controller.abort();
      else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
    }
    // También soportar AbortSignal.timeout si está disponible como fallback
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/${endpoint}`, {
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
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }

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
    const tradePx = Number(i.trade ?? 0);
    const prevClose = Number(i.previousClosingPrice ?? i.previousSettlementPrice ?? 0);
    // Fin de semana / sin volumen: BYMA devuelve trade 0 pero previousClosingPrice tiene el cierre.
    // Mostrar el último cierre como lastPrice para que el instrumento no desaparezca fuera de horario.
    const lastPrice = tradePx > 0 ? tradePx : prevClose > 0 ? prevClose : 0;
    const variationPct =
      prevClose > 0 && lastPrice > 0
        ? ((lastPrice - prevClose) / prevClose) * 100
        : 0;
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

  /** Público — raw BYMA ficha para consumidores avanzados (panel/ficha). */
  async getBondFichaRaw(symbol: string, signal?: AbortSignal): Promise<BymaFicha | null> {
    return this.fetchBondFicha(symbol.toUpperCase().trim(), signal);
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
          tipo: schedule.tipo === "bullet" ? inferMaeTipo(fallback) : schedule.tipo,
          vencimiento: schedule.vencimiento,
          cashflows: fallback,
          cerAjustado: schedule.cerAjustado,
        });
      }
    }

    return schedule;
  }

  private async fetchBondFicha(symbol: string, signal?: AbortSignal): Promise<BymaFicha | null> {
    const url = `${API_BASE}/bnown/fichatecnica/especies/general`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Referer: "https://open.bymadata.com.ar/",
          Origin: "https://open.bymadata.com.ar",
        },
        body: JSON.stringify({ symbol }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (!r.ok) {
        throw new Error(`BYMA ficha ${symbol}: HTTP ${r.status}`);
      }
      const json = (await r.json()) as { data?: BymaFicha[]; empty?: boolean };
      if (json.empty || !json.data || json.data.length === 0) return null;
      return json.data[0] ?? null;
    } catch (err) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      // No tirar si es ficha inexistente — retornar null para fallback
      if (err instanceof Error && err.message.includes("HTTP 4")) return null;
      throw err;
    }
  }

  private normalizeFichaToSchedule(symbol: string, ficha: BymaFicha | null): BondSchedule {
    // Delegar al parser dedicado T-006 (soporta callable + step-up range)
    // Mantener compat con BymaFicha local type → castear a parser type
    return parseBymaFichaToSchedule(symbol, ficha as unknown as BymaFichaParserType | null);
  }

  private async fetchMaeDetalleFallback(symbol: string, signal?: AbortSignal): Promise<BondCashflow[] | null> {
    // MAE H/B — buscar detalle[] para symbol
    const letras: ("B" | "H")[] = /^BP/.test(symbol) ? ["B", "H"] : ["H", "B"];
    for (const letra of letras) {
      try {
        const url = `https://api.marketdata.mae.com.ar/api/emisiones/flujofondoscotiz/${letra}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8_000);
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort, { once: true });
        const r = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (!r.ok) continue;
        const arr = (await r.json()) as Array<{ especie: string; detalle: Array<{ fechaPago: string; vr?: number; cashFlow: number; renta: number; amortizacion: number }> }>;
        const found = arr.find((it) => it.especie.toUpperCase() === symbol);
        if (found && found.detalle?.length) {
          return found.detalle.map((d) => ({
            fechaPago: d.fechaPago.slice(0, 10),
            renta: Number(d.renta ?? 0),
            amortizacion: Number(d.amortizacion ?? 0),
            cashFlow: Number(d.cashFlow ?? Number(d.renta ?? 0) + Number(d.amortizacion ?? 0)),
            vr: Number(d.vr ?? 100),
          }));
        }
      } catch {
        // probar siguiente letra
      }
    }
    return null;
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

// Re-export thin wrappers delegando al parser dedicado (T-006 compat)
// Mantiene import path estable para tests legacy (import from BymaDataProvider)
export type { ParsedCoupon, ParsedAmortizacion } from "../market/bonds/bymaFichaParser.js";
export function parseInteresToCouponRate(raw: string | null | undefined): import("../market/bonds/bymaFichaParser.js").ParsedCoupon | null {
  return parseInteresImpl(raw);
}
export function parseFormaAmortizacion(raw: string | null | undefined): import("../market/bonds/bymaFichaParser.js").ParsedAmortizacion {
  return parseFormaImpl(raw) as import("../market/bonds/bymaFichaParser.js").ParsedAmortizacion;
}
// Helpers internos ahora delegados — wrappers para compat
function parseFecha(raw?: string): string | null {
  if (!raw) return null;
  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}
function inferVencimientoFallback(symbol: string): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}
function inferMoneda(ficha: BymaFicha | null): "ARS" | "USD" {
  const m = (ficha?.moneda ?? "").toLowerCase();
  if (m.includes("dolar")) return "USD";
  if (m.includes("usd") || m.includes("dólar")) return "USD";
  if (m.includes("dolar linked")) return "USD";
  return "ARS";
}
function isCerFicha(ficha: BymaFicha | null): boolean {
  if (!ficha) return false;
  const hay = `${ficha.moneda ?? ""} ${ficha.interes ?? ""} ${ficha.formaAmortizacion ?? ""}`.toLowerCase();
  return hay.includes("cer") || hay.includes("uv") || hay.includes("ajustable");
}
function inferTipo(ficha: BymaFicha | null): BondSchedule["tipo"] {
  if (!ficha) return "bullet";
  const texto = `${ficha.formaAmortizacion ?? ""} ${ficha.interes ?? ""}`.toLowerCase();
  if (texto.includes("rescat") || texto.includes("callable")) return "callable" as BondSchedule["tipo"];
  if (isCerFicha(ficha)) return "cer";
  if (texto.includes("step") || texto.includes("escalon")) return "step-up";
  if (texto.includes("al vencimiento") || texto.includes("bullet") || texto.includes("integra al vencimiento")) return "bullet";
  if (texto.includes("cuota") || texto.includes("amortiz")) return "amortizable";
  if ((ficha.tipoEspecie ?? "").toLowerCase().includes("letra")) return "bullet";
  return "amortizable";
}
function inferMaeTipo(detalle: BondCashflow[]): BondSchedule["tipo"] {
  return inferMaeTipoFromParser(detalle);
}
function parseCashflowsFromFicha(ficha: BymaFicha, vencimiento: string): BondCashflow[] {
  // Delegar al parser dedicado si disponible, fallback simple bullet
  const parsed = parseBymaFichaToSchedule("TMP", ficha as unknown as import("../market/bonds/bymaFichaParser.js").BymaFicha | null, { vencimientoOverride: vencimiento });
  return parsed.cashflows.length ? parsed.cashflows : [{ fechaPago: vencimiento, renta: 0, amortizacion: 100, cashFlow: 100, vr: 0 }];
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
