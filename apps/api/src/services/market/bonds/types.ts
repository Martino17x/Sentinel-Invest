// ============================================================
// Tipos del módulo Renta Fija — Batch 0 Foundation
// Define interfaces puras sin I/O, usadas por tir/duration/
// paridad/cashflow/curve y por bond_analytics_snapshots payload.
// ============================================================

export interface BondCashflow {
  /** Fecha de pago en ISO 8601 (YYYY-MM-DD). */
  fechaPago: string;
  /** Renta / cupón del periodo (absoluto). */
  renta: number;
  /** Amortización de capital del periodo. */
  amortizacion: number;
  /** Flujo total = renta + amortizacion. */
  cashFlow: number;
  /** Valor residual tras el pago (para paridad). */
  vr: number;
}

export interface BondSchedule {
  symbol: string;
  moneda: "ARS" | "USD";
  tipo: "bullet" | "amortizable" | "cer" | "step-up";
  /** Vencimiento ISO (YYYY-MM-DD). */
  vencimiento: string;
  cashflows: BondCashflow[];
  /** Si los flujos están ajustados por CER (TX26 etc). */
  cerAjustado?: boolean;
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
  /** Alias compat spec (paridadCalculable === isParidadCalculable) */
  paridadCalculable?: boolean;
  scheduleSource: "mae" | "byma" | "synthetic";
}

export interface BondAnalytics {
  symbol: string;
  /** Precio dirty (trade BYMA) usado para TIR. */
  precio: number;
  precioDirty: number;
  /** TIR anualizada (decimal, ej. 0.42 = 42%) o null si no calculable. */
  tir: number | null;
  /** Modified duration (años) o null. */
  md: number | null;
  /** Macaulay duration (años) o null. */
  duration: number | null;
  /** Paridad = precio / valor técnico * 100 (porc), o null. */
  paridad: number | null;
  /** Interés corrido (absoluto). */
  interesCorrido: number;
  schedule: BondSchedule;
  isRealtime: boolean;
  /** Fuente del cálculo: MAE directo vs motor local. */
  source: "mae" | "local";
  disclaimer: string;
  /** @since renta-fija-fase1 — enriquecimiento panel */
  marketData?: BondMarketData | null;
  cuadroTecnico?: BondCuadroTecnico | null;
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
  // Aliases compat design
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

export interface CurvePoint {
  ticker: string;
  /** TIR anualizada (decimal). */
  tir: number;
  /** Modified duration (años). */
  md: number;
  /** Vencimiento ISO. */
  vencimiento: string;
  /** Segmento de curva. */
  segmento: "USD-hard-dollar" | "BOPREAL" | "LECAP/BONCAP" | "CER" | string;
}

export interface CashflowMonth {
  /** Clave mes YYYY-MM */
  month: string;
  /** Label humano: "En julio cobrás USD 150 del GD35" */
  label: string;
  items: { symbol: string; renta: number; amort: number; currency: string }[];
  totalArs: number;
  totalUsd: number;
}
