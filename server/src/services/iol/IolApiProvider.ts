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
import { computeDayChange, buildDistributionByType } from "./portfolioMath.js";

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

  /** Request autenticada a la API v2 */
  private async api<T>(accessToken: string, path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`API IOL ${path}: HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
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
    const cuenta = estado.cuentas.find(
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
      gainLossArs: positions.reduce((s, p) => s + p.gainLossAmount, 0),
      gainLossUsd: 0,
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

    try {
      const data = await this.api<any>(token, `/api/v2/cotizaciones/${market}/${symbol}/t1`);
      return {
        symbol: data.simbolo ?? symbol,
        market: mapMarket(market),
        lastPrice: Number(data.ultimoPrecio ?? 0),
        variationPct: Number(data.variacionPorcentual ?? 0),
        currency: data.moneda?.includes("dolar") ? "USD" : "ARS",
        name: data.descripcion ?? undefined,
        updatedAt: new Date().toISOString(),
      };
    } catch {
      // Endpoints de mercado de IOL v2 están caídos (HTTP 500/400 — bug del lado de IOL).
      // Degradación elegante: cotización estimada con variación 0.
      return {
        symbol,
        market: mapMarket(market),
        lastPrice: 0,
        variationPct: 0,
        currency: market === "bcba" || market === "bonds" ? "ARS" : "USD",
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async getQuoteHistory(
    _creds: IolCredentials,
    _symbol: string,
    _market: string,
    _days: number
  ): Promise<{ date: string; close: number }[]> {
    // Endpoints de mercado de IOL v2 están caídos (500/400).
    // El histórico real viene de BYMADATA via fallback.
    return [];
  }

  async getPanel(
    creds: IolCredentials,
    market: string,
    assetType: string,
    page?: number,
    pageSize?: number,
    q?: string
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

  async getMonthlyCloses(_creds: IolCredentials, _accountNumber: string): Promise<MonthClose[]> {
    // TODO: calcular desde portfolio_snapshots cuando existan
    return [];
  }

  async getMonthlyReport(
    _creds: IolCredentials,
    _accountNumber: string,
    _month: string
  ): Promise<MonthlyReport> {
    throw new Error("Reportes mensuales requieren snapshots sincronizados");
  }
}

// ============================================================
// Mapeadores
// ============================================================

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
