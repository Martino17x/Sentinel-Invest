/**
 * Cliente API central.
 *
 * Maneja:
 * - El access token en memoria (se pierde al recargar la página → se recupera con /refresh)
 * - El refresh automático cuando el token expira (401 → POST /api/auth/refresh → reintenta)
 * - La cookie httpOnly del refresh token (la maneja el navegador sola)
 */

const BASE_URL = "/api";

interface AuthResponse {
  user: User;
  accessToken: string;
}

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** Pide un access token nuevo usando la cookie httpOnly */
async function refreshAccessToken(): Promise<string | null> {
  // Si ya hay un refresh en curso, reusarlo (evita refreshes en paralelo)
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include", // obligatorio: la cookie viaja con la request
        });
        if (!res.ok) return null;
        const data = (await res.json()) as AuthResponse;
        accessToken = data.accessToken;
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

/** Request autenticada con reintento automático si el token expiró */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Token expirado → intentar refresh UNA vez y reintentar.
  // Solo si HABÍA token: un 401 sin token significa "sesión inexistente",
  // no "token expirado" — no tiene sentido intentar refrescar.
  if (res.status === 401 && accessToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });
    }
  }

  if (!res.ok) {
    let message = `Error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* sin body JSON */
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content — no hay body que parsear
  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ============================================================
// Endpoints tipados
// ============================================================

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface Position {
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  quantity: number;
  avgPrice: number;
  lastPrice: number;
  currency: string;
  totalValue: number;
  gainLossPct: number;
  gainLossAmount: number;
  dayChangePct: number;
}

export interface PortfolioSummary {
  accountNumber: string;
  cashArs: number;
  cashUsd: number;
  positionsValueArs: number;
  positionsValueUsd: number;
  totalArs: number;
  totalUsd: number;
  gainLossArs: number;
  gainLossUsd: number;
  gainLossPct: number;
  dayChangePct: number;
  dayChangeAmountArs: number;
  dayChangeAmountUsd: number;
  distribution: { label: string; pct: number }[];
  distributionByType: DistributionByTypeItem[];
  positions: Position[];
}

export interface DistributionByTypeItem {
  type: string;
  label: string;
  pct: number;
  amountArs: number;
  amountUsd: number;
}

export interface PortfolioSnapshotPoint {
  capturedAt: string;
  totalValue: number;
  totalValueUsd: number;
  cashArs: number;
  cashUsd: number;
  positionsValue: number;
  dayChangePct: number;
  unrealizedGain: number;
  source: string;
}

export interface Operation {
  iolOperationId: string;
  symbol: string;
  market: string;
  type: string;
  status: string;
  quantity: number;
  price: number;
  total: number;
  commission: number;
  currency: string;
  date: string;
}

export interface PanelQuote {
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  lastPrice: number;
  variationPct: number;
  bid: number | null;
  ask: number | null;
  open: number | null;
  low: number | null;
  high: number | null;
  close: number | null;
  volume: number;
  currency: string;
  isFavorite?: boolean;
}

export interface PanelSummary {
  market: string;
  assetType: string;
  totalVariationPct: number;
  updatedAt: string;
  isRealtime: boolean;
}

export interface PanelResponse {
  summary: PanelSummary;
  quotes: PanelQuote[];
  total?: number;
}

export interface MonthClose {
  month: string;
  closingValueArs: number;
  closingValueUsd: number;
  twrPct: number;
  grossChangeArs: number;
  netContributionsArs: number;
}

export interface MonthlyReport {
  month: string;
  closingValueArs: number;
  closingValueUsd: number;
  previousClosingValueArs: number;
  previousClosingValueUsd: number;
  grossChangeArs: number;
  grossChangePct: number;
  twrPct: number;
  twrArs: number;
  netContributionsArs: number;
  realizedGainArs: number;
  unrealizedGainArs: number;
  buys: Operation[];
  sells: Operation[];
  totalBuysArs: number;
  totalSellsArs: number;
  commissionsArs: number;
  dividendsArs: number;
  bestDay: { date: string; pct: number } | null;
  worstDay: { date: string; pct: number } | null;
  benchmarkPct: number;
  fxChangePct: number;
  series: { date: string; valueArs: number; benchmark: number }[];
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  loginMethod: "google" | "password";
  createdAt: string;
}

export const profileApi = {
  async get(): Promise<{ profile: UserProfile }> {
    return apiFetch("/profile");
  },

  async update(fullName: string): Promise<{ profile: UserProfile }> {
    return apiFetch("/profile", {
      method: "PATCH",
      body: JSON.stringify({ fullName }),
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return apiFetch("/profile/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

export const authApi = {
  async register(email: string, password: string, fullName?: string): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName }),
    });
    accessToken = data.accessToken;
    return data;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    accessToken = data.accessToken;
    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } finally {
      accessToken = null;
    }
  },

  async me(): Promise<{ user: User | null; accessToken?: string }> {
    return apiFetch("/auth/me");
  },
};

export const portfolioApi = {
  async get(): Promise<{ portfolio: PortfolioSummary }> {
    return apiFetch("/portfolio");
  },

  async getHistory(days = 90): Promise<{ history: PortfolioSnapshotPoint[] }> {
    return apiFetch(`/portfolio/history?days=${days}`);
  },
};

export const operationsApi = {
  async getAll(): Promise<{ operations: Operation[] }> {
    return apiFetch("/operations");
  },
};
// ============================================================
// Órdenes — operar contra IOL desde la app (POST /api/orders)
// ============================================================

export type OrderSide = "buy" | "sell";
export type PriceType = "market" | "limit";
export type OrderMarket = "bcba" | "nyse" | "nasdaq" | "bonds";
export type OrderTerm = "t0" | "t1" | "t2";

export interface CreateOrderInput {
  symbol: string;
  side: OrderSide;
  qty: number;
  priceType?: PriceType;
  price?: number;
  market?: OrderMarket;
  term?: OrderTerm;
  validity?: "1d" | "7d" | string;
  specie?: "D";
}

export interface FciSubscriptionInput {
  symbol: string;
  amount: number;
}

export interface FciRedemptionInput {
  symbol: string;
  quantity: number;
}

export interface OrderResult {
  ok: boolean;
  orderId: string;
  status: string;
  message?: string;
}

export const ordersApi = {
  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    return apiFetch("/orders", { method: "POST", body: JSON.stringify(input) });
  },
  async cancelOrder(operationNumber: string | number): Promise<OrderResult> {
    return apiFetch(`/orders/${encodeURIComponent(String(operationNumber))}/cancel`, {
      method: "POST",
    });
  },
  async subscribeFci(input: FciSubscriptionInput): Promise<OrderResult> {
    return apiFetch("/orders/fci/subscribe", { method: "POST", body: JSON.stringify(input) });
  },
  async rescueFci(input: FciRedemptionInput): Promise<OrderResult> {
    return apiFetch("/orders/fci/rescue", { method: "POST", body: JSON.stringify(input) });
  },
};


export const quotesApi = {
  async getPanel(
    market: string,
    assetType: string,
    page = 1,
    pageSize = 25,
    q?: string
  ): Promise<PanelResponse> {
    const query = q ? `&q=${encodeURIComponent(q)}` : "";
    return apiFetch(`/quotes/panel/${market}/${assetType}?page=${page}&pageSize=${pageSize}${query}`);
  },

  async getQuote(symbol: string, market: string): Promise<{ quote: Quote }> {
    return apiFetch(`/quotes/${symbol}?market=${market}`);
  },

  async getQuoteHistory(
    symbol: string,
    market: string,
    days = 90
  ): Promise<{ history: { date: string; close: number }[] }> {
    return apiFetch(`/quotes/${symbol}/history?days=${days}&market=${market}`);
  },
};

export interface Quote {
  symbol: string;
  market: string;
  lastPrice: number;
  variationPct: number;
  currency: string;
  updatedAt: string;
  name?: string;
  bid?: number | null;
  ask?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  volume?: number | null;
}

export interface DolarQuote {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

export const ratesApi = {
  async getDolares(): Promise<{ dolares: DolarQuote[] }> {
    return apiFetch("/rates/dolares");
  },
};

// ============================================================
// Análisis profundo — GET /api/analysis/:symbol?market=
// (técnico + fundamental + señal, fuente Yahoo Finance)
// ============================================================

export type AnalysisMarket = "bcba" | "nyse" | "nasdaq";

export interface AnalysisMacd {
  macd: number;
  signal: number;
  histogram: number;
  prevHistogram: number | null;
}

export interface AnalysisTechnicals {
  price: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  macd: AnalysisMacd | null;
  volumeRatio: number | null;
  position52w: number | null;
  trend: number | null;
}

export interface AnalysisFundamentals {
  pe: number | null;
  eps: number | null;
  beta: number | null;
  margin: number | null;
  roe: number | null;
  debtEquity: number | null;
  dividendYield: number | null;
  marketCap: number | null;
}

export interface AnalysisSignalFactor {
  id: string;
  label: string;
  weight: number;
  score: number;
  detail: string;
}

export interface AnalysisSignal {
  score: number;
  verdict: "bullish" | "neutral" | "bearish";
  breakdown: AnalysisSignalFactor[];
}

export interface Analysis {
  symbol: string;
  tickerYahoo: string;
  market: AnalysisMarket | null;
  name: string | null;
  status: "ok" | "symbol_not_found" | "rate_limited" | "down";
  price: number | null;
  changePct: number | null;
  currency: string | null;
  range52w: { low: number | null; high: number | null };
  isMarketClosed: boolean;
  lastCloseDate: string | null;
  cached: boolean;
  stale?: boolean;
  technicals: AnalysisTechnicals | null;
  fundamentals: AnalysisFundamentals | null;
  signal: AnalysisSignal | null;
  series: { date: string; close: number }[];
  summary: string;
}

// ============================================================
// Portfolio-analysis — Insights (Fase A/C) — envelope canónico
// spec 0.1: data T|null, cached boolean, source string, error?
// Backend: GET /api/analysis/:symbol/insights?market=bcba|nyse|nasdaq
// ============================================================

export type InsightBlockStatus = "ok" | "error";

export interface InsightBlock<T> {
  status: InsightBlockStatus;
  data: T | null;
  cached: boolean;
  source: string;
  error?: string;
}

export interface FundamentalsData {
  source: "yahoo" | "simplywallst";
  pe: number | null;
  eps: number | null;
  beta: number | null;
  margin: number | null;
  roe: number | null;
  debtEquity: number | null;
  dividendYield: number | null;
  marketCap: number | null;
}

export interface ConsensusData {
  source: "tradingview";
  targetHigh: number | null;
  targetLow: number | null;
  targetAvg: number | null;
  recommendation: "buy" | "overweight" | "hold" | "underweight" | "sell" | null;
  rating: { buys: number | null; holds: number | null; sells: number | null } | null;
  nextEarningsDate: string | null;
  currency: string | null;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  symbol: string | null;
  summary: string | null;
}

export interface NewsData {
  source: "tradingview" | "yahoo";
  items: NewsItem[];
}

export interface InsightsData {
  symbol: string;
  market: string;
  generatedAt: string;
  insights: {
    fundamentals: InsightBlock<FundamentalsData>;
    consensus: InsightBlock<ConsensusData>;
    news: InsightBlock<NewsData>;
  };
}

export interface ScreenerRow {
  symbol: string;
  name: string | null;
  market: "bcba" | "us";
  price: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  pe: number | null;
}

export const analysisApi = {
  async getAnalysis(symbol: string, market?: AnalysisMarket): Promise<{ analysis: Analysis }> {
    const query = market ? `?market=${market}` : "";
    return apiFetch(`/analysis/${encodeURIComponent(symbol)}${query}`);
  },

  async getInsights(symbol: string, market?: AnalysisMarket): Promise<InsightsData> {
    const q = market ? `?market=${market}` : "";
    return apiFetch<InsightsData>(`/analysis/${encodeURIComponent(symbol)}/insights${q}`);
  },
};

export const screenerApi = {
  async getScreener(
    market: "bcba" | "us" = "bcba",
    query?: string,
  ): Promise<{ screener: ScreenerRow[]; rows: ScreenerRow[]; count: number; cached: boolean; source: string; market: string }> {
    const qs = new URLSearchParams({ market });
    if (query?.trim()) qs.set("q", query.trim());
    return apiFetch(`/analysis/screener?${qs.toString()}`);
  },
};

export const newsApi = {
  async getFeed(limit = 5): Promise<{ items: NewsItem[]; news: NewsItem[]; count: number }> {
    return apiFetch(`/analysis/news/feed?limit=${limit}`);
  },
  async getDetail(id: string): Promise<{ news: NewsItem; item: NewsItem }> {
    return apiFetch(`/analysis/news/${encodeURIComponent(id)}`);
  },
};

export const reportsApi = {
  async history(days = 90): Promise<{ history: PortfolioSnapshotPoint[] }> {
    return apiFetch(`/portfolio/history?days=${days}`);
  },

  async getMonthlyCloses(): Promise<{ closes: MonthClose[] }> {
    return apiFetch("/portfolio/reports");
  },

  async getMonthlyReport(month: string): Promise<{ report: MonthlyReport }> {
    return apiFetch(`/portfolio/reports/${month}`);
  },
};

// ============================================================
// Serie diaria + calendario mensual — desde portfolio_snapshots
// (F1/F2). El calendario devuelve TODOS los días del mes: los que
// no tienen snapshot llegan con totalValue/cash en null — el
// frontend NUNCA inventa datos (spec F2-R3), los muestra vacíos.
// ============================================================

export interface SeriesDay {
  date: string;
  totalValue: number;
  totalValueUsd: number;
  cashArs: number;
  cashUsd: number;
  positionsValue: number;
  dayChangePct: number;
  unrealizedGain: number;
  source: string;
}

export interface SeriesPositionPoint {
  date: string;
  symbol: string;
  market: string;
  quantity: number;
  lastPrice: number | null;
  totalValue: number;
}

export interface SeriesResponse {
  days: SeriesDay[];
  positions?: SeriesPositionPoint[];
}

export const seriesApi = {
  async get(from: string, to?: string, includePositions = false): Promise<SeriesResponse> {
    const toParam = to ? `&to=${to}` : "";
    const positions = includePositions ? "&includePositions=true" : "";
    return apiFetch(`/portfolio/series?from=${from}${toParam}${positions}`);
  },
};

export interface CalendarDay {
  date: string;
  totalValue: number | null;
  dayChangePct: number | null;
  source: string | null;
  cashArs: number | null;
  cashUsd: number | null;
  movementCount: number;
}

export interface MonthCalendar {
  month: string;
  days: CalendarDay[];
  bestDay: { date: string; pct: number } | null;
  worstDay: { date: string; pct: number } | null;
  monthReturn: number | null;
}

export const calendarApi = {
  async getMonth(month: string): Promise<MonthCalendar> {
    return apiFetch(`/portfolio/calendar/${month}`);
  },
};

// ============================================================
// Movimientos de efectivo (cash ledger) — cash_movements
// (F3-B6, F3-C1). GET lista (filtros), POST registro manual,
// PATCH confirm/reject, DELETE, import IOL (preview + confirm).
// ============================================================

export type MovementSource = "manual" | "imported" | "detected";
export type MovementStatus = "confirmed" | "pending" | "rejected";
export type MovementType = "deposit" | "withdrawal" | "dividend" | "caucion" | "adjustment";

export interface Movement {
  id: string;
  date: string;
  amount: number;
  currency: "ARS" | "USD";
  type: MovementType;
  source: MovementSource;
  status: MovementStatus;
  description: string | null;
  iolReference: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface ImportRowPreview {
  row: number;
  parsed: {
    nroMov: string;
    liquidDate: string | null;
    monto: number;
    currency: "ARS" | "USD";
    tipo: MovementType;
    tipoMov: string;
  };
  valid: boolean;
  errors: string[];
}

export interface ImportPreview {
  preview: ImportRowPreview[];
  summary: { total: number; valid: number; invalid: number; byType: Record<string, number> };
  errors: string[];
}

export interface CreateMovementInput {
  date: string;
  amount: number;
  currency: "ARS" | "USD";
  type: MovementType;
  description?: string;
}

export const movementsApi = {
  async list(params: { status?: MovementStatus; source?: MovementSource } = {}): Promise<{ movements: Movement[] }> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.source) qs.set("source", params.source);
    const q = qs.toString();
    return apiFetch(`/portfolio/movements${q ? `?${q}` : ""}`);
  },

  async create(input: CreateMovementInput): Promise<{ movement: Movement }> {
    return apiFetch("/portfolio/movements", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async decide(id: string, status: "confirmed" | "rejected"): Promise<{ movement: Movement }> {
    return apiFetch(`/portfolio/movements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  async remove(id: string): Promise<void> {
    return apiFetch(`/portfolio/movements/${id}`, { method: "DELETE" });
  },

  // Preview del export HTML de IOL: el backend espera el HTML CRUDO
  // como cuerpo de texto (express.text). Enviamos text/plain.
  async importPreview(html: string): Promise<ImportPreview> {
    return apiFetch("/portfolio/movements/import", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: html,
    });
  },

  async importConfirm(rows: ImportRowPreview["parsed"][]): Promise<{ imported: number; skipped: number }> {
    return apiFetch("/portfolio/movements/import/confirm", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
  },
};

// ============================================================
// Métricas de cartera — GET /api/portfolio/metrics (F3-A1, D11)
// Devuelve volatilidad, sharpe, maxDrawdown, correlación Merval,
// YTD, retorno del período y la rf usada (default 0).
// ============================================================

export interface PortfolioMetrics {
  volatility: number;
  sharpe: number | null;
  maxDrawdown: number;
  mervalCorrelation: number | null;
  ytd: number | null;
  periodReturn: number;
  rf: number;
}

export const metricsApi = {
  async get(params: { from?: string; to?: string; days?: number; rf?: number } = {}): Promise<PortfolioMetrics> {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.days) qs.set("days", String(params.days));
    if (params.rf !== undefined) qs.set("rf", String(params.rf));
    const q = qs.toString();
    return apiFetch(`/portfolio/metrics${q ? `?${q}` : ""}`);
  },
};

export interface IolConnectionState {
  connected: boolean;
  connection: {
    id: string;
    iolUsername: string;
    isActive: boolean;
    createdAt: string;
  } | null;
  accounts: {
    id: string;
    iolAccountNumber: string;
    name: string;
    currency: string;
  }[];
}

export const connectionsApi = {
  async getState(): Promise<IolConnectionState> {
    return apiFetch("/connections");
  },

  async connect(input: {
    iolUsername: string;
    iolPassword: string;
    iolAccountNumber: string;
  }): Promise<{
    connection: { id: string; iolUsername: string };
    accounts: { id: string; iolAccountNumber: string; name: string }[];
  }> {
    return apiFetch("/connections", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async disconnect(): Promise<{ ok: boolean }> {
    return apiFetch("/connections", { method: "DELETE" });
  },
};

// ============================================================
// Agente — sesiones de chat persistidas (el streaming SSE vive
// en lib/agent-chat.ts; acá solo la gestión REST de sesiones)
// ============================================================

export interface AgentSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolCalls: unknown;
  createdAt: string;
}

export const agentApi = {
  async listSessions(): Promise<{ sessions: AgentSession[] }> {
    return apiFetch("/agent/sessions");
  },

  async getSession(
    id: string
  ): Promise<{ session: AgentSession; messages: AgentChatMessage[] }> {
    return apiFetch(`/agent/sessions/${id}`);
  },

  async deleteSession(id: string): Promise<void> {
    return apiFetch(`/agent/sessions/${id}`, { method: "DELETE" });
  },

  async approveOrder(id: string): Promise<{ ok: boolean; message: string }> {
    return apiFetch(`/agent/orders/${id}/approve`, { method: "POST" });
  },

  async rejectOrder(id: string): Promise<{ ok: boolean; message: string }> {
    return apiFetch(`/agent/orders/${id}/reject`, { method: "POST" });
  },
};

// ============================================================
// API Keys — claves personales para agentes externos (MCP).
// El secreto se devuelve UNA vez al crearla; el listado NUNCA
// incluye el hash ni el secreto (verifica server).
// ============================================================

export type ApiKeyScope = "read" | "trade";

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scope: ApiKeyScope;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export const apiKeysApi = {
  async list(): Promise<{ keys: ApiKeySummary[] }> {
    return apiFetch("/apikeys");
  },

  async create(input: {
    name: string;
    scope: ApiKeyScope;
  }): Promise<{ key: ApiKeySummary & { secret: string } }> {
    return apiFetch("/apikeys", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async revoke(id: string): Promise<{ key: ApiKeySummary }> {
    return apiFetch(`/apikeys/${id}/revoke`, { method: "POST" });
  },

  async enable(id: string): Promise<{ key: ApiKeySummary }> {
    return apiFetch(`/apikeys/${id}/enable`, { method: "POST" });
  },
};
