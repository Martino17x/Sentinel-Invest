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
