import type { BrokerProvider, MarketDataPort } from "../../../services/iol/ports.js";
import type {
  BrokerCredentials,
  PanelQuote,
  PanelSummary,
  PortfolioSummary,
  PortfolioSnapshotPoint,
  MonthClose,
  MonthlyReport,
  Operation,
  OperationFilters,
  Quote,
} from "../../../services/iol/types.js";
import { BrokerError } from "../../../services/iol/types.js";
import { PpiApiClient, PPI_API_BASE } from "./client.js";
import {
  mapCanonicalToPpiMarket,
  mapPpiMarketToCanonical,
  mapPpiOperationStatusToCanonical,
  mapPpiOperationToCanonical,
  mapPpiPortfolioToCanonical,
  mapPpiQuoteToCanonical,
  mapPpiHistoryToCanonical,
  mapPpiPanelToCanonical,
  mapPpiStatusToPpiQuery,
  parsePpiSymbol,
  zeroQuotePpi,
  type PpiOperationRaw,
  type PpiPortfolioRaw,
  type PpiQuoteRaw,
  type PpiHistoryPointRaw,
} from "./mappers.js";

/**
 * PPI Provider — Adapter MarketDataPort (Commit 3, Req 6).
 * Implementa BrokerProvider (MarketDataPort completo, resto stubs Fase 1).
 * Usa PpiApiClient + mappers para normalizar a contratos canónicos.
 * Paginación PPI cursor vs offset → shape canónico (slice local).
 * Registrado en registry.ts con factory ppi → (userId) => new PpiProvider().
 */

export class PpiProvider implements BrokerProvider {
  private readonly client: PpiApiClient;

  constructor(client?: PpiApiClient, private readonly baseUrl: string = PPI_API_BASE) {
    this.client = client ?? new PpiApiClient(baseUrl);
  }

  private async getToken(creds: BrokerCredentials): Promise<string> {
    const tok = await this.client.authenticate(creds.username, creds.password);
    if (!tok.access_token) throw new BrokerError("PPI no devolvió access_token", "auth", { brokerType: "ppi" });
    return tok.access_token;
  }

  // ------------------------------------------------------------
  // MarketDataPort
  // ------------------------------------------------------------

  async getQuote(creds: BrokerCredentials, symbol: string, market: string): Promise<Quote> {
    const parsed = parsePpiSymbol(symbol);
    const ppiMarket = mapCanonicalToPpiMarket(market);
    let token: string;
    try {
      token = await this.getToken(creds);
    } catch (e) {
      if (e instanceof BrokerError) throw e;
      throw new BrokerError(String((e as Error).message ?? "Auth PPI falló"), "auth", {
        brokerType: "ppi",
        cause: e,
      });
    }

    const cleanSymbol = parsed.symbol;
    // Intento 1: path estilo IOL (compat PPI legacy)
    const paths = [
      `/api/v2/${ppiMarket}/Titulos/${encodeURIComponent(cleanSymbol)}/Cotizacion`,
      `/api/v1/cotizaciones/${encodeURIComponent(cleanSymbol)}?mercado=${encodeURIComponent(ppiMarket)}`,
      `/cotizaciones/${encodeURIComponent(ppiMarket)}/${encodeURIComponent(cleanSymbol)}`,
    ];

    for (const path of paths) {
      try {
        const raw = await this.client.authenticatedGet<PpiQuoteRaw>(token, path);
        // Si la respuesta es envoltorio { data } o array, normalizar
        const quoteRaw = (raw as unknown as { data?: PpiQuoteRaw })?.data ?? raw;
        if (quoteRaw && typeof quoteRaw === "object" && ("ultimoPrecio" in quoteRaw || "lastPrice" in quoteRaw || "trade" in quoteRaw)) {
          return mapPpiQuoteToCanonical(quoteRaw as PpiQuoteRaw, market);
        }
        // Si vino array con 1 elemento
        if (Array.isArray(raw) && raw.length > 0) {
          return mapPpiQuoteToCanonical(raw[0] as PpiQuoteRaw, market);
        }
      } catch (err) {
        if (err instanceof BrokerError && err.code === "requires2FA") throw err;
        // Si es 404, probar siguiente path; si es otro error, devolver zeroQuote
        if (err instanceof BrokerError && err.code === "notFound") continue;
        // Para otros errores (auth, rateLimit) propagar
        if (err instanceof BrokerError && (err.code === "auth" || err.code === "rateLimit")) throw err;
        // Error de red/fetch → zero fallback
        break;
      }
    }
    return zeroQuotePpi(symbol, market);
  }

  async getQuoteHistory(
    creds: BrokerCredentials,
    symbol: string,
    market: string,
    days: number
  ): Promise<{ date: string; close: number }[]> {
    const parsed = parsePpiSymbol(symbol);
    const ppiMarket = mapCanonicalToPpiMarket(market);
    let token: string;
    try {
      token = await this.getToken(creds);
    } catch (e) {
      if (e instanceof BrokerError) throw e;
      throw new BrokerError(String((e as Error).message ?? "Auth PPI falló"), "auth", {
        brokerType: "ppi",
        cause: e,
      });
    }

    const cleanSymbol = parsed.symbol;
    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const paths = [
      `/api/v2/${ppiMarket}/Titulos/${encodeURIComponent(cleanSymbol)}/Cotizacion/seriehistorica/${fmt(from)}/${fmt(to)}/ajustada`,
      `/api/v1/cotizaciones/${encodeURIComponent(cleanSymbol)}/historico?from=${fmt(from)}&to=${fmt(to)}&mercado=${encodeURIComponent(ppiMarket)}`,
    ];

    for (const path of paths) {
      try {
        const raw = await this.client.authenticatedGet<PpiHistoryPointRaw[] | { data: PpiHistoryPointRaw[] }>(
          token,
          path
        );
        const arr = Array.isArray(raw) ? raw : (raw as { data: PpiHistoryPointRaw[] })?.data ?? [];
        if (Array.isArray(arr) && arr.length > 0) {
          return mapPpiHistoryToCanonical(arr);
        }
        // Si no hay datos, probar siguiente path o devolver []
        if (Array.isArray(arr)) return mapPpiHistoryToCanonical(arr);
      } catch (err) {
        if (err instanceof BrokerError && err.code === "requires2FA") throw err;
        if (err instanceof BrokerError && err.code === "notFound") continue;
        if (err instanceof BrokerError && (err.code === "auth" || err.code === "rateLimit")) throw err;
        break;
      }
    }
    return [];
  }

  async getPanel(
    creds: BrokerCredentials,
    market: string,
    assetType: string,
    page = 1,
    pageSize = 25,
    q?: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }> {
    let token: string;
    try {
      token = await this.getToken(creds);
    } catch (e) {
      if (e instanceof BrokerError) throw e;
      throw new BrokerError(String((e as Error).message ?? "Auth PPI falló"), "auth", {
        brokerType: "ppi",
        cause: e,
      });
    }

    const ppiMarket = mapCanonicalToPpiMarket(market);

    // Intentar endpoint panel PPI; si no existe, caer a cotizaciones bulk
    const paths = [
      `/api/v2/Cotizaciones/Panel?mercado=${encodeURIComponent(ppiMarket)}&tipo=${encodeURIComponent(assetType)}`,
      `/api/v1/panel/${encodeURIComponent(ppiMarket)}/${encodeURIComponent(assetType)}`,
      `/api/v2/${ppiMarket}/Titulos/Cotizacion/Panel`,
    ];

    let panelQuotes: Quote[] = [];
    let total = 0;

    for (const path of paths) {
      try {
        const raw = await this.client.authenticatedGet<unknown>(token, path);
        const mapped = mapPpiPanelToCanonical(raw as never, market, assetType);
        if (mapped.quotes.length > 0) {
          panelQuotes = mapped.quotes;
          total = mapped.total;
          break;
        }
        // Si vino vacío pero total>0, igual break para aplicar filtro local
        if (mapped.total > 0) {
          panelQuotes = mapped.quotes;
          total = mapped.total;
          break;
        }
      } catch (err) {
        if (err instanceof BrokerError && err.code === "requires2FA") throw err;
        if (err instanceof BrokerError && err.code === "notFound") continue;
        if (err instanceof BrokerError && (err.code === "auth" || err.code === "rateLimit")) throw err;
        break;
      }
    }

    // Si PPI no devolvió panel (endpoint no implementado), devolver vacío
    // y dejar que registry BYMA fallback lo resuelva si MARKET_DATA_PROVIDER_PPI=auto/byma.
    if (panelQuotes.length === 0 && total === 0) {
      return {
        summary: {
          market: mapPpiMarketToCanonical(market),
          assetType,
          totalVariationPct: 0,
          updatedAt: new Date().toISOString(),
          isRealtime: false,
        },
        quotes: [],
        total: 0,
      };
    }

    // Filtro server-side q antes de paginar (PPI puede ignorar q)
    const query = q?.trim().toUpperCase();
    const filtered: Quote[] = query
      ? panelQuotes.filter(
          (qq) =>
            qq.symbol.toUpperCase().includes(query) ||
            (qq.name ?? "").toUpperCase().includes(query)
        )
      : panelQuotes;

    // Paginación offset canónica (PPI cursor → offset): slice local
    const effectiveTotal = filtered.length;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    // Convertir Quote[] → PanelQuote[] (shape panel)
    const quotes: PanelQuote[] = slice.map((qq) => ({
      symbol: qq.symbol,
      name: qq.name ?? qq.symbol,
      assetType: assetType as PanelQuote["assetType"],
      market: qq.market,
      lastPrice: qq.lastPrice,
      variationPct: qq.variationPct,
      bid: qq.bid ?? null,
      ask: qq.ask ?? null,
      open: qq.open ?? null,
      low: qq.low ?? null,
      high: qq.high ?? null,
      close: qq.prevClose ?? null,
      volume: qq.volume ?? null,
      currency: qq.currency,
    }));

    const avgVariation =
      quotes.length > 0 ? quotes.reduce((s, qq) => s + qq.variationPct, 0) / quotes.length : 0;

    return {
      summary: {
        market: mapPpiMarketToCanonical(market),
        assetType,
        totalVariationPct: avgVariation,
        updatedAt: new Date().toISOString(),
        isRealtime: false,
      },
      quotes,
      total: effectiveTotal,
    };
  }

  // ------------------------------------------------------------
  // PortfolioPort + OperationsPort — Commit 4 (Req 6,7)
  // Mapea GET /cuentas + /portafolio/{acc} → PortfolioSummary
  // y GET /operaciones?fechaDesde&fechaHasta&estado&numero&pais → Operation[]
  // ------------------------------------------------------------
  async getPortfolio(creds: BrokerCredentials, accountNumber: string): Promise<PortfolioSummary> {
    let token: string;
    try {
      token = await this.getToken(creds);
    } catch (e) {
      if (e instanceof BrokerError) throw e;
      throw new BrokerError(String((e as Error).message ?? "Auth PPI falló"), "auth", {
        brokerType: "ppi",
        cause: e,
      });
    }

    // PPI expone portfolio en múltiples rutas; probar en orden prioridad
    const portfolioPaths = [
      `/api/v2/portafolio/${encodeURIComponent(accountNumber)}`,
      `/api/v2/cuentas/${encodeURIComponent(accountNumber)}/portafolio`,
      `/portafolio/${encodeURIComponent(accountNumber)}`,
      `/cuentas/${encodeURIComponent(accountNumber)}/portafolio`,
    ];

    // Cuentas/estado para cash — intentar paralelo con portfolio
    const cuentasPaths = [
      `/api/v2/cuentas`,
      `/api/v2/estadocuenta`,
      `/cuentas`,
      `/estadocuenta`,
    ];

    let cuentasRaw: unknown = null;
    for (const p of cuentasPaths) {
      try {
        const raw = await this.client.authenticatedGet<unknown>(token, p);
        if (raw != null) {
          cuentasRaw = raw;
          break;
        }
      } catch (err) {
        if (err instanceof BrokerError && err.code === "requires2FA") throw err;
        if (err instanceof BrokerError && err.code === "notFound") continue;
        if (err instanceof BrokerError && (err.code === "auth" || err.code === "rateLimit")) throw err;
        break;
      }
    }

    for (const p of portfolioPaths) {
      try {
        const raw = await this.client.authenticatedGet<PpiPortfolioRaw>(token, p);
        if (raw && typeof raw === "object") {
          // Normalizar envoltorios: { data: {...} } o array
          const unwrapped = (raw as { data?: PpiPortfolioRaw }).data ?? raw;
          const portfolioLike = unwrapped as PpiPortfolioRaw;
          // Si cuentas no vino en portfolio pero sí en /cuentas, mergear
          if (cuentasRaw) {
            const cuentasArr = Array.isArray(cuentasRaw)
              ? (cuentasRaw as unknown[])
              : ((cuentasRaw as { cuentas?: unknown[]; data?: unknown[] }).cuentas ??
                (cuentasRaw as { data?: unknown[] }).data ??
                []);
            if (Array.isArray(cuentasArr) && !(portfolioLike.cuentas && portfolioLike.cuentas.length)) {
              (portfolioLike as Record<string, unknown>).cuentas = cuentasArr;
            } else if (
              Array.isArray(cuentasRaw) &&
              !(portfolioLike.cuentas && portfolioLike.cuentas.length) &&
              Array.isArray(cuentasArr)
            ) {
              (portfolioLike as Record<string, unknown>).cuentas = cuentasArr;
            }
          }
          // Si trae activos o posiciones, mapear
          const hasPositions =
            Array.isArray((portfolioLike as Record<string, unknown>).activos) ||
            Array.isArray((portfolioLike as Record<string, unknown>).posiciones) ||
            Array.isArray((portfolioLike as Record<string, unknown>).positions);
          if (hasPositions || Array.isArray((portfolioLike as Record<string, unknown>).cuentas)) {
            return mapPpiPortfolioToCanonical(portfolioLike, accountNumber);
          }
          // Si es array directo de posiciones (lista), envolver
          if (Array.isArray(unwrapped)) {
            return mapPpiPortfolioToCanonical({ activos: unwrapped as never }, accountNumber);
          }
        }
      } catch (err) {
        if (err instanceof BrokerError && err.code === "requires2FA") throw err;
        if (err instanceof BrokerError && err.code === "notFound") continue;
        if (err instanceof BrokerError && (err.code === "auth" || err.code === "rateLimit")) throw err;
        break;
      }
    }

    // Fallback: si cuentas se obtuvo pero portfolio no, intentar construir con cuentas vacías
    // (evita throw si PPI devuelve 404 en portfolio pero sí tiene cuentas)
    if (cuentasRaw) {
      const cuentasArr = Array.isArray(cuentasRaw)
        ? (cuentasRaw as PpiPortfolioRaw["cuentas"])
        : ((cuentasRaw as { cuentas?: PpiPortfolioRaw["cuentas"]; data?: PpiPortfolioRaw["cuentas"] }).cuentas ??
          (cuentasRaw as { data?: PpiPortfolioRaw["cuentas"] }).data ??
          []);
      if (Array.isArray(cuentasArr)) {
        return mapPpiPortfolioToCanonical({ cuentas: cuentasArr as never, activos: [] }, accountNumber);
      }
    }

    throw new BrokerError(`No se pudo obtener portfolio PPI para cuenta ${accountNumber}`, "notFound", {
      brokerType: "ppi",
    });
  }

  async getPortfolioHistory(
    _creds: BrokerCredentials,
    _accountNumber: string,
    _days: number
  ): Promise<PortfolioSnapshotPoint[]> {
    return [];
  }

  async getMonthlyCloses(_creds: BrokerCredentials, _accountNumber: string): Promise<MonthClose[]> {
    return [];
  }

  async getMonthlyReport(
    _creds: BrokerCredentials,
    _accountNumber: string,
    _month: string
  ): Promise<MonthlyReport> {
    throw new BrokerError("PPI MonthlyReport no soportado — usar snapshots locales", "unknown", { brokerType: "ppi" });
  }

  async getOperations(
    creds: BrokerCredentials,
    _accountNumber: string,
    filters?: OperationFilters
  ): Promise<Operation[]> {
    let token: string;
    try {
      token = await this.getToken(creds);
    } catch (e) {
      if (e instanceof BrokerError) throw e;
      throw new BrokerError(String((e as Error).message ?? "Auth PPI falló"), "auth", {
        brokerType: "ppi",
        cause: e,
      });
    }

    const params = new URLSearchParams();
    if (filters?.from) params.set("fechaDesde", filters.from);
    if (filters?.to) params.set("fechaHasta", filters.to);
    if (filters?.status) params.set("estado", mapPpiStatusToPpiQuery(filters.status));
    // PPI soporta paginación y filtros extra numero/pais — pasar through si vienen en filters extentido
    const extra = filters as Record<string, string | undefined>;
    if (extra.numero) params.set("numero", extra.numero);
    if (extra.pais) params.set("pais", extra.pais);
    // Compat page param si existe
    if (extra.page) params.set("page", extra.page);
    if (extra.pageSize) params.set("pageSize", extra.pageSize);

    const query = params.toString();
    const paths = [
      `/api/v2/operaciones${query ? `?${query}` : ""}`,
      `/operaciones${query ? `?${query}` : ""}`,
      `/api/v2/operaciones/historial${query ? `?${query}` : ""}`,
    ];

    for (const path of paths) {
      try {
        const raw = await this.client.authenticatedGet<unknown>(token, path);
        const arr: PpiOperationRaw[] = Array.isArray(raw)
          ? (raw as PpiOperationRaw[])
          : ((raw as { data?: PpiOperationRaw[]; operaciones?: PpiOperationRaw[]; content?: PpiOperationRaw[] })?.data ??
            (raw as { operaciones?: PpiOperationRaw[] })?.operaciones ??
            (raw as { content?: PpiOperationRaw[] })?.content ??
            []);
        if (Array.isArray(arr)) {
          // Filtros locales por si PPI ignora query
          let filtered = arr.map((o) => mapPpiOperationToCanonical(o));
          if (filters?.from) filtered = filtered.filter((op) => op.date.slice(0, 10) >= filters.from!);
          if (filters?.to) filtered = filtered.filter((op) => op.date.slice(0, 10) <= filters.to!);
          if (filters?.status) filtered = filtered.filter((op) => op.status === filters.status);
          return filtered;
        }
      } catch (err) {
        if (err instanceof BrokerError && err.code === "requires2FA") throw err;
        if (err instanceof BrokerError && err.code === "notFound") continue;
        if (err instanceof BrokerError && (err.code === "auth" || err.code === "rateLimit")) throw err;
        break;
      }
    }
    return [];
  }

  // Trading/FCI no incluidos Fase 1
  async placeOrder(): Promise<never> {
    throw new BrokerError("Trading no habilitado Fase 1", "unknown", { brokerType: "ppi" });
  }
  async cancelOperation(): Promise<never> {
    throw new BrokerError("Trading no habilitado Fase 1", "unknown", { brokerType: "ppi" });
  }
  async subscribeFci(): Promise<never> {
    throw new BrokerError("FCI no habilitado Fase 1", "unknown", { brokerType: "ppi" });
  }
  async rescueFci(): Promise<never> {
    throw new BrokerError("FCI no habilitado Fase 1", "unknown", { brokerType: "ppi" });
  }

  // Compat con MarketDataPort opcional
  async getBondFichaRaw(): Promise<null> {
    return null;
  }
  async getBondSchedule(): Promise<never> {
    throw new BrokerError("getBondSchedule no implementado para PPI", "unknown", { brokerType: "ppi" });
  }
}
