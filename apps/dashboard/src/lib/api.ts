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
export * from "../features/portafolio/api";

// Shim reportes — fuente única en features/reportes/api.ts (SDD dashboard-features-resto C5)
export * from "../features/reportes/api";

// Shim auth — fuente única en features/auth/api.ts (SDD dashboard-features-resto C6)
// Contiene: authApi, profileApi, connectionsApi + tipos UserProfile, IolConnectionState
export * from "../features/auth/api";

// Shim operar — fuente única en features/operar/api.ts (SDD dashboard-features-resto C3)
export * from "../features/operar/api";

// Shim dolar — fuente única en features/dolar/api.ts (SDD dashboard-features-resto C6)
export * from "../features/dolar/api";

// Shim analisis — fuente única en features/analisis/api.ts (SDD dashboard-features-resto C4)
export * from "../features/analisis/api";

// Shim noticias — fuente única en features/noticias/api.ts (SDD dashboard-features-resto C5)
export * from "../features/noticias/api";

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

// Shim agente — fuente única en features/agente/api.ts (SDD dashboard-features-resto C6)
// Contiene: agentApi, apiKeysApi + tipos AgentSession, AgentChatMessage, ApiKeySummary
export * from "../features/agente/api";
