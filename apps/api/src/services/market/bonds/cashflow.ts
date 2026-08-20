// ============================================================
// cashflow.ts — Proyección de flujos por tenencia
// buildSchedule + projectCashflow (positions × schedule)
// Agrupa por monthKey YYYY-MM, label "En julio cobrás ..."
// Soporta CER-adjusted * coeficiente (default 1.42).
// ============================================================
import type { BondCashflow, BondSchedule, CashflowMonth } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES_ES = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre",
];

function monthKeyFromDate(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabelEs(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  const idx = d.getUTCMonth();
  return MONTH_NAMES_ES[idx] ?? "";
}

function parseISODate(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}

// ---------------------------------------------------------------------------
// buildSchedule — normaliza y ordena cashflows
// ---------------------------------------------------------------------------

export interface BuildScheduleInput {
  symbol: string;
  moneda: "ARS" | "USD";
  tipo: BondSchedule["tipo"];
  vencimiento: string;
  cashflows: BondCashflow[];
  cerAjustado?: boolean;
}

/**
 * Construye/normaliza un BondSchedule:
 * - ordena cashflows por fecha ascendente
 * - valida cashFlow = renta+amortizacion (corrige si diverge >0.01)
 * - filtra flujos con fecha inválida
 */
export function buildSchedule(input: BuildScheduleInput): BondSchedule {
  const sorted = [...(input.cashflows ?? [])]
    .filter((c) => c.fechaPago && !isNaN(parseISODate(c.fechaPago).getTime()))
    .sort((a, b) => parseISODate(a.fechaPago).getTime() - parseISODate(b.fechaPago).getTime())
    .map((c) => {
      const cf = c.renta + c.amortizacion;
      const cashFlow = Math.abs(cf - c.cashFlow) > 0.01 ? cf : c.cashFlow;
      return { ...c, cashFlow };
    });

  return {
    symbol: input.symbol,
    moneda: input.moneda,
    tipo: input.tipo,
    vencimiento: input.vencimiento,
    cashflows: sorted,
    cerAjustado: input.cerAjustado,
  };
}

// ---------------------------------------------------------------------------
// projectCashflow
// ---------------------------------------------------------------------------

export interface PositionForCashflow {
  symbol: string;
  /** Cantidad nominal (ej 1000 títulos). Cada flujo se multiplica por qty/100 si cashflow es por 100 VN. */
  quantity: number;
  schedule: BondSchedule;
}

export interface ProjectCashflowOptions {
  /** Desde qué fecha proyectar (default hoy UTC). */
  fromDate?: string;
  /** Meses hacia adelante (default 12). */
  monthsAhead?: number;
  /** Coeficiente CER para bonos cerAjustado (default 1.42). Puede venir de cer.ts. */
  cerCoefficient?: number;
}

/**
 * Proyecta flujos de un portafolio bond positions × schedule.
 * Agrupa por monthKey YYYY-MM, suma totales ARS/USD, genera label "En {mes} cobrás ...".
 * Filtra flujos vencidos (< fromDate) y corta a monthsAhead.
 */
export function projectCashflow(
  positions: PositionForCashflow[],
  opts: ProjectCashflowOptions = {},
): CashflowMonth[] {
  if (!positions || positions.length === 0) return [];

  const from = opts.fromDate ?? new Date().toISOString().slice(0, 10);
  const monthsAhead = opts.monthsAhead ?? 12;
  const cerCoef = opts.cerCoefficient ?? 1.42;

  const fromDate = parseISODate(from);
  const cutoff = new Date(fromDate);
  cutoff.setUTCMonth(cutoff.getUTCMonth() + monthsAhead);

  // Acumular por monthKey
  type Bucket = { month: string; items: CashflowMonth["items"]; totalArs: number; totalUsd: number; sampleDate: string };
  const buckets = new Map<string, Bucket>();

  for (const pos of positions) {
    if (!pos.schedule?.cashflows?.length) continue;
    if (!Number.isFinite(pos.quantity) || pos.quantity === 0) continue;
    const isCER = pos.schedule.cerAjustado === true;
    const moneda = pos.schedule.moneda;
    // factor qty: si cashFlow viene por 100 VN, qty es nominal → factor = qty / 100
    // Heurística conservadora: si cashFlow < 5 por flujo, asumir por 100. Si no, qty directo.
    // Para evitar ambigüedad, asumimos qty es nominal y cashFlow es por 1 VN * tasa → factor = qty
    // PERO spec dice TX26 nominal 100 × CER 1.42 → cashFlow 142×(renta%+amort%) → factor qty=100 → cashFlow*1.42
    // Decisión: cantidad se aplica como multiplicador directo sobre cashFlow unitario si cashFlow es por 1.
    // Simplificamos: total = cashFlow * (quantity / 100) * cerFactor  cuando cashFlow parece por 100.
    // Detect: si vr típico 100 y cashFlow <= 10, tratar como por 100.
    // Fallback: si cantidad grande y cashFlow grande, usar qty directo escalado.
    // Mejor: quantity es VN ; cashFlow es por 100 VN → total = cashFlow * quantity /100
    // Aplicamos esa regla universal (coincide con mercado AR).
    const factorBase = pos.quantity / 100;

    for (const cf of pos.schedule.cashflows) {
      const payDate = parseISODate(cf.fechaPago);
      if (isNaN(payDate.getTime())) continue;
      if (payDate < fromDate) continue;
      if (payDate > cutoff) continue;

      const mk = monthKeyFromDate(cf.fechaPago);
      const cerFactor = isCER ? cerCoef : 1;
      // renta/amort/cashFlow escalados
      const adjRenta = cf.renta * factorBase * cerFactor;
      const adjAmort = cf.amortizacion * factorBase * cerFactor;

      const bucket = buckets.get(mk) ?? { month: mk, items: [], totalArs: 0, totalUsd: 0, sampleDate: cf.fechaPago };
      bucket.items.push({
        symbol: pos.symbol,
        renta: adjRenta,
        amort: adjAmort,
        currency: moneda,
      });
      if (moneda === "USD") bucket.totalUsd += adjRenta + adjAmort;
      else bucket.totalArs += adjRenta + adjAmort;
      if (cf.fechaPago < bucket.sampleDate) bucket.sampleDate = cf.fechaPago;
      buckets.set(mk, bucket);
    }
  }

  const result: CashflowMonth[] = [...buckets.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((b) => {
      const mesNombre = monthLabelEs(b.sampleDate);
      // Label spec: "En {mes} cobrás ..." — incluir totales relevantes
      let label = `En ${mesNombre} cobrás`;
      const parts: string[] = [];
      if (b.totalArs > 0) parts.push(`ARS ${b.totalArs.toFixed(2)}`);
      if (b.totalUsd > 0) parts.push(`USD ${b.totalUsd.toFixed(2)}`);
      if (parts.length > 0) label += ` ${parts.join(" + ")}`;
      else label += ` ${b.items.length} flujo(s)`;
      return {
        month: b.month,
        label,
        items: b.items,
        totalArs: b.totalArs,
        totalUsd: b.totalUsd,
      };
    });

  return result;
}
