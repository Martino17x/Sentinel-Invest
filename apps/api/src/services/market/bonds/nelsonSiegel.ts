// Nelson-Siegel-Svensson fit — puro sin I/O, para T-013
// Si points.length < 8 => no fit (fallback)
// Fit naive: grid search tau + linear regression para betas

import type { CurvePoint } from "./types.js";

export interface NssParams {
  beta0: number;
  beta1: number;
  beta2: number;
  beta3: number;
  tau1: number;
  tau2: number;
}

export interface NssFitResult {
  fitted: boolean;
  params: NssParams | null;
  fittedPoints: Array<{ md: number; tirFitted: number }>;
  rmse: number | null;
  reason?: string;
}

function nssYield(t: number, p: NssParams): number {
  if (t <= 0) return p.beta0 + p.beta1;
  const t1 = t / p.tau1;
  const e1 = Math.exp(-t1);
  const f1 = (1 - e1) / t1;
  const f2 = f1 - e1;
  const t2 = t / p.tau2;
  const e2 = Math.exp(-t2);
  const f3 = (1 - e2) / t2 - e2;
  return p.beta0 + p.beta1 * f1 + p.beta2 * f2 + p.beta3 * f3;
}

// resuelve betas por mínimos cuadrados dado tau1,tau2 (lineal en betas)
function solveBetas(points: CurvePoint[], tau1: number, tau2: number): NssParams | null {
  const n = points.length;
  // design matrix X n x 4, y = tir
  // columns: 1, f1, f2, f3
  let s00 = 0, s01 = 0, s02 = 0, s03 = 0, s11 = 0, s12 = 0, s13 = 0, s22 = 0, s23 = 0, s33 = 0;
  let sy0 = 0, sy1 = 0, sy2 = 0, sy3 = 0;
  for (const pt of points) {
    const t = Math.max(0.05, pt.md);
    const t1 = t / tau1;
    const e1 = Math.exp(-t1);
    const f1 = (1 - e1) / t1;
    const f2 = f1 - e1;
    const t2 = t / tau2;
    const e2 = Math.exp(-t2);
    const f3 = (1 - e2) / t2 - e2;
    const y = pt.tir;
    s00 += 1;
    s01 += f1;
    s02 += f2;
    s03 += f3;
    s11 += f1 * f1;
    s12 += f1 * f2;
    s13 += f1 * f3;
    s22 += f2 * f2;
    s23 += f2 * f3;
    s33 += f3 * f3;
    sy0 += y;
    sy1 += y * f1;
    sy2 += y * f2;
    sy3 += y * f3;
  }
  // Matrix 4x4 symmetric: [[s00,s01,s02,s03],[s01,s11,s12,s13],[s02,s12,s22,s23],[s03,s13,s23,s33]] * beta = [sy0,sy1,sy2,sy3]
  const M = [
    [s00, s01, s02, s03],
    [s01, s11, s12, s13],
    [s02, s12, s22, s23],
    [s03, s13, s23, s33],
  ];
  const b = [sy0, sy1, sy2, sy3];
  const sol = solveLinear4x4(M, b);
  if (!sol) return null;
  return { beta0: sol[0], beta1: sol[1], beta2: sol[2], beta3: sol[3], tau1, tau2 };
}

function solveLinear4x4(M: number[][], b: number[]): number[] | null {
  // Gaussian elimination 4x4
  const n = 4;
  const A = M.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // pivot
    let pivotRow = col;
    let maxVal = Math.abs(A[col]![col]!);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r]![col]!);
      if (v > maxVal) { maxVal = v; pivotRow = r; }
    }
    if (maxVal < 1e-12) return null;
    if (pivotRow !== col) {
      const tmp = A[col]!; A[col] = A[pivotRow]!; A[pivotRow] = tmp;
    }
    const piv = A[col]![col]!;
    for (let c = col; c <= n; c++) A[col]![c]! /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = A[r]![col]!;
      for (let c = col; c <= n; c++) A[r]![c]! -= factor * A[col]![c]!;
    }
  }
  return A.map((row) => row[n]!);
}

function rmseForParams(points: CurvePoint[], p: NssParams): number {
  let sse = 0;
  for (const pt of points) {
    const t = Math.max(0.05, pt.md);
    const yHat = nssYield(t, p);
    const e = pt.tir - yHat;
    sse += e * e;
  }
  return Math.sqrt(sse / points.length);
}

export function fitNelsonSiegelSvensson(points: CurvePoint[]): NssFitResult {
  if (points.length < 8) {
    return { fitted: false, params: null, fittedPoints: [], rmse: null, reason: "insufficient_points" };
  }
  // grid tau1 in [0.3, 3], tau2 in [0.5, 5]
  const tau1Grid = [0.5, 1.0, 1.5, 2.0, 2.8];
  const tau2Grid = [0.8, 1.5, 2.5, 3.5, 5.0];
  let best: NssParams | null = null;
  let bestRmse = Infinity;

  for (const t1 of tau1Grid) {
    for (const t2 of tau2Grid) {
      if (Math.abs(t1 - t2) < 0.2) continue;
      const p = solveBetas(points, t1, t2);
      if (!p) continue;
      const rmse = rmseForParams(points, p);
      if (rmse < bestRmse) {
        bestRmse = rmse;
        best = p;
      }
    }
  }
  if (!best) {
    return { fitted: false, params: null, fittedPoints: [], rmse: null, reason: "fit_failed" };
  }
  // generate fitted points on dense grid between min and max md
  const sorted = [...points].sort((a, b) => a.md - b.md);
  const minMd = sorted[0]!.md;
  const maxMd = sorted[sorted.length - 1]!.md;
  const steps = 24;
  const fittedPoints: Array<{ md: number; tirFitted: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const md = minMd + (maxMd - minMd) * (i / steps);
    const t = Math.max(0.05, md);
    fittedPoints.push({ md, tirFitted: nssYield(t, best) });
  }
  return { fitted: true, params: best, fittedPoints, rmse: bestRmse };
}
