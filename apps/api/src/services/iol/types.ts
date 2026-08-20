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

/**
 * Filtros OPCIONALES para getOperations (spec F3-B2, design D7).
 * Retrocompatible: todos los campos son opcionales; sin filtros la
 * llamada se comporta exactamente como antes.
 */
export interface OperationFilters {
  /** Fecha inicial inclusiva "YYYY-MM-DD" (filtra por la fecha de la operación) */
  from?: string;
  /** Fecha final inclusiva "YYYY-MM-DD" */
  to?: string;
  /** Estado: solo operaciones con ese estado (ej. "accepted") */
  status?: OperationStatus;
}

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
  // Ganancia/pérdida TOTAL en % — base = capital invertido (totalArs - gainLossArs).
  // Estilo IOL: se muestra sin "+" en positivos, coloreado según signo.
  gainLossPct: number;
  // Variación del día (porcentaje)
  dayChangePct: number;
  // Ganancia/pérdida del día en dinero (real, ponderada por posición)
  dayChangeAmountArs: number;
  dayChangeAmountUsd: number;
  // Distribución porcentual por activo (incluye efectivo)
  distribution: { label: string; pct: number }[];
  // Distribución por CATEGORÍA de activo (bonos, CEDEARs, efectivo...)
  distributionByType: DistributionByTypeItem[];
  positions: Position[];
}

/** Ítem de la distribución por tipo de activo */
export interface DistributionByTypeItem {
  type: string; // assetType o "efectivo"
  label: string; // nombre legible ("Bonos", "CEDEARs"...)
  pct: number; // porcentaje del total
  amountArs: number; // monto en ARS (sin mezclar monedas)
  amountUsd: number; // monto en USD
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
  name?: string; // nombre/descripción del instrumento (si el proveedor lo conoce)
  // Datos de detalle (si el proveedor los conoce)
  bid?: number | null; // mejor precio compra (punta)
  ask?: number | null; // mejor precio venta (punta)
  open?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  volume?: number | null;
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
  volume: number | null;
  /** Monto operado (volumeAmount BYMA) — nullable off-hours */
  volumeEfectivo?: number | null;
  /** Alias explícito nominal — tradeVolume */
  volumeNominal?: number | null;
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

/** Lado de una orden de compra/venta */
export type OrderSide = "buy" | "sell";

/** Tipo de precio: limit (precio tope) o market (precio de referencia) */
export type PriceType = "market" | "limit";

/**
 * Orden de compra/venta a ejecutar contra la cuenta IOL.
 * La API de IOL SIEMPRE espera un precio por unidad: en limit es el
 * precio tope exacto; en market se usa el último precio conocido como
 * referencia (el tool lo resuelve antes de despachar si no viene).
 */
export interface OrderRequest {
  side: OrderSide;
  symbol: string;
  /** Especie MEP (dólar): "D" usa los endpoints ComprarEspecieD/VenderEspecieD (solo bCBA) */
  specie?: "D";
  /** Código de mercado IOL: "bCBA" | "nYSE" | "nASDAQ" | "rOFX" | "bCBA" (bonos) */
  market: string;
  quantity: number;
  priceType: PriceType;
  /** Precio por unidad. Obligatorio en limit; en market se resuelve como referencia. */
  price?: number;
  /** Plazo de liquidación: "t0" | "t1" | "t2" (default "t1") */
  term?: string;
  /** Validez de la orden (ej: "1d" o fecha YYYY-MM-DD) */
  validity?: string;
}


/** Suscripción a un FCI: monto en pesos a invertir */
export interface FciSubscriptionRequest {
  symbol: string;
  amount: number;
}

/** Rescate de un FCI: cantidad de cuotapartes a rescatar */
export interface FciRedemptionRequest {
  symbol: string;
  quantity: number;
}

/** Resultado de ejecutar una orden contra IOL */
export interface OrderResult {
  iolOperationId: string;
  status: OperationStatus;
  message?: string;
}
