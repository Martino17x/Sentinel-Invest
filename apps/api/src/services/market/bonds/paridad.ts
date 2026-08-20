// ============================================================
// paridad.ts — Paridad y accrued interest
// Convenciones: dirty = clean + accrued
// 30/360 vs Actual/365 por tipo de bono.
// Paridad = precioDirty / valorTecnico * 100
// ============================================================

function parseISO(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}

function daysActual(a: string, b: string): number {
  return (parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000;
}

function days30_360(a: string, b: string): number {
  const da = parseISO(a);
  const db = parseISO(b);
  let d1 = da.getUTCDate();
  let m1 = da.getUTCMonth() + 1;
  let y1 = da.getUTCFullYear();
  let d2 = db.getUTCDate();
  let m2 = db.getUTCMonth() + 1;
  let y2 = db.getUTCFullYear();
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
}

// ---------------------------------------------------------------------------
// Paridad
// ---------------------------------------------------------------------------

/**
 * Paridad = (precio dirty / valor técnico) * 100
 * valorTecnico típicamente = valor residual + interés corrido proporcional
 * Retorna null si valorTecnico no positivo o inputs inválidos.
 */
export function calcParidad(dirtyPrice: number, valorTecnico: number): number | null {
  if (!Number.isFinite(dirtyPrice) || !Number.isFinite(valorTecnico)) return null;
  if (valorTecnico <= 0) return null;
  return (dirtyPrice / valorTecnico) * 100;
}

// ---------------------------------------------------------------------------
// Accrued interest
// ---------------------------------------------------------------------------

export interface AccruedOptions {
  /** Cupón anual nominal (ej 0.04 = 4% anual sobre VR). */
  annualCouponRate: number;
  /** Valor residual / nominal sobre el que corre el cupón (default 100). */
  valorResidual?: number;
  /** Fecha último cupón ISO. */
  lastCouponDate: string;
  /** Fecha de liquidación / valuación ISO. */
  settlement: string;
  /** Convención de días. */
  dayCount: "30/360" | "Actual/365";
  /** Frecuencia anual de cupones (default 2 para USD, 1 para pesos). Usado solo para prorrateo si se quiere. */
  frequency?: number;
}

/**
 * Interés corrido absoluto.
 * Fórmula: VR * tasaAnual * (días / base)
 *  - 30/360: días 30/360 / 360
 *  - Actual/365: días reales / 365
 */
export function calcAccruedInterest(opts: AccruedOptions): number {
  const { annualCouponRate, lastCouponDate, settlement, dayCount } = opts;
  const vr = opts.valorResidual ?? 100;
  if (!Number.isFinite(annualCouponRate) || !Number.isFinite(vr)) return 0;
  if (annualCouponRate === 0) return 0;
  const days = dayCount === "30/360" ? days30_360(lastCouponDate, settlement) : daysActual(lastCouponDate, settlement);
  if (days <= 0) return 0;
  const base = dayCount === "30/360" ? 360 : 365;
  return vr * annualCouponRate * (days / base);
}

/** Dirty = clean + accrued */
export function calcDirtyPrice(cleanPrice: number, accrued: number): number {
  if (!Number.isFinite(cleanPrice) || !Number.isFinite(accrued)) return cleanPrice;
  return cleanPrice + accrued;
}

/** Clean = dirty - accrued */
export function calcCleanPrice(dirtyPrice: number, accrued: number): number {
  if (!Number.isFinite(dirtyPrice) || !Number.isFinite(accrued)) return dirtyPrice;
  return dirtyPrice - accrued;
}

/**
 * Valor técnico = VR + accrued proporcional.
 * Útil para calcular paridad cuando se conoce VR y cupón corrido.
 */
export function calcValorTecnico(vr: number, accrued: number): number {
  if (!Number.isFinite(vr) || !Number.isFinite(accrued)) return vr;
  return vr + accrued;
}

/**
 * Paridad directa desde componentes: precio dirty, VR, y accrued.
 * Equivale a calcParidad(dirty, VR+accrued).
 */
export function calcParidadConAccrued(dirtyPrice: number, vr: number, accrued: number): number | null {
  return calcParidad(dirtyPrice, vr + accrued);
}

// Helpers exportados para tests / introspección
export const _helpers = { daysActual, days30_360 };
