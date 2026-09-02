// ============================================================
// duration.ts — Macaulay y Modified Duration
// Puras, sin I/O. LECAP bullet: duration = maturity.
// T-007: soporte CER dinámico + 30/360 vs Actual/365 por schedule.
// ============================================================
import type { BondCashflow, BondSchedule } from "./types.js";

export interface DurationOptions {
  settlement: string;
  dayCount?: "30/360" | "Actual/365";
  /** Cupones por año para MD (default 1). USD hard-dollar suele 2, CER anual 1. */
  periodsPerYear?: number;
}

function parseISO(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}

function yearFraction(settlement: string, paymentDate: string, dayCount: "30/360" | "Actual/365"): number {
  if (dayCount === "30/360") {
    const da = parseISO(settlement);
    const db = parseISO(paymentDate);
    let d1 = da.getUTCDate();
    let m1 = da.getUTCMonth() + 1;
    let y1 = da.getUTCFullYear();
    let d2 = db.getUTCDate();
    let m2 = db.getUTCMonth() + 1;
    let y2 = db.getUTCFullYear();
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 === 30) d2 = 30;
    return (360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1)) / 360;
  }
  const ms = parseISO(paymentDate).getTime() - parseISO(settlement).getTime();
  return ms / 86_400_000 / 365;
}

/**
 * Macaulay Duration en años.
 * @returns duración en años o null si no calculable (tir null, sin flujos futuros).
 */
export function calcMacaulayDuration(
  tir: number | null,
  flujos: BondCashflow[],
  opts: DurationOptions,
): number | null {
  if (tir == null || !Number.isFinite(tir)) return null;
  if (!flujos || flujos.length === 0) return null;
  const dayCount = opts.dayCount ?? "Actual/365";
  const futuros = flujos.filter((f) => yearFraction(opts.settlement, f.fechaPago, dayCount) >= 0);
  if (futuros.length === 0) return null;

  // LECAP single flow → duration = maturity
  if (futuros.length === 1) {
    const t = yearFraction(opts.settlement, futuros[0]!.fechaPago, dayCount);
    return t < 0 ? null : t;
  }

  let pvTotal = 0;
  let weighted = 0;
  for (const f of futuros) {
    const t = yearFraction(opts.settlement, f.fechaPago, dayCount);
    const pv = f.cashFlow / Math.pow(1 + tir, t);
    if (!Number.isFinite(pv)) return null;
    pvTotal += pv;
    weighted += t * pv;
  }
  if (pvTotal === 0 || !Number.isFinite(pvTotal)) return null;
  return weighted / pvTotal;
}

/**
 * Alias: calcDuration = Macaulay.
 */
export const calcDuration = calcMacaulayDuration;

/**
 * Modified Duration = Macaulay / (1 + TIR / m)
 * m = periodsPerYear (capitalizaciones por año). Spec usa m=1 por defecto.
 */
export function calcModifiedDuration(
  macaulay: number | null,
  tir: number | null,
  periodsPerYear: number = 1,
): number | null {
  if (macaulay == null || !Number.isFinite(macaulay)) return null;
  if (tir == null || !Number.isFinite(tir)) return null;
  if (!Number.isFinite(periodsPerYear) || periodsPerYear <= 0) return null;
  const denom = 1 + tir / periodsPerYear;
  if (denom === 0) return null;
  return macaulay / denom;
}

/**
 * Helper combinado: calcula ambas en un paso.
 */
export function calcDurations(
  tir: number | null,
  flujos: BondCashflow[],
  opts: DurationOptions,
): { duration: number | null; modifiedDuration: number | null } {
  const duration = calcMacaulayDuration(tir, flujos, opts);
  const modifiedDuration = calcModifiedDuration(duration, tir, opts.periodsPerYear ?? 1);
  return { duration, modifiedDuration };
}

// ---------------------------------------------------------------------------
// T-007: Soporte CER + inferencia dayCount por schedule
// ---------------------------------------------------------------------------

function scaleCashflowsForCerDuration(
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
    vr: f.vr * cerCoefficient,
  }));
}

export function inferDayCountForDuration(schedule: BondSchedule | null | undefined): "30/360" | "Actual/365" {
  if (!schedule) return "Actual/365";
  if (schedule.moneda === "USD") return "30/360";
  return "Actual/365";
}

/**
 * Calcula durations para un schedule completo, con ajuste CER opcional.
 * Útil para LECAP/BONCAP/CER: resuelve dayCount correcto y escala flujos si CER.
 */
export function calcDurationsForSchedule(
  tir: number | null,
  schedule: BondSchedule,
  settlement: string,
  opts?: {
    dayCount?: "30/360" | "Actual/365";
    cerCoefficient?: number | null;
    periodsPerYear?: number;
  },
): { duration: number | null; modifiedDuration: number | null } {
  if (!schedule?.cashflows?.length) return { duration: null, modifiedDuration: null };
  const dayCount = opts?.dayCount ?? inferDayCountForDuration(schedule);
  const coefficient = schedule.cerAjustado ? (opts?.cerCoefficient ?? null) : null;
  const adjusted = coefficient ? scaleCashflowsForCerDuration(schedule.cashflows, coefficient) : schedule.cashflows;
  const periodsPerYear = opts?.periodsPerYear ?? (schedule.moneda === "USD" ? 2 : 1);
  return calcDurations(tir, adjusted, { settlement, dayCount, periodsPerYear });
}

/**
 * Async variant que resuelve CER dinámico si schedule.cerAjustado.
 */
export async function calcDurationsWithDynamicCer(
  tir: number | null,
  schedule: BondSchedule,
  settlement: string,
  opts?: {
    dayCount?: "30/360" | "Actual/365";
    periodsPerYear?: number;
    signal?: AbortSignal;
    cerCoefficient?: number | null;
  },
): Promise<{ duration: number | null; modifiedDuration: number | null }> {
  if (!schedule?.cashflows?.length) return { duration: null, modifiedDuration: null };
  const dayCount = opts?.dayCount ?? inferDayCountForDuration(schedule);
  let cerCoef = opts?.cerCoefficient ?? null;
  if (schedule.cerAjustado && cerCoef == null) {
    try {
      const { getDynamicCerCoefficient } = await import("./cer.js");
      const r = await getDynamicCerCoefficient(settlement, {
        fechaEmision: (schedule as { fechaEmision?: string | null }).fechaEmision ?? null,
        cerBase: (schedule as { cerBase?: number | null }).cerBase ?? null,
        cerBaseFecha: (schedule as { cerBaseFecha?: string | null }).cerBaseFecha ?? null,
        signal: opts?.signal,
      });
      if (Number.isFinite(r.coefficient)) cerCoef = r.coefficient;
    } catch {
      // keep null
    }
  }
  const periodsPerYear = opts?.periodsPerYear ?? (schedule.moneda === "USD" ? 2 : 1);
  const adjusted = cerCoef ? scaleCashflowsForCerDuration(schedule.cashflows, cerCoef) : schedule.cashflows;
  return calcDurations(tir, adjusted, { settlement, dayCount, periodsPerYear });
}
