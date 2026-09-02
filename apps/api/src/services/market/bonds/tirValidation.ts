// ============================================================
// tirValidation.ts — Validación diaria TIR propia vs MAE
// T-008: tolerancia 5bps (0.0005), log warn si diverge >1% y métrica.
// Usa tir.ts + cer.ts dinámico para recalcular localmente.
// ============================================================
import { getAllMaeAnalytics } from "./maeFlujo.js";
import { calcTIRWithDynamicCer, calcTIRForSchedule, inferDayCountForSchedule } from "./tir.js";

export const TIR_TOLERANCE_5BPS = 0.0005; // 5 bps en decimal
export const TIR_CRITICAL_1PCT = 0.01; // 100 bps = 1% en decimal

export interface TirValidationResult {
  symbol: string;
  maeTir: number;
  localTir: number | null;
  diff: number | null; // local - mae en decimal
  diffBps: number | null; // diff *10000
  diverged5bps: boolean;
  diverged1pct: boolean; // >1%
}

export interface TirValidationSummary {
  checked: number;
  diverged5bps: number;
  diverged1pct: number;
  failures: number; // localTir null
  results: TirValidationResult[];
  generatedAt: string;
  durationMs: number;
}

// Métrica in-memory (última corrida)
let lastSummary: TirValidationSummary | null = null;
let validationCounter = 0;
// Contadores acumulativos para observabilidad (reset en test)
let totalRuns = 0;
let totalDiverged5bps = 0;
let totalDiverged1pct = 0;

export function getTirValidationMetrics(): {
  lastSummary: TirValidationSummary | null;
  totalRuns: number;
  totalDiverged5bps: number;
  totalDiverged1pct: number;
  validationCounter: number;
} {
  return { lastSummary, totalRuns, totalDiverged5bps, totalDiverged1pct, validationCounter };
}

export function resetTirValidationMetricsForTests(): void {
  lastSummary = null;
  validationCounter = 0;
  totalRuns = 0;
  totalDiverged5bps = 0;
  totalDiverged1pct = 0;
}

/**
 * Valida un par MAE vs local.
 */
export function validateSingleTir(maeTir: number | null, localTir: number | null): {
  diverged5bps: boolean;
  diverged1pct: boolean;
  diff: number | null;
  diffBps: number | null;
} {
  if (maeTir == null || localTir == null || !Number.isFinite(maeTir) || !Number.isFinite(localTir)) {
    return { diverged5bps: false, diverged1pct: false, diff: null, diffBps: null };
  }
  const diff = Math.abs(localTir - maeTir);
  return {
    diverged5bps: diff > TIR_TOLERANCE_5BPS,
    diverged1pct: diff > TIR_CRITICAL_1PCT,
    diff: localTir - maeTir,
    diffBps: diff * 10000,
  };
}

/**
 * Corre validación diaria: recalcula TIR local para cada MAE analytic
 * usando schedule + CER dinámico y compara con MAE tir.
 * Loggea warn si diverge >5bps, warn crítico si >1%.
 * Actualiza métrica in-memory.
 */
export async function runDailyTirValidation(signal?: AbortSignal): Promise<TirValidationSummary> {
  const start = Date.now();
  const generatedAt = new Date().toISOString();
  const analytics = await getAllMaeAnalytics(signal).catch(() => []);

  const results: TirValidationResult[] = [];
  let diverged5bps = 0;
  let diverged1pct = 0;
  let failures = 0;

  for (const a of analytics) {
    if (a.tir == null || !Number.isFinite(a.tir)) continue;
    // Recalcular local TIR con CER dinámico
    let localTir: number | null = null;
    try {
      const settlement = new Date().toISOString().slice(0, 10);
      // Prefer async CER-aware path si es CER; sino sync rápido
      if (a.schedule.cerAjustado) {
        localTir = await calcTIRWithDynamicCer(a.precio, a.schedule, settlement, {
          signal,
        });
      } else {
        localTir = calcTIRForSchedule(a.precio, a.schedule, settlement);
      }
    } catch {
      localTir = null;
    }

    if (localTir == null) {
      failures++;
      results.push({
        symbol: a.symbol,
        maeTir: a.tir,
        localTir: null,
        diff: null,
        diffBps: null,
        diverged5bps: false,
        diverged1pct: false,
      });
      continue;
    }

    const { diverged5bps: is5, diverged1pct: is1, diff, diffBps } = validateSingleTir(a.tir, localTir);
    if (is5) diverged5bps++;
    if (is1) diverged1pct++;

    // Log según severidad
    if (is1) {
      console.warn(
        `[tirValidation] CRÍTICO >1% ${a.symbol}: MAE=${(a.tir * 100).toFixed(2)}% local=${(localTir * 100).toFixed(2)}% diff=${diffBps!.toFixed(1)}bps`,
      );
    } else if (is5) {
      console.warn(
        `[tirValidation] divergencia 5bps ${a.symbol}: MAE=${(a.tir * 100).toFixed(2)}% local=${(localTir * 100).toFixed(2)}% diff=${diffBps!.toFixed(1)}bps`,
      );
    }

    results.push({
      symbol: a.symbol,
      maeTir: a.tir,
      localTir,
      diff,
      diffBps,
      diverged5bps: is5,
      diverged1pct: is1,
    });
  }

  const summary: TirValidationSummary = {
    checked: analytics.length,
    diverged5bps,
    diverged1pct,
    failures,
    results,
    generatedAt,
    durationMs: Date.now() - start,
  };

  lastSummary = summary;
  validationCounter++;
  totalRuns++;
  totalDiverged5bps += diverged5bps;
  totalDiverged1pct += diverged1pct;

  // Métrica estructurada para logs / dashboard
  console.warn(
    `[tirValidation] resumen diario: checked=${summary.checked} diverged5bps=${diverged5bps} diverged1pct=${diverged1pct} failures=${failures} duration=${summary.durationMs}ms`,
  );

  return summary;
}

// Alias para cron jobs
export const validateTirDaily = runDailyTirValidation;
