/**
 * Scoring puro del perfil inversor — CNV 12Q.
 *
 * Pesos documentados (design D4):
 *  - horizonte      25%  (Q1-Q3  — plazo)
 *  - pérdida        30%  (Q4-Q6  — tolerancia a drawdown sin pánico)
 *  - exp+ingreso    25%  (Q7-Q9  — experiencia + ingresos/patrimonio)
 *  - objetivo       20%  (Q10-Q12 — preservación vs crecimiento agresivo)
 *
 * Buckets CNV:
 *  - <40  → conservador
 *  - 40-70 → moderado (40 y 70 inclusive)
 *  - >70  → agresivo
 *
 * Función pura: sin IO, sin DB, testeable sin mocks.
 */

export const QUESTION_WEIGHTS = {
  horizon: 0.25,
  loss: 0.30,
  expIngreso: 0.25,
  objetivo: 0.2,
} as const;

export type RiskBucket = "conservador" | "moderado" | "agresivo";

export interface ScoreBreakdown {
  horizon: number; // 0-100 normalizado
  loss: number;
  expIngreso: number;
  objetivo: number;
}

export interface ScoreResult {
  score: number; // 0-100 entero clamp
  bucket: RiskBucket;
  breakdown: ScoreBreakdown;
  // Alias CNV para wiring directo a DB
  risk_score: number;
  risk_tolerance: RiskBucket;
  horizon: "corto" | "medio" | "largo";
  knowledge_level: string;
  loss_tolerance_pct: number;
  investment_goal: string;
}

const HORIZON_INDICES = [0, 1, 2] as const;
const LOSS_INDICES = [3, 4, 5] as const;
const EXP_INDICES = [6, 7, 8] as const;
const OBJETIVO_INDICES = [9, 10, 11] as const;

function clampAnswer(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(4, Math.round(v)));
}

function avgNormalized(indices: readonly number[], answers: number[]): number {
  const vals = indices.map((i) => clampAnswer(answers[i] ?? 0));
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return (avg / 4) * 100;
}

function bucketFor(score: number): RiskBucket {
  if (score < 40) return "conservador";
  if (score <= 70) return "moderado";
  return "agresivo";
}

function horizonFor(scoreH: number): "corto" | "medio" | "largo" {
  if (scoreH < 33) return "corto";
  if (scoreH < 66) return "medio";
  return "largo";
}

function knowledgeFor(scoreE: number): string {
  if (scoreE < 33) return "basico";
  if (scoreE < 66) return "intermedio";
  return "avanzado";
}

function investmentGoalFor(scoreO: number): string {
  if (scoreO < 33) return "preservacion";
  if (scoreO < 66) return "crecimiento_moderado";
  return "crecimiento_agresivo";
}

function lossPctFor(lossScore: number): number {
  // 5% (mín pánico) → 40% (tolera 40%+ sin pánico) lineal
  return Math.round((lossScore / 100) * 35 + 5);
}

/**
 * Calcula el risk_score 0-100 y bucket CNV a partir de 12 respuestas.
 * Cada respuesta es índice de opción 0..4 (clamp interno).
 */
export function scoreProfile(answers: number[]): ScoreResult {
  const safe = Array.from({ length: 12 }, (_, i) => clampAnswer(answers[i] ?? 0));

  const h = avgNormalized(HORIZON_INDICES, safe);
  const l = avgNormalized(LOSS_INDICES, safe);
  const e = avgNormalized(EXP_INDICES, safe);
  const o = avgNormalized(OBJETIVO_INDICES, safe);

  const raw =
    h * QUESTION_WEIGHTS.horizon +
    l * QUESTION_WEIGHTS.loss +
    e * QUESTION_WEIGHTS.expIngreso +
    o * QUESTION_WEIGHTS.objetivo;

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const bucket = bucketFor(score);

  const breakdown: ScoreBreakdown = {
    horizon: Math.round(h),
    loss: Math.round(l),
    expIngreso: Math.round(e),
    objetivo: Math.round(o),
  };

  return {
    score,
    bucket,
    breakdown,
    risk_score: score,
    risk_tolerance: bucket,
    horizon: horizonFor(h),
    knowledge_level: knowledgeFor(e),
    loss_tolerance_pct: lossPctFor(l),
    investment_goal: investmentGoalFor(o),
  };
}

/** Alias exigido por C2 prompt: investorProfileScoring(answers:12) → {risk_score,...} */
export const investorProfileScoring = scoreProfile;

/** Helper exportado para tests de boundaries sin recomputar pesos */
export function getBucket(score: number): RiskBucket {
  return bucketFor(Math.max(0, Math.min(100, Math.round(score))));
}
