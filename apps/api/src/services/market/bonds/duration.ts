// ============================================================
// duration.ts — Macaulay y Modified Duration
// Puras, sin I/O. LECAP bullet: duration = maturity.
// ============================================================
import type { BondCashflow } from "./types.js";

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
