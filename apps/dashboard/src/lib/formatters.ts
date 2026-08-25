// ============================================================
// lib/formatters — punto único de formateo + NormalizedTotals
// Re-export centralizado: toda la UI importa ARS/USD/Percent desde acá.
// Evita duplicar Intl.NumberFormat en pages/modals (spec shared-formatters).
// ============================================================

export {
  formatArs,
  formatUsd,
  formatPct,
  formatArsNoDecimals,
  formatMoney,
  formatCompact,
  maskAmount,
  formatChangeAmount,
  formatARS,
  formatUSD,
  formatPercent,
  formatARSNoDecimals,
} from "./format";

import type { PortfolioSummary, VirtualPortfolioDetail } from "@/features/portafolio/api";

// ------------------------------------------------------------
// NormalizedTotals — adapter plano para PortfolioStats (mode real|virtual)
// ------------------------------------------------------------
export type NormalizedTotals = {
  totalArs: number;
  totalUsd: number;
  gainArs: number;
  gainPct: number;
  dayChangePct: number;
  dayChangeAmountArs: number;
  positionsValueArs: number;
  cashArs: number;
  cashUsd: number;
  count: number;
  costArs?: number;
};

/**
 * Helper puro: PortfolioSummary (real) → NormalizedTotals.
 * gainPct fallback: si gainLossPct no viene (server viejo) se calcula sobre costo.
 */
export function toNormalizedTotalsReal(p: PortfolioSummary): NormalizedTotals {
  const gainPct =
    p.gainLossPct ??
    (p.totalArs - p.gainLossArs > 0 ? (p.gainLossArs / (p.totalArs - p.gainLossArs)) * 100 : 0);
  return {
    totalArs: p.totalArs,
    totalUsd: p.totalUsd,
    gainArs: p.gainLossArs,
    gainPct,
    dayChangePct: p.dayChangePct,
    dayChangeAmountArs: p.dayChangeAmountArs,
    positionsValueArs: p.positionsValueArs,
    cashArs: p.cashArs,
    cashUsd: p.cashUsd,
    count: p.positions.length,
    costArs: p.totalArs - p.gainLossArs,
  };
}

/**
 * Helper puro: VirtualPortfolioDetail (seguimiento) → NormalizedTotals.
 * Virtual no tiene dayChange/cash real; se zero-fillea para mantener shape.
 */
export function toNormalizedTotalsVirtual(d: VirtualPortfolioDetail): NormalizedTotals {
  const t = d.totals;
  // dayChange inexistente en virtual → 0 para no renderizar ruido
  return {
    totalArs: t.totalArs,
    totalUsd: t.totalUsd,
    gainArs: t.gainArs,
    gainPct: t.gainPctArs,
    dayChangePct: 0,
    dayChangeAmountArs: 0,
    positionsValueArs: t.totalArs,
    cashArs: 0,
    cashUsd: 0,
    count: d.positions.length,
    costArs: t.costArs,
  };
}
