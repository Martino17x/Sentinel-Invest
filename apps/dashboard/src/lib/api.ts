/**
 * Shim transitorio — re-exporta api-client (auth + apiFetch) + shims por dominio.
 * Fuente única auth/apiFetch vive en lib/api-client.ts (122L). No duplicar.
 * Gate C8: 57 consumers bloquean delete, TODO SDD7 documenta deuda, wc -l target ≤120.
 */
export * from "./api-client";
import { apiFetch } from "./api-client";

// TODO SDD7: migrate cotizaciones 3 consumers (InstrumentPicker, OperarSymbolPage, QuoteDetailPage) + radarApi before delete; wc -l target ≤120
// Gate C8 2026-08-24: grep -r "from.*lib/api" apps/dashboard/src --exclude-dir=features | grep -v "api-client" → 39 hits (outside features)
// + grep inside features | grep -v api-client → 18 hits (ScreenerPage, StockAnalysisPage, NewsPage/Detail, OperarSymbolPage, OperationsPage, VirtualPortfolio*, BondFicha*, RentaFija* 6, ReportsPage)
// quotesApi subset: 3 consumers via lib/api (InstrumentPicker, OperarSymbolPage, QuoteDetailPage) + radarApi 1 (RadarPage) — shim retained, delete blocked
// Fuente única cotizaciones vive en features/cotizaciones/api.ts (import now api-client, api.ts 77L). lib/api.ts 228L → target ≤120 tras dedup + migrate resto. NO borrar a la fuerza.
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
