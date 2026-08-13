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
  user: { id: string; email: string; fullName: string | null };
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
    pageSize = 25
  ): Promise<PanelResponse> {
    return apiFetch(`/quotes/panel/${market}/${assetType}?page=${page}&pageSize=${pageSize}`);
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
}

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
