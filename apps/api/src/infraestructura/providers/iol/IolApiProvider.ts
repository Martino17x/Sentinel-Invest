import type { IolProvider } from "../../../services/iol/ports.js";
import type {
  IolCredentials,
  MonthClose,
  MonthlyReport,
  FciRedemptionRequest,
  FciSubscriptionRequest,
  Operation,
  OperationFilters,
  OrderRequest,
  OrderResult,
  PanelQuote,
  PanelSummary,
  PortfolioSummary,
  PortfolioSnapshotPoint,
  Position,
  Quote,
} from "../../../services/iol/types.js";
import { computeDayChange, buildDistributionByType, computeGainLossPct } from "../../../services/iol/portfolioMath.js";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { buildMonthlyCloses, buildMonthlyReport } from "../../../services/reports/reportBuilder.js";
import { MarketCode, SettlementType } from "@sentinel/domain";
import { IOL_API_BASE, type IolTokenResponse } from "./client.js";
import {
  mapMarketToIol,
  zeroQuote,
  mapMarket,
  mapAssetType,
  mapOperationType,
  mapOperationStatus,
  mapOperationStatusToIol,
  buildDistribution,
} from "./mappers.js";

/**
 * PROVEEDOR REAL — habla con la API de InvertirOnline.
 * Movido Commit 2: services/iol/IolApiProvider.ts → infraestructura/providers/iol/
 * Lógica idéntica; solo cambian imports + mappers externalizados.
 * Re-export en path viejo mantiene compat 1 sprint (Req 2).
 */

const API_BASE = IOL_API_BASE;

export class IolApiProvider implements IolProvider {
  /** Obtiene un access token fresco (login con credenciales) */
  private async login(creds: IolCredentials): Promise<IolTokenResponse> {
    const res = await fetch(`${API_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: creds.username,
        password: creds.password,
        grant_type: "password",
      }),
    });

    if (!res.ok) {
      throw new Error(`Error de autenticación IOL: HTTP ${res.status}`);
    }
    return res.json() as Promise<IolTokenResponse>;
  }

  /** Refresca el token con el refresh_token (para llamadas frecuentes) */
  private async refresh(refreshToken: string): Promise<IolTokenResponse> {
    const res = await fetch(`${API_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      throw new Error(`Error refrescando token IOL: HTTP ${res.status}`);
    }
    return res.json() as Promise<IolTokenResponse>;
  }

  /**
   * Convierte un error HTTP de IOL en un mensaje accionable, leyendo el body
   * (error/message/ModelState) y mapeando códigos comunes (saldo, permisos,
   * mercado cerrado, etc.).
   */
  private async throwIolError(path: string, res: Response): Promise<never> {
    let detail = "";
    try {
      const body = (await res.json()) as Record<string, unknown>;
      if (body && typeof body === "object") {
        const ms = body.ModelState as Record<string, string[]> | undefined;
        if (ms) {
          const first = Object.values(ms)[0];
          if (Array.isArray(first) && first.length) detail = String(first[0]);
        }
        detail =
          detail ||
          (typeof body.error === "string" ? body.error : "") ||
          (typeof body.message === "string" ? body.message : "") ||
          (typeof body.Message === "string" ? String(body.Message) : "");
      }
    } catch {
      /* sin body JSON */
    }
    const suffix = detail.trim() ? ` — ${detail.trim()}` : "";

    switch (res.status) {
      case 401:
        throw new Error(`Tus credenciales de IOL no son válidas o expiraron.${suffix}`);
      case 403:
        throw new Error(`IOL rechazó la operación (sin permisos o cuenta no habilitada).${suffix}`);
      case 400:
        throw new Error(`Datos de la orden inválidos (revisá saldo, cantidad y precio).${suffix}`);
      case 404:
        throw new Error(`No se encontró el recurso en IOL (404).${suffix}`);
      default:
        if (res.status >= 500) {
          throw new Error(`IOL no respondió correctamente (${res.status}). Intentá de nuevo más tarde.${suffix}`);
        }
        throw new Error(`Error de IOL (HTTP ${res.status}).${suffix}`);
    }
  }

  /** Request autenticada a la API v2 */
  private async api<T>(accessToken: string, path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      await this.throwIolError(path, res);
    }
    return res.json() as Promise<T>;
  }

  /** Request autenticada con body JSON (POST) a la API v2 */
  private async postJson<T>(accessToken: string, path: string, body: unknown): Promise<T | null> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      await this.throwIolError(path, res);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }
    return res.json() as Promise<T>;
  }

  /**
   * Ejecuta una orden de compra/venta contra la API real de IOL.
   *
   * Contrato verificado (referencia: iol-mcp de ramide1):
   *   POST /api/v2/operar/Comprar  |  POST /api/v2/operar/Vender
   *   body: { mercado, simbolo, cantidad, precio, plazo, validez }
   *   → { numeroOperacion?, ... }
   * La API SIEMPRE espera un precio por unidad: el tool resuelve el
   * precio de referencia (market) ANTES de llamar acá.
   */
  async placeOrder(
    creds: IolCredentials,
    _accountNumber: string,
    order: OrderRequest
  ): Promise<OrderResult> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    if (order.price === undefined || order.price <= 0) {
      throw new Error("La API de IOL requiere un precio por unidad (limit o referencia de mercado)");
    }

    const isD = order.specie === SettlementType.D;
    if (isD && order.market !== MarketCode.BCBA) {
      throw new Error(`Las órdenes en especie ${SettlementType.D} (MEP) solo operan en el mercado ${MarketCode.BCBA}`);
    }
    const orderPath = isD
      ? order.side === "buy" ? "/api/v2/operar/ComprarEspecieD" : "/api/v2/operar/VenderEspecieD"
      : order.side === "buy" ? "/api/v2/operar/Comprar" : "/api/v2/operar/Vender";
    const payload: Record<string, unknown> = {
      mercado: order.market,
      simbolo: order.symbol,
      cantidad: order.quantity,
      precio: order.price,
      plazo: order.term ?? "t1",
    };
    if (order.validity) {
      payload.validez = order.validity;
    }

    const data = await this.postJson<{
      numeroOperacion?: number;
      estado?: string;
      [key: string]: unknown;
    }>(token, orderPath, payload);

    const iolOperationId =
      data?.numeroOperacion !== undefined && data.numeroOperacion !== null
        ? String(data.numeroOperacion)
        : `pendiente-${Date.now()}`;

    return {
      iolOperationId,
      status: "pending",
      message: data
        ? `Orden enviada a IOL (operación ${iolOperationId})`
        : "Orden enviada a IOL (sin número de operación en la respuesta)",
    };
  }

  /** Request autenticada DELETE a la API v2 */
  private async deleteJson<T>(accessToken: string, path: string): Promise<T | null> {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      await this.throwIolError(path, res);
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return null;
    }
    return res.json() as Promise<T>;
  }

  /** Cancela una operación pendiente */
  async cancelOperation(creds: IolCredentials, operationNumber: string): Promise<OrderResult> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    await this.deleteJson<{
      numeroOperacion?: number;
      [key: string]: unknown;
    }>(token, `/api/v2/operaciones/${operationNumber}`);

    return {
      iolOperationId: String(operationNumber),
      status: "cancelled",
      message: `Operación ${operationNumber} cancelada`,
    };
  }

  /** Suscribe a un FCI (monto en pesos) */
  async subscribeFci(
    creds: IolCredentials,
    request: FciSubscriptionRequest
  ): Promise<OrderResult> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    const data = await this.postJson<{
      numeroOperacion?: number;
      [key: string]: unknown;
    }>(token, "/api/v2/operar/suscripcion/fci", {
      simbolo: request.symbol,
      monto: request.amount,
    });

    const iolOperationId =
      data?.numeroOperacion !== undefined && data.numeroOperacion !== null
        ? String(data.numeroOperacion)
        : `pendiente-${Date.now()}`;

    return {
      iolOperationId,
      status: "pending",
      message: data
        ? `Suscripción a FCI enviada (operación ${iolOperationId})`
        : "Suscripción a FCI enviada (sin número de operación en la respuesta)",
    };
  }

  /** Rescata cuotapartes de un FCI */
  async rescueFci(
    creds: IolCredentials,
    request: FciRedemptionRequest
  ): Promise<OrderResult> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    const data = await this.postJson<{
      numeroOperacion?: number;
      [key: string]: unknown;
    }>(token, "/api/v2/operar/rescate/fci", {
      simbolo: request.symbol,
      cantidad: request.quantity,
    });

    const iolOperationId =
      data?.numeroOperacion !== undefined && data.numeroOperacion !== null
        ? String(data.numeroOperacion)
        : `pendiente-${Date.now()}`;

    return {
      iolOperationId,
      status: "pending",
      message: data
        ? `Rescate de FCI enviado (operación ${iolOperationId})`
        : "Rescate de FCI enviado (sin número de operación en la respuesta)",
    };
  }
  async getPortfolio(creds: IolCredentials, accountNumber: string): Promise<PortfolioSummary> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    // 1. Estado de cuenta → efectivo y totales
    const estado = await this.api<{
      cuentas: {
        numero: string;
        tipo: string;
        moneda: string;
        disponible: number;
        titulosValorizados: number;
        total: number;
      }[];
    }>(token, "/api/v2/estadocuenta");

    // 2. Portafolio → posiciones (la cuenta puede ser "423827" o "423827-EEUU")
    const portafolio = await this.api<{
      pais: string;
      activos: {
        cantidad: number;
        comprometido: number;
        variacionDiaria: number;
        ultimoPrecio: number;
        ppc: number;
        gananciaPorcentaje: number;
        gananciaDinero: number;
        valorizado: number;
        titulo: {
          simbolo: string;
          descripcion: string;
          pais: string;
          mercado: string;
          tipo: string;
          plazo: string;
          moneda: string;
        };
      }[];
    }>(token, `/api/v2/portafolio/${accountNumber}`);

    // Buscar la cuenta que coincide (por numero o la de EEUU si es la usada)
    const _cuenta = estado.cuentas.find(
      (c) => c.numero === accountNumber
    ) ?? estado.cuentas[0];

    const positions: Position[] = portafolio.activos.map((a) => ({
      symbol: a.titulo.simbolo,
      name: a.titulo.descripcion,
      assetType: mapAssetType(a.titulo.tipo),
      market: mapMarket(a.titulo.mercado),
      quantity: a.cantidad,
      avgPrice: a.ppc,
      lastPrice: a.ultimoPrecio,
      currency: a.titulo.moneda.includes("dolar") ? "USD" : "ARS",
      totalValue: a.valorizado,
      gainLossPct: a.gananciaPorcentaje,
      gainLossAmount: a.gananciaDinero,
      dayChangePct: a.variacionDiaria,
    }));

    const cashArs = estado.cuentas.find((c) => c.moneda.includes("peso"))?.disponible ?? 0;
    const cashUsd = estado.cuentas.find((c) => c.moneda.includes("dolar") && c.tipo.includes("Argentina_Dolares"))?.disponible ?? 0;
    const positionsValueArs = positions
      .filter((p) => p.currency === "ARS")
      .reduce((s, p) => s + p.totalValue, 0);
    const positionsValueUsd = positions
      .filter((p) => p.currency === "USD")
      .reduce((s, p) => s + p.totalValue, 0);

    const totalArs = cashArs + positionsValueArs;
    const totalUsd = cashUsd + positionsValueUsd;

    const gainLossArs = positions.reduce((s, p) => s + p.gainLossAmount, 0);

    // Ganancia del día REAL: ponderada por la variación diaria de cada posición
    const dayChange = computeDayChange(positions);

    return {
      accountNumber,
      cashArs,
      cashUsd,
      positionsValueArs,
      positionsValueUsd,
      totalArs,
      totalUsd,
      gainLossArs,
      gainLossUsd: 0,
      gainLossPct: computeGainLossPct(gainLossArs, totalArs),
      dayChangePct: dayChange.pct,
      dayChangeAmountArs: dayChange.amountArs,
      dayChangeAmountUsd: dayChange.amountUsd,
      distribution: buildDistribution(positions, cashArs, cashUsd),
      distributionByType: buildDistributionByType(positions, cashArs, cashUsd),
      positions,
    };
  }

  async getOperations(
    creds: IolCredentials,
    _accountNumber: string,
    filters?: OperationFilters
  ): Promise<Operation[]> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    const params = new URLSearchParams();
    if (filters?.from) params.set("fechaDesde", filters.from);
    if (filters?.to) params.set("fechaHasta", filters.to);
    if (filters?.status) params.set("estado", mapOperationStatusToIol(filters.status));
    const query = params.toString();
    const path = query ? `/api/v2/operaciones?${query}` : "/api/v2/operaciones";

    const data = await this.api<unknown[]>(token, path);
    return data.map((op: any) => ({
      iolOperationId: String(op.numero ?? op.id ?? "op-unknown"),
      symbol: op.simbolo ?? "",
      market: mapMarket(op.mercado ?? "bcba"),
      type: mapOperationType(op.tipo ?? "buy"),
      status: mapOperationStatus(op.estado ?? "accepted"),
      quantity: Number(op.cantidad ?? 0),
      price: Number(op.precio ?? 0),
      total: Number(op.monto ?? 0),
      commission: Number(op.comision ?? 0),
      currency: op.moneda?.includes("dolar") ? "USD" : "ARS",
      date: op.fecha ?? new Date().toISOString(),
    }));
  }

  async getPortfolioHistory(
    _creds: IolCredentials,
    _accountNumber: string,
    _days: number
  ): Promise<PortfolioSnapshotPoint[]> {
    return [];
  }

  async getQuote(creds: IolCredentials, symbol: string, market: string): Promise<Quote> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    const marketCode = mapMarketToIol(market);
    const url = `${API_BASE}/api/v2/${marketCode}/Titulos/${encodeURIComponent(symbol)}/Cotizacion`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        return zeroQuote(symbol, market);
      }
      const data = (await res.json()) as Record<string, unknown>;
      const lastPrice = Number(data.ultimoPrecio ?? 0);
      const prevClose = data.cierreAnterior != null ? Number(data.cierreAnterior) : null;
      const variation =
        prevClose && prevClose > 0 && lastPrice > 0
          ? ((lastPrice - prevClose) / prevClose) * 100
          : Number(data.variacionPorcentual ?? data.variacion ?? 0);
      return {
        symbol: String(data.simbolo ?? symbol),
        market: mapMarket(market),
        lastPrice,
        variationPct: variation,
        currency:
          String(data.moneda ?? "").includes("dolar")
            ? "USD"
            : market === "bcba" || market === "bonds"
              ? "ARS"
              : "USD",
        name: data.descripcion ? String(data.descripcion) : undefined,
        updatedAt: new Date().toISOString(),
        bid: data.puntaCompra != null ? Number(data.puntaCompra) : data.bid != null ? Number(data.bid) : null,
        ask: data.puntaVenta != null ? Number(data.puntaVenta) : data.ask != null ? Number(data.ask) : null,
        open: data.apertura != null ? Number(data.apertura) : null,
        high: data.maximo != null ? Number(data.maximo) : null,
        low: data.minimo != null ? Number(data.minimo) : null,
        prevClose,
        volume: data.volumenNominal != null ? Number(data.volumenNominal) : null,
      };
    } catch {
      return zeroQuote(symbol, market);
    }
  }

  async getQuoteHistory(
    creds: IolCredentials,
    symbol: string,
    market: string,
    days: number
  ): Promise<{ date: string; close: number }[]> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    const to = new Date();
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const marketCode = mapMarketToIol(market);
    const url = `${API_BASE}/api/v2/${marketCode}/Titulos/${encodeURIComponent(symbol)}/Cotizacion/seriehistorica/${fmt(from)}/${fmt(to)}/ajustada`;

    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const data = (await res.json()) as { fechaHora?: string; ultimoPrecio?: number }[];
      if (!Array.isArray(data)) return [];
      return data
        .filter((d) => d.fechaHora && d.ultimoPrecio != null)
        .map((d) => ({
          date: new Date(d.fechaHora as string).toISOString(),
          close: Number(d.ultimoPrecio),
        }));
    } catch {
      return [];
    }
  }

  async getPanel(
    creds: IolCredentials,
    market: string,
    assetType: string,
    page?: number,
    pageSize?: number,
    _q?: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }> {
    void creds;
    void market;
    void assetType;
    void page;
    void pageSize;

    const quotes: PanelQuote[] = [];

    return {
      summary: {
        market: mapMarket(market),
        assetType,
        totalVariationPct: 0,
        updatedAt: new Date().toISOString(),
        isRealtime: false,
      },
      quotes,
      total: 0,
    };
  }

  async getMonthlyCloses(creds: IolCredentials, accountNumber: string): Promise<MonthClose[]> {
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.iolAccountNumber, accountNumber));
    if (!account) return [];
    return buildMonthlyCloses(account.id, creds, this);
  }

  async getMonthlyReport(
    creds: IolCredentials,
    accountNumber: string,
    month: string
  ): Promise<MonthlyReport> {
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.iolAccountNumber, accountNumber));
    if (!account) {
      throw new Error(`No existe la cuenta IOL ${accountNumber} — los reportes requieren snapshots sincronizados`);
    }
    return buildMonthlyReport(account.id, creds, this, month);
  }
}
