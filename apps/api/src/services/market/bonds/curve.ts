// ============================================================
// curve.ts — Construcción de curvas por segmento
// Agrupa BondAnalytics por segmento, filtra tir!=null, ordena MD asc.
// Segmentos: USD-hard-dollar | BOPREAL | LECAP/BONCAP | CER
// ============================================================
import type { BondAnalytics, CurvePoint } from "./types.js";

export type SegmentKey = "USD-hard-dollar" | "BOPREAL" | "LECAP/BONCAP" | "CER" | string;

/**
 * Heurística de segmentación por símbolo + schedule.
 * Usada cuando el caller no provee segmento explícito.
 */
export function inferSegment(a: BondAnalytics): SegmentKey {
  const sym = (a.symbol ?? "").toUpperCase();
  const tipo = (a.schedule as unknown as { tipo?: string })?.tipo ?? "";
  const moneda = (a.schedule as unknown as { moneda?: string })?.moneda ?? "";

  // CER: TX*, T2X*, TC*, TZ*, DICP, PARP, CUAP, TX26 etc o tipo cer
  if (tipo === "cer" || /^(TX|T2X|TC|TZ|DICP|PARP|CUAP)/.test(sym)) return "CER";
  // BOPREAL: BP*, BPO*
  if (/^BP/.test(sym)) return "BOPREAL";
  // LECAP/BONCAP: S*T*, T* bill (S31L6, T17G6), LECAP, BONCAP, T0*, TG*
  if (/^S\d/.test(sym) || /^(T0|TG|TT|TZ|LECAP|BONCAP)/.test(sym)) return "LECAP/BONCAP";
  // USD hard dollar: AL*, GD*, AE*, AC* etc en USD
  if (moneda === "USD" || /^(AL|GD|AE|AC38|AL29|GD29|GD30|GD35|GD38|GD41|AL30|AL35)/.test(sym)) {
    return "USD-hard-dollar";
  }
  // Fallback: usar tipo o CER vs LECAP
  if (tipo === "bullet" && moneda === "ARS") return "LECAP/BONCAP";
  return "USD-hard-dollar";
}

function toCurvePoint(a: BondAnalytics): CurvePoint | null {
  if (a.tir == null || a.md == null) return null;
  if (!Number.isFinite(a.tir) || !Number.isFinite(a.md)) return null;
  const venc = (a.schedule as unknown as { vencimiento?: string })?.vencimiento ?? "";
  return {
    ticker: a.symbol,
    tir: a.tir,
    md: a.md,
    vencimiento: venc,
    segmento: inferSegment(a),
  };
}

/**
 * Construye curvas agrupadas por segmento.
 * @returns Record segment -> CurvePoint[] ordenados por MD ascendente
 */
export function buildCurve(analytics: BondAnalytics[]): Record<string, CurvePoint[]> {
  const grouped: Record<string, CurvePoint[]> = {};
  for (const a of analytics ?? []) {
    const pt = toCurvePoint(a);
    if (!pt) continue;
    const seg = pt.segmento;
    if (!grouped[seg]) grouped[seg] = [];
    grouped[seg].push(pt);
  }
  for (const seg of Object.keys(grouped)) {
    grouped[seg]!.sort((x, y) => x.md - y.md);
  }
  return grouped;
}

/**
 * Variante filtrada por segmento específico.
 * Valida segmento contra allowlist; si inválido retorna [] (el caller decide 400).
 */
export const VALID_SEGMENTS = ["USD-hard-dollar", "BOPREAL", "LECAP/BONCAP", "CER"] as const;

export function buildCurveForSegment(
  analytics: BondAnalytics[],
  segment: string,
): CurvePoint[] {
  const all = buildCurve(analytics);
  return all[segment] ?? [];
}

/**
 * Totales por segmento: útil para validar spec "≥15 para USD-hard-dollar y LECAP/BONCAP"
 */
export function countBySegment(curves: Record<string, CurvePoint[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(curves)) out[k] = v.length;
  return out;
}
