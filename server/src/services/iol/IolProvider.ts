import type {
  IolCredentials,
  MonthClose,
  MonthlyReport,
  Operation,
  PanelQuote,
  PanelSummary,
  PortfolioSummary,
  PortfolioSnapshotPoint,
  Quote,
} from "./types.js";

/**
 * CONTRATO del proveedor de IOL.
 *
 * La app depende de ESTA interfaz, nunca de una implementación concreta.
 * Hoy: MockIolProvider (datos falsos para desarrollo)
 * Mañana: IolApiProvider (HTTP a api.invertironline.com)
 *
 * Las rutas y el frontend no cambian cuando se intercambie el provider.
 * Eso es el patrón "Dependency Inversion": depender de abstracciones,
 * no de implementaciones.
 */
export interface IolProvider {
  /** Portafolio completo (posiciones + cash) de una cuenta */
  getPortfolio(credentials: IolCredentials, accountNumber: string): Promise<PortfolioSummary>;

  /** Historial de operaciones de una cuenta */
  getOperations(credentials: IolCredentials, accountNumber: string): Promise<Operation[]>;

  /** Serie de valores del portafolio en el tiempo (análisis de patrones) */
  getPortfolioHistory(
    credentials: IolCredentials,
    accountNumber: string,
    days: number
  ): Promise<PortfolioSnapshotPoint[]>;

  /** Cotización puntual de un título */
  getQuote(credentials: IolCredentials, symbol: string, market: string): Promise<Quote>;

  /** Serie histórica de precios de un título (para gráficos) */
  getQuoteHistory(
    credentials: IolCredentials,
    symbol: string,
    market: string,
    days: number
  ): Promise<{ date: string; close: number }[]>;

  /** Panel completo de cotizaciones (tabla de mercado) + resumen.
   *  q?: filtro por símbolo/nombre (búsqueda server-side, ANTES de paginar). */
  getPanel(
    credentials: IolCredentials,
    market: string,
    assetType: string,
    page?: number,
    pageSize?: number,
    q?: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }>;

  /** Lista de cierres mensuales (comparativa histórica) */
  getMonthlyCloses(
    credentials: IolCredentials,
    accountNumber: string
  ): Promise<MonthClose[]>;

  /** Reporte mensual completo de un mes específico ("2026-07") */
  getMonthlyReport(
    credentials: IolCredentials,
    accountNumber: string,
    month: string
  ): Promise<MonthlyReport>;
}
