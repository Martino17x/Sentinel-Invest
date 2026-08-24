/**
 * Cliente API central.
 *
 * Maneja:
 * - El access token en memoria (se pierde al recargar la página → se recupera con /refresh)
 * - El refresh automático cuando el token expira (401 → POST /api/auth/refresh → reintenta)
 * - La cookie httpOnly del refresh token (la maneja el navegador sola)
 */

import type { PortfolioSnapshotPoint, Operation } from "../features/portafolio/api";

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
export async function refreshAccessToken(): Promise<string | null> {
  // Si ya hay un refresh en curso, reusarlo (evita refreshes en paralelo)
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include", // obligatorio: la cookie viaja con la request
        });
        if (!res.ok) {
          accessToken = null;
          return null;
        }
        const data = (await res.json()) as AuthResponse;
        accessToken = data.accessToken;
        return data.accessToken;
      } catch {
        accessToken = null;
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
  const isPublicAuthRoute = /^\/auth\/(refresh|login|register|me)(?:\/|$)/.test(path);
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken && !isPublicAuthRoute) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // Token ausente o expirado → intentar refresh UNA vez y reintentar.
  // Las rutas de autenticación manejan sus propios 401 y no deben entrar en loop.
  let hasRetried = false;
  if (res.status === 401 && !isPublicAuthRoute && !hasRetried) {
    hasRetried = true;
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

// TODO SDD7: remove shim when external quotesApi consumers =0 — Gate 2026-08-24: 3 hits (InstrumentPicker, OperarSymbolPage, QuoteDetailPage via lib/api)
// `grep quotesApi|PanelQuote outside cotizaciones` → 3 consumers → shim retained. Full lib/api consumers grep =60+ out of scope SDD7.
// Shim transitorio — fuente única vive en features/cotizaciones/api.ts (mover, no duplicar). wc -l 1140 → SDD7 target ≤120 tras migrar resto de apis.
export * from "../features/cotizaciones/api";

// Shim portafolio — fuente única en features/portafolio/api.ts (SDD dashboard-features-resto C2)
// Decisión profileApi: permanece en lib/api.ts hasta fase auth (commit 6) — va a features/auth junto a authApi/connectionsApi (design SDD7). No mover ahora.
export * from "../features/portafolio/api";

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

export type NewsProvider = "gnews" | "finnhub" | "tradingview" | "yahoo";

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  symbol: string | null;
  summary: string | null;
  /** Canonical image field (primary). Null when provider has no image. */
  image?: string | null;
  /** Alias for image — legacy consumers reading imageUrl */
  imageUrl?: string | null;
  /** Canonical long description (GNews description / Finnhub summary) */
  description?: string | null;
  /** Full body when available (GNews content) */
  content?: string | null;
  /** Alias for url (legacy consumers using link) */
  link?: string;
  /** Origin provider of this item */
  provider?: NewsProvider;
  /** True when fallback degraded (TV title-only, quota hit) */
  degraded?: boolean;
}

export interface NewsData {
  source: NewsProvider;
  items: NewsItem[];
  degraded?: boolean;
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
// Radar CCL — GET /api/radar/ccl (S3.2, radar-ccl)
// Envelope: CclResponse { status, generatedAt, cclPromedio,
//   disclaimer, isMarketClosed, items: RadarRow[], total, page, limit }
// ============================================================

export interface RadarRow {
  symbol: string;
  name: string;
  yahooSymbol: string;
  cedearPrice: number;
  underlyingPrice: number | null;
  ratio: number;
  currency: "ARS" | "USD";
  ccl: number | null;
  spreadVsAvg: number | null;
  status: "ok" | "symbol_not_found" | "rate_limited" | "down";
  lastCloseDate: string | null;
  stale: boolean;
  cclSource?: "byma_usd" | "yahoo" | null;
}

export interface CclResponse {
  status: "ok" | "partial";
  generatedAt: string;
  cclPromedio: number | null;
  disclaimer: string;
  isMarketClosed: boolean;
  items: RadarRow[];
  total: number;
  page: number;
  limit: number;
}

export type RadarSource = "all" | "byma_usd" | "yahoo";

export interface RadarCclParams {
  q?: string;
  page?: number;
  limit?: number;
  sort?: "spread" | "symbol";
  source?: RadarSource;
}

function buildRadarCclQuery(params: RadarCclParams = {}): string {
  const qs = new URLSearchParams();
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.sort) qs.set("sort", params.sort);
  if (params.source && params.source !== "all") qs.set("source", params.source);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const radarApi = {
  async getCcl(params: RadarCclParams = {}): Promise<CclResponse> {
    return apiFetch<CclResponse>(`/radar/ccl${buildRadarCclQuery(params)}`);
  },
  /** Alias de getCcl — compatibilidad con design spec (radarApi.getRadar) */
  async getRadar(params: RadarCclParams = {}): Promise<CclResponse> {
    return apiFetch<CclResponse>(`/radar/ccl${buildRadarCclQuery(params)}`);
  },
};

// Shim renta-fija — fuente única en features/renta-fija/api.ts (SDD dashboard-features-resto C1)
export * from "../features/renta-fija/api";

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
