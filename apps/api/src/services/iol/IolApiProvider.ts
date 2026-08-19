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
  Position,
  Quote,
} from "./types.js";
import { computeDayChange, buildDistributionByType, computeGainLossPct } from "./portfolioMath.js";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { buildMonthlyCloses, buildMonthlyReport } from "../reports/reportBuilder.js";

/**
 * PROVEEDOR REAL — habla con la API de InvertirOnline.
 *
 * Flujo:
 * 1. POST /token con usuario+contraseña → access_token (20min) + refresh_token
 * 2. Cada request lleva Authorization: Bearer <access_token>
 * 3. Cuando expira → POST /token con grant_type=refresh_token → par nuevo
 *
 * VERIFICADO con datos reales (13/08/2026):
 * - /api/v2/estadocuenta → cuentas con disponible/titulosValorizados/total
 * - /api/v2/portafolio/423827-EEUU → posiciones GD35/MRCUO/NVDA
 * - /api/v2/operaciones → []
 */

const API_BASE = "https://api.invertironline.com";

interface IolTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

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

    const isD = order.specie === "D";
    if (isD && order.market !== "bCBA") {
      throw new Error("Las órdenes en especie D (MEP) solo operan en el mercado bCBA");
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

  async getOperations(creds: IolCredentials, _accountNumber: string): Promise<Operation[]> {
    const { access_token: token } = await this.login(creds);
    if (!token) throw new Error("IOL no devolvió access token");

    const data = await this.api<unknown[]>(token, "/api/v2/operaciones");
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
    creds: IolCredentials,
    accountNumber: string,
    days: number
  ): Promise<PortfolioSnapshotPoint[]> {
    // TODO: cuando IOL tenga histórico de portafolio, se sincronizan los snapshots.
    // Por ahora devolvemos un punto actual para no romper el frontend.
    const portfolio = await this.getPortfolio(creds, accountNumber);
    const points: PortfolioSnapshotPoint[] = [];
    for (let i = days; i >= 0; i -= 7) {
      points.push({
        capturedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        totalValue: portfolio.totalArs,
        cash: portfolio.cashArs,
        currency: "ARS",
      });
    }
    return points;
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
        // Si IOL falla (endpoints de mercado inestables), devolver cotización
        // vacía honesta → el wrapper con fallback a BYMADATA la reemplaza.
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
    // NOTA: los endpoints /api/v2/PanelCotizaciones y /api/v2/Paneles de IOL
    // devuelven HTTP 500 incluso con token válido (verificado 13/08/2026).
    // Es un bug del lado de IOL. Hasta que lo arreglen, el frontend muestra
    // un estado vacío con mensaje claro en lugar de romper.
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
    // Sin cuenta en BD no hay snapshots — devolver [] honesto
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

// ============================================================
// Mapeadores
// ============================================================

function mapMarketToIol(market: string): string {
  const m = market.toLowerCase();
  if (m.includes("nyse")) return "nYSE";
  if (m.includes("nasdaq")) return "nASDAQ";
  if (m.includes("rofx")) return "rOFX";
  return "bCBA";
}

function zeroQuote(symbol: string, market: string): Quote {
  return {
    symbol,
    market: mapMarket(market),
    lastPrice: 0,
    variationPct: 0,
    currency: market === "bcba" || market === "bonds" ? "ARS" : "USD",
    updatedAt: new Date().toISOString(),
    open: null,
    high: null,
    low: null,
    prevClose: null,
    volume: null,
  };
}

function mapMarket(market: string): Position["market"] {
  const m = market.toLowerCase();
  if (m.includes("nyse")) return "nyse";
  if (m.includes("nasdaq")) return "nasdaq";
  if (m.includes("bono") || m.includes("mae")) return "bonds";
  if (m.includes("fci") || m.includes("fondo")) return "fci";
  if (m.includes("crypto")) return "crypto";
  return "bcba";
}

function mapAssetType(tipo: string): Position["assetType"] {
  const t = tipo.toLowerCase();
  if (t.includes("cedear")) return "cedear";
  if (t.includes("bono") || t.includes("titulo") || t.includes("publico")) return "bono";
  if (t.includes("fci") || t.includes("fondo")) return "fci";
  if (t.includes("caucion")) return "caucion";
  if (t.includes("futuro")) return "futuro";
  if (t.includes("opcion")) return "opcion";
  if (t.includes("moneda")) return "moneda";
  return "accion";
}

function mapOperationType(tipo: string): Operation["type"] {
  const t = tipo.toLowerCase();
  if (t.includes("venta") || t.includes("sell")) return "sell";
  if (t.includes("rescate") || t.includes("redemption")) return "redemption";
  if (t.includes("suscripcion") || t.includes("subscription")) return "subscription";
  return "buy";
}

function mapOperationStatus(estado: string): Operation["status"] {
  const s = estado.toLowerCase();
  if (s.includes("pend")) return "pending";
  if (s.includes("rech")) return "rejected";
  if (s.includes("cancel")) return "cancelled";
  return "accepted";
}

function buildDistribution(
  positions: Position[],
  cashArs: number,
  cashUsd: number
): { label: string; pct: number }[] {
  const totalArs = cashArs + positions.filter((p) => p.currency === "ARS").reduce((s, p) => s + p.totalValue, 0);
  const totalUsd = cashUsd + positions.filter((p) => p.currency === "USD").reduce((s, p) => s + p.totalValue, 0);
  const total = totalArs + totalUsd;
  if (total === 0) return [];

  const dist: { label: string; pct: number }[] = [];
  if (cashArs > 0) dist.push({ label: "PESOS", pct: (cashArs / total) * 100 });
  if (cashUsd > 0) dist.push({ label: "DOLAR", pct: (cashUsd / total) * 100 });

  for (const p of positions) {
    dist.push({ label: p.symbol, pct: (p.totalValue / total) * 100 });
  }

  // Normalizar a 100%
  const sum = dist.reduce((s, d) => s + d.pct, 0);
  return dist.map((d) => ({ ...d, pct: Number(((d.pct / sum) * 100).toFixed(1)) }));
}
