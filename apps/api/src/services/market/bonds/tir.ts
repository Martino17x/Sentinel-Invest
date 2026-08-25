// ============================================================
// tir.ts — Cálculo de TIR (Tasa Interna de Retorno)
// Newton-Raphson sobre precio dirty vs flujos.
// Rama cerrada LECAP: TIR=(V/P)^(365/d)-1 para bullet single-flow.
// T-007: soporte CER/LECAP/BONCAP via schedule parseado + CER dinámico.
// Soporta 30/360 vs Actual/365 explícito por tipo de bono.
// ============================================================
import type { BondCashflow, BondSchedule } from "./types.js";

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

// ---------------------------------------------------------------------------
// T-007: Soporte CER / LECAP / BONCAP via schedule + CER dinámico
// ---------------------------------------------------------------------------

/**
 * Escala cashflows por coeficiente CER (ej 1.42 para TX26).
 * Para bonos cerAjustado, cada flujo se multiplica por coefficient.
 * Si coefficient null/1, devuelve flujos idénticos (sin escalar).
 */
export function scaleCashflowsForCer(
  flujos: BondCashflow[],
  cerCoefficient: number | null | undefined,
): BondCashflow[] {
  if (cerCoefficient == null || !Number.isFinite(cerCoefficient) || cerCoefficient <= 0) return flujos;
  if (Math.abs(cerCoefficient - 1) < 1e-9) return flujos;
  return flujos.map((f) => ({
    ...f,
    renta: f.renta * cerCoefficient,
    amortizacion: f.amortizacion * cerCoefficient,
    cashFlow: f.cashFlow * cerCoefficient,
    // vr también escala con CER para paridad correcta
    vr: f.vr * cerCoefficient,
  }));
}

/**
 * Infiere dayCount óptimo según schedule.
 * - USD hard-dollar → 30/360
 * - ARS / CER / LECAP / BONCAP / step-up / callable ARS → Actual/365
 */
export function inferDayCountForSchedule(schedule: BondSchedule | null | undefined): "30/360" | "Actual/365" {
  if (!schedule) return "Actual/365";
  if (schedule.moneda === "USD") return "30/360";
  // CER, LECAP/BONCAP, ARS siempre Actual/365
  return "Actual/365";
}

/**
 * Calcula TIR ajustada por CER si el schedule es cerAjustado.
 * Wrapper puro síncrono: el caller resuelve CER y pasa coefficient.
 *
 * @param cerCoefficient — coeficiente CER dinámico (ej de cer.ts getDynamicCerCoefficient). Si null, no escala.
 */
export function calcTIRForSchedule(
  dirtyPrice: number,
  schedule: BondSchedule,
  settlement: string,
  opts?: {
    dayCount?: "30/360" | "Actual/365";
    cerCoefficient?: number | null;
    tolerance?: number;
    maxIter?: number;
  },
): number | null {
  if (!schedule?.cashflows?.length) return null;
  // REQ callable: bono rescatable no tiene TIR determinística → null + callable flag
  if (schedule.tipo === "callable" || (schedule as unknown as { callable?: boolean }).callable === true) return null;
  const dayCount = opts?.dayCount ?? inferDayCountForSchedule(schedule);
  const coefficient = schedule.cerAjustado ? (opts?.cerCoefficient ?? null) : null;
  const adjusted = coefficient ? scaleCashflowsForCer(schedule.cashflows, coefficient) : schedule.cashflows;
  return calcTIR(dirtyPrice, adjusted, {
    dayCount,
    settlement,
    tolerance: opts?.tolerance,
    maxIter: opts?.maxIter,
  });
}

/**
 * Variante async que resuelve CER dinámico automáticamente si schedule.cerAjustado.
 * Usa cer.ts getDynamicCerCoefficient con cache 24h + T+1.
 * Para LECAP/BONCAP no-CER, no toca CER y usa dayCount apropiado.
 */
export async function calcTIRWithDynamicCer(
  dirtyPrice: number,
  schedule: BondSchedule,
  settlement: string,
  opts?: {
    dayCount?: "30/360" | "Actual/365";
    signal?: AbortSignal;
    tolerance?: number;
    maxIter?: number;
  },
): Promise<number | null> {
  if (!schedule?.cashflows?.length) return null;
  if (schedule.tipo === "callable" || (schedule as unknown as { callable?: boolean }).callable === true) return null;
  const dayCount = opts?.dayCount ?? inferDayCountForSchedule(schedule);
  let adjustedFlujos = schedule.cashflows;
  if (schedule.cerAjustado) {
    try {
      const { getDynamicCerCoefficient } = await import("./cer.js");
      const { coefficient } = await getDynamicCerCoefficient(settlement, {
        fechaEmision: (schedule as { fechaEmision?: string | null }).fechaEmision ?? null,
        cerBase: (schedule as { cerBase?: number | null }).cerBase ?? null,
        cerBaseFecha: (schedule as { cerBaseFecha?: string | null }).cerBaseFecha ?? null,
        signal: opts?.signal,
      });
      if (Number.isFinite(coefficient) && coefficient > 0) {
        adjustedFlujos = scaleCashflowsForCer(schedule.cashflows, coefficient);
      }
    } catch {
      // fallback: usar flujos sin escalar (coefficient 1.42 hardcode no se aplica aquí, el caller decide)
    }
  }
  return calcTIR(dirtyPrice, adjustedFlujos, {
    dayCount,
    settlement,
    tolerance: opts?.tolerance,
    maxIter: opts?.maxIter,
  });
}

// Helpers exportados para tests
export const _helpers = { yearFraction, daysBetween, days30_360, daysActual360, priceAtYield, priceDerivative, scaleCashflowsForCer, inferDayCountForSchedule };
