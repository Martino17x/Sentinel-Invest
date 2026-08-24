/**
 * Feature `renta-fija` — fuente única para bondsApi.
 * Extraído de lib/api.ts (SDD dashboard-features-resto C1).
 * Mover, no duplicar. Importa apiFetch desde lib/api-client para evitar ciclo con shim.
 */

import { apiFetch } from "@/lib/api-client";

// ============================================================
// Renta Fija — GET /api/bonds/* (renta-fija-curva)
// ============================================================

export interface BondCashflow {
  fechaPago: string;
  renta: number;
  amortizacion: number;
  cashFlow: number;
  vr: number;
}

export interface BondSchedule {
  symbol: string;
  moneda: "ARS" | "USD";
  tipo: "bullet" | "amortizable" | "cer" | "step-up";
  vencimiento: string;
  cashflows: BondCashflow[];
  cerAjustado?: boolean;
}

export interface BondAnalytics {
  symbol: string;
  precio: number;
  precioDirty: number;
  tir: number | null;
  md: number | null;
  duration: number | null;
  paridad: number | null;
  interesCorrido: number;
  schedule: BondSchedule;
  isRealtime: boolean;
  source: "mae" | "local";
  disclaimer: string;
}

export interface CurvePoint {
  ticker: string;
  tir: number;
  md: number;
  vencimiento: string;
  segmento: string;
}

export interface CurveResponse {
  points: CurvePoint[];
  segment: string;
  generatedAt: string;
  disclaimer: string;
  isMarketClosed: boolean;
  stale?: boolean;
}

export interface CashflowItem {
  symbol: string;
  renta: number;
  amort: number;
  currency: string;
}

export interface CashflowMonth {
  month: string;
  label: string;
  items: CashflowItem[];
  totalArs: number;
  totalUsd: number;
}

export interface CashflowResponse {
  months: CashflowMonth[];
  disclaimer: string;
  isMarketClosed: boolean;
  stale?: boolean;
}

export interface BondMarketData {
  bid: number | null;
  ask: number | null;
  spread: number | null;
  volumeNominal: number | null;
  volumeEfectivo: number | null;
  low: number | null;
  high: number | null;
  open: number | null;
  close: number | null;
}

export interface BondCuadroTecnico {
  vt: number | null;
  vr: number | null;
  paridad: number | null;
  accrued: number | null;
  couponRate: number | null;
  frequency: 1 | 2 | 4 | null;
  dayCount: "30/360" | "Actual/365";
  nextCouponDate: string | null;
  isin: string | null;
  ley: string | null;
  emisor: string | null;
  denominacionMinima: number | null;
  outstanding: number | null;
  isParidadCalculable: boolean;
  paridadCalculable?: boolean;
  scheduleSource: "mae" | "byma" | "synthetic";
}

export interface BondPanelRow extends BondAnalytics {
  marketData: BondMarketData;
  cuadroTecnico: BondCuadroTecnico;
  vencimiento: string;
  ley: string | null;
  isin: string | null;
  moneda: "ARS" | "USD";
  tipo: BondSchedule["tipo"];
}

export interface BondPanelResponse {
  data: BondPanelRow[];
  pagination: { page: number; pageSize: number; total: number };
  meta: { isStale: boolean; snapshotAt: string | null; generatedAt: string };
  rows?: BondPanelRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: string;
  generatedAt?: string;
  disclaimer?: string;
  stale?: boolean;
}

export const bondsApi = {
  async getAnalytics(symbol: string): Promise<BondAnalytics> {
    return apiFetch<BondAnalytics>(`/bonds/${encodeURIComponent(symbol)}/analytics`);
  },
  async getCurve(segment: string): Promise<CurveResponse> {
    return apiFetch<CurveResponse>(`/bonds/curve?segment=${encodeURIComponent(segment)}`);
  },
  async getCashflow(accountId: string): Promise<CashflowResponse> {
    return apiFetch<CashflowResponse>(`/bonds/cashflow?accountId=${encodeURIComponent(accountId)}`);
  },
  async getPanel(params: {
    segment?: string;
    sort?: string;
    order?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<BondPanelResponse> {
    const qs = new URLSearchParams();
    if (params.segment) qs.set("segment", params.segment);
    if (params.sort) qs.set("sort", params.sort);
    if (params.order) qs.set("order", params.order);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    const q = qs.toString();
    return apiFetch<BondPanelResponse>(`/bonds/panel${q ? `?${q}` : ""}`);
  },
  async getFicha(symbol: string): Promise<BondAnalytics & { marketData: BondMarketData; cuadroTecnico: BondCuadroTecnico; cuadro?: BondCuadroTecnico; market?: BondMarketData }> {
    return apiFetch(`/bonds/${encodeURIComponent(symbol)}/ficha`);
  },
};
