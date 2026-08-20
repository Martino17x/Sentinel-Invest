// ============================================================
// tir.ts — Cálculo de TIR (Tasa Interna de Retorno)
// Newton-Raphson sobre precio dirty vs flujos.
// Rama cerrada LECAP: TIR=(V/P)^(365/d)-1 para bullet single-flow.
// ============================================================
import type { BondCashflow } from "./types.js";

export interface TirOptions {
  /** Convención de conteo de días. */
  dayCount: "30/360" | "Actual/365";
  /** Fecha de liquidación ISO YYYY-MM-DD. */
  settlement: string;
  /** Tolerancia de convergencia (default 1e-7). */
  tolerance?: number;
  /** Máx iteraciones (default 50). */
  maxIter?: number;
}

// ---------------------------------------------------------------------------
// Helpers: fechas y fracciones de año
// ---------------------------------------------------------------------------

function parseISO(s: string): Date {
  // Forzar UTC para evitar drift de TZ local
  return new Date(s + "T00:00:00.000Z");
}

function daysActual360(a: string, b: string): number {
  const da = parseISO(a);
  const db = parseISO(b);
  const ms = db.getTime() - da.getTime();
  return ms / 86_400_000;
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
  // US 30/360
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 === 30) d2 = 30;
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1);
}

function yearFraction(settlement: string, paymentDate: string, dayCount: "30/360" | "Actual/365"): number {
  if (dayCount === "30/360") {
    return days30_360(settlement, paymentDate) / 360;
  }
  return daysActual360(settlement, paymentDate) / 365;
}

function daysBetween(settlement: string, paymentDate: string): number {
  return daysActual360(settlement, paymentDate);
}

// ---------------------------------------------------------------------------
// Precio teórico dado TIR
// ---------------------------------------------------------------------------

function priceAtYield(
  tir: number,
  flujos: BondCashflow[],
  settlement: string,
  dayCount: "30/360" | "Actual/365",
): number {
  let pv = 0;
  for (const f of flujos) {
    const t = yearFraction(settlement, f.fechaPago, dayCount);
    if (t < 0) continue; // flujo ya vencido
    pv += f.cashFlow / Math.pow(1 + tir, t);
  }
  return pv;
}

function priceDerivative(
  tir: number,
  flujos: BondCashflow[],
  settlement: string,
  dayCount: "30/360" | "Actual/365",
): number {
  let d = 0;
  for (const f of flujos) {
    const t = yearFraction(settlement, f.fechaPago, dayCount);
    if (t < 0) continue;
    d += (-t * f.cashFlow) / Math.pow(1 + tir, t + 1);
  }
  return d;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Calcula TIR anualizada (decimal, ej 0.42 = 42%).
 * - Si `flujos` tiene 1 solo cashflow futuro → rama cerrada LECAP
 *   `TIR = (V / P) ^ (365 / d) - 1` (Actual/365, d = días reales).
 * - Caso general → Newton-Raphson sobre precio dirty.
 * @returns TIR decimal o null si no converge / datos inválidos.
 */
export function calcTIR(
  dirtyPrice: number,
  flujos: BondCashflow[],
  opts: TirOptions,
): number | null {
  if (!Number.isFinite(dirtyPrice) || dirtyPrice <= 0) return null;
  if (!flujos || flujos.length === 0) return null;
  if (!opts?.settlement) return null;

  const tolerance = opts.tolerance ?? 1e-7;
  const maxIter = opts.maxIter ?? 50;
  const dayCount = opts.dayCount;

  // Filtrar flujos futuros (t >= 0)
  const futuros = flujos.filter((f) => yearFraction(opts.settlement, f.fechaPago, dayCount) >= 0);
  if (futuros.length === 0) return null;

  // Rama LECAP: single bullet flow → closed-form
  if (futuros.length === 1) {
    const f = futuros[0]!;
    const d = daysBetween(opts.settlement, f.fechaPago);
    if (d <= 0) return null;
    if (f.cashFlow <= 0) return null;
    // Spec: TIR=(V/P)^(365/d)-1 . Usar días reales siempre para closed-form.
    const tir = Math.pow(f.cashFlow / dirtyPrice, 365 / d) - 1;
    if (!Number.isFinite(tir)) return null;
    return tir;
  }

  // Newton-Raphson
  let r = 0.1; // guess 10%
  // Heurística: si precio muy por encima de suma de flujos, TIR negativa
  const sumFlows = futuros.reduce((s, f) => s + f.cashFlow, 0);
  if (dirtyPrice > sumFlows * 1.5) r = -0.05;

  for (let i = 0; i < maxIter; i++) {
    // Evitar 1+r <= 0
    if (1 + r <= 0) r = -0.9;
    const pv = priceAtYield(r, futuros, opts.settlement, dayCount);
    const deriv = priceDerivative(r, futuros, opts.settlement, dayCount);
    if (!Number.isFinite(pv) || !Number.isFinite(deriv) || Math.abs(deriv) < 1e-12) return null;
    const diff = pv - dirtyPrice;
    if (Math.abs(diff) < tolerance) return r;
    const step = diff / deriv;
    // Damp si step es gigante (evita overshoot)
    const clampedStep = Math.max(-1, Math.min(1, step));
    const rNext = r - clampedStep;
    if (Math.abs(rNext - r) < tolerance) return rNext;
    r = rNext;
  }
  // Último intento: verificar si converge dentro de 1e-5
  const finalPv = priceAtYield(r, futuros, opts.settlement, dayCount);
  if (Math.abs(finalPv - dirtyPrice) < 1e-5) return r;
  return null;
}

/**
 * Alias para compatibilidad — mismo que calcTIR.
 */
export const calcTir = calcTIR;

// Helpers exportados para tests
export const _helpers = { yearFraction, daysBetween, days30_360, daysActual360, priceAtYield, priceDerivative };
