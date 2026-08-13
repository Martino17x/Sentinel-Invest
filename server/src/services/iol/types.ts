// ============================================================
// TIPOS DEL DOMINIO IOL
// Este archivo ES EL CONTRATO entre la app y cualquier proveedor
// (mock hoy, API real mañana). Nada fuera de services/iol/
// debe conocer los detalles de implementación.
// ============================================================

export type Market = "bcba" | "nyse" | "nasdaq" | "bonds" | "fci" | "crypto";
export type Currency = "ARS" | "USD";
export type OperationType = "buy" | "sell" | "subscription" | "redemption";
export type OperationStatus = "pending" | "accepted" | "rejected" | "cancelled";

/** Una posición de la cartera (un activo que el usuario posee) */
export interface Position {
  symbol: string;
  name: string; // nombre legible del activo (ej. "Cedear Nvidia Corporation")
  assetType: "bono" | "accion" | "cedear" | "fci" | "caucion" | "futuro" | "opcion" | "moneda";
  market: Market;
  quantity: number;
  avgPrice: number; // precio promedio de compra
  lastPrice: number; // último precio conocido
  currency: Currency;
  totalValue: number; // quantity * lastPrice
  gainLossPct: number; // (lastPrice - avgPrice) / avgPrice * 100
  gainLossAmount: number; // rendimiento en dinero
  dayChangePct: number; // variación del día
}

/**
 * Resumen completo del portafolio de una cuenta.
 * IOL separa TODO por moneda: efectivo ARS, efectivo USD,
 * total ARS, total USD — cada uno con su rendimiento.
 */
export interface PortfolioSummary {
  accountNumber: string;
  // Efectivo disponible para operar, por moneda
  cashArs: number;
  cashUsd: number;
  // Valor total de posiciones (sin efectivo)
  positionsValueArs: number;
  positionsValueUsd: number;
  // Totales consolidados (posiciones + efectivo)
  totalArs: number;
  totalUsd: number;
  // Ganancia/pérdida por moneda
  gainLossArs: number;
  gainLossUsd: number;
  // Variación del día (porcentaje)
  dayChangePct: number;
  // Distribución porcentual por activo (incluye efectivo)
  distribution: { label: string; pct: number }[];
  positions: Position[];
}

/** Una operación histórica (compra/venta/suscripción/rescate) */
export interface Operation {
  iolOperationId: string;
  symbol: string;
  market: Market;
  type: OperationType;
  status: OperationStatus;
  quantity: number;
  price: number;
  total: number;
  commission: number;
  currency: Currency;
  date: string; // ISO
}

/** Valor del portafolio en un momento dado (para gráficos de evolución) */
export interface PortfolioSnapshotPoint {
  capturedAt: string; // ISO
  totalValue: number;
  cash: number;
  currency: Currency;
}

/** Cotización de un título */
export interface Quote {
  symbol: string;
  market: Market;
  lastPrice: number;
  variationPct: number; // variación respecto al cierre anterior
  currency: Currency;
  updatedAt: string; // ISO
}

/** Fila de un panel de cotizaciones (tabla de mercado) */
export interface PanelQuote {
  symbol: string;
  name: string;
  assetType: "bono" | "accion" | "cedear" | "fci" | "caucion" | "futuro" | "opcion" | "moneda";
  market: Market;
  lastPrice: number;
  variationPct: number; // variación diaria %
  bid: number | null; // precio compra
  ask: number | null; // precio venta
  open: number | null;
  low: number | null;
  high: number | null;
  close: number | null; // último cierre
  volume: number;
  currency: Currency;
  isFavorite?: boolean;
}

/** Resumen del panel (indicadores arriba de la tabla) */
export interface PanelSummary {
  market: Market;
  assetType: string;
  totalVariationPct: number; // variación promedio del panel
  updatedAt: string;
  isRealtime: boolean;
}

/** Cierre mensual (para la comparativa de meses) */
export interface MonthClose {
  month: string; // "2026-07"
  closingValueArs: number;
  closingValueUsd: number;
  twrPct: number; // rendimiento real del mes (excluye aportes)
  grossChangeArs: number; // variación bruta en $
  netContributionsArs: number; // aportes - retiros
}

/** Reporte mensual completo */
export interface MonthlyReport {
  month: string; // "2026-07"
  // Cierres
  closingValueArs: number;
  closingValueUsd: number;
  previousClosingValueArs: number;
  previousClosingValueUsd: number;
  // Rendimiento
  grossChangeArs: number; // variación bruta en $
  grossChangePct: number; // variación bruta en %
  twrPct: number; // rendimiento real (excluye aportes/retiros)
  twrArs: number;
  // Aportes
  netContributionsArs: number; // positivo = metiste plata, negativo = sacaste
  // Ganancias
  realizedGainArs: number; // ganancia materializada (ventas - costo)
  unrealizedGainArs: number; // ganancia latente (valor actual - costo de lo que tenés)
  // Actividad
  buys: Operation[];
  sells: Operation[];
  totalBuysArs: number;
  totalSellsArs: number;
  // Costos y extras
  commissionsArs: number;
  dividendsArs: number;
  // Estadísticas del mes
  bestDay: { date: string; pct: number } | null;
  worstDay: { date: string; pct: number } | null;
  // Comparativas
  benchmarkPct: number; // variación del Merval en el mes
  fxChangePct: number; // variación del tipo de cambio (CCL/MEP) en el mes
  // Serie del mes para el gráfico (valor diario + benchmark normalizado)
  series: { date: string; valueArs: number; benchmark: number }[];
}

/** Credenciales de IOL — el provider las usa SOLO internamente */
export interface IolCredentials {
  username: string;
  password: string;
}
