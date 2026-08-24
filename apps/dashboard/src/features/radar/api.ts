/**
 * Feature `radar` — fuente única para radarApi (RadarRow, CclResponse).
 * Extraído de lib/api.ts (SDD7 debt).
 * Mover, no duplicar. Importa apiFetch desde lib/api-client para evitar ciclo con shim.
 */

import { apiFetch } from "@/lib/api-client";

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
