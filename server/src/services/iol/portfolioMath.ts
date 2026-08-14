import type { Position } from "./types.js";

// ============================================================
// HELPERS DE MATEMÁTICA DE PORTAFOLIO
// Funciones puras compartidas entre providers (IolApiProvider y
// MockIolProvider) para que la ganancia diaria y la distribución
// se calculen SIEMPRE igual, sin duplicar lógica.
// ============================================================

/**
 * Ganancia/pérdida TOTAL como porcentaje del capital invertido.
 *
 * Fórmula: gainLossPct = gainLossArs / (totalArs - gainLossArs) * 100
 * (base = capital invertido = valor actual − ganancia acumulada).
 * Si la base no es positiva → 0 (guard división por cero).
 */
export function computeGainLossPct(gainLossArs: number, totalArs: number): number {
  const base = totalArs - gainLossArs;
  if (base <= 0) return 0;
  return round2((gainLossArs / base) * 100);
}

export interface DayChangeResult {
  amountArs: number; // ganancia/pérdida del día en ARS
  amountUsd: number; // ganancia/pérdida del día en USD
  pct: number; // variación porcentual ponderada del día
}

/**
 * Calcula la ganancia/pérdida del día a partir de las posiciones.
 *
 * Fórmula (de la spec sdd/inicio-mobile):
 *   dayGain(moneda) = Σ (posición.totalValue × posición.dayChangePct / 100)
 *   pct ponderado = Σ(totalValue_i) / Σ(totalValue_i / (1 + dayChangePct_i/100)) − 1
 *
 * El efectivo (cash) NO varía en el día, por eso se excluye del denominador.
 * Si no hay posiciones o la suma es 0 → devuelve 0 (guard división por cero).
 */
export function computeDayChange(positions: Position[]): DayChangeResult {
  let amountArs = 0;
  let amountUsd = 0;
  let totalValue = 0;
  let weightedBase = 0;

  for (const pos of positions) {
    const value = pos.totalValue;
    const pct = pos.dayChangePct;

    if (pos.currency === "USD") {
      amountUsd += (value * pct) / 100;
    } else {
      amountArs += (value * pct) / 100;
    }

    // Base ponderada: valor actual dividido por (1 + variación)
    totalValue += value;
    weightedBase += value / (1 + pct / 100);
  }

  const pct = totalValue > 0 && weightedBase > 0 ? totalValue / weightedBase - 1 : 0;

  return {
    amountArs: round2(amountArs),
    amountUsd: round2(amountUsd),
    pct: round4(pct) * 100, // a porcentaje
  };
}

export interface DistributionByTypeItem {
  type: string; // assetType o "efectivo"
  label: string; // nombre legible
  pct: number; // porcentaje del total
  amountArs: number;
  amountUsd: number;
}

/**
 * Distribución del portafolio por CATEGORÍA de activo + efectivo.
 *
 * A diferencia de `distribution` (por símbolo), agrupa por assetType:
 * bonos, acciones, CEDEARs, etc. El efectivo (cash) aparece como "efectivo".
 *
 * NO mezcla monedas: los montos se reportan por separado (amountArs/amountUsd)
 * y el porcentaje se calcula sobre el total en la moneda que corresponda.
 */
export function buildDistributionByType(
  positions: Position[],
  cashArs: number,
  cashUsd: number
): DistributionByTypeItem[] {
  const groups = new Map<string, { amountArs: number; amountUsd: number }>();

  for (const pos of positions) {
    const current = groups.get(pos.assetType) ?? { amountArs: 0, amountUsd: 0 };
    if (pos.currency === "USD") {
      current.amountUsd += pos.totalValue;
    } else {
      current.amountArs += pos.totalValue;
    }
    groups.set(pos.assetType, current);
  }

  // Efectivo como categoría propia
  if (cashArs > 0 || cashUsd > 0) {
    groups.set("efectivo", { amountArs: cashArs, amountUsd: cashUsd });
  }

  const totalArs = Array.from(groups.values()).reduce((s, g) => s + g.amountArs, 0);
  const totalUsd = Array.from(groups.values()).reduce((s, g) => s + g.amountUsd, 0);
  const total = totalArs + totalUsd;

  const items: DistributionByTypeItem[] = [];

  for (const [type, amounts] of groups) {
    items.push({
      type,
      label: labelForType(type),
      pct: total > 0 ? round2((amounts.amountArs + amounts.amountUsd) / total * 100) : 0,
      amountArs: round2(amounts.amountArs),
      amountUsd: round2(amounts.amountUsd),
    });
  }

  // Ordenar de mayor a menor porcentaje (efectivo primero si domina)
  return items.sort((a, b) => b.pct - a.pct);
}

function labelForType(type: string): string {
  switch (type) {
    case "bono":
      return "Bonos";
    case "accion":
      return "Acciones";
    case "cedear":
      return "CEDEARs";
    case "fci":
      return "FCI";
    case "caucion":
      return "Cauciones";
    case "futuro":
      return "Futuros";
    case "opcion":
      return "Opciones";
    case "moneda":
      return "Monedas";
    case "efectivo":
      return "Efectivo";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
