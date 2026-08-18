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
  cash: number;
  currency: string;
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

export const analysisApi = {
  async getAnalysis(symbol: string, market?: AnalysisMarket): Promise<{ analysis: Analysis }> {
    const query = market ? `?market=${market}` : "";
    return apiFetch(`/analysis/${encodeURIComponent(symbol)}${query}`);
  },
};

export const reportsApi = {
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
