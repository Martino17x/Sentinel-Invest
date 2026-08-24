import type {
  IolCredentials,
  MonthClose,
  MonthlyReport,
  FciRedemptionRequest,
  FciSubscriptionRequest,
  Operation,
  OperationFilters,
  OrderRequest,
  OrderResult,
  PanelQuote,
  PanelSummary,
  PortfolioSummary,
  PortfolioSnapshotPoint,
  Quote,
} from "./types.js";
import type { BondSchedule } from "../market/bonds/types.js";
import type { BymaFicha } from "../../dominio/bonos/ficha.js";

/**
 * ISP — puertos finos que particionan el IolProvider gordo (13 métodos).
 * Cada consumidor depende solo del puerto que necesita.
 * `IolProvider` permanece como alias intersección para compatibilidad temporal.
 */

export interface MarketDataPort {
  getPanel(
    credentials: IolCredentials,
    market: string,
    assetType: string,
    page?: number,
    pageSize?: number,
    q?: string
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }>;
  getQuote(credentials: IolCredentials, symbol: string, market: string): Promise<Quote>;
  getQuoteHistory(
    credentials: IolCredentials,
    symbol: string,
    market: string,
    days: number
  ): Promise<{ date: string; close: number }[]>;
  /** Raw BYMA ficha (sin credenciales) — opcional para compat con providers que solo hacen IOL */
  getBondFichaRaw?(symbol: string, signal?: AbortSignal): Promise<BymaFicha | null>;
  getBondSchedule?(symbol: string, signal?: AbortSignal): Promise<BondSchedule>;
}

export interface PortfolioPort {
  getPortfolio(credentials: IolCredentials, accountNumber: string): Promise<PortfolioSummary>;
  getPortfolioHistory(
    credentials: IolCredentials,
    accountNumber: string,
    days: number
  ): Promise<PortfolioSnapshotPoint[]>;
  getMonthlyCloses(credentials: IolCredentials, accountNumber: string): Promise<MonthClose[]>;
  getMonthlyReport(
    credentials: IolCredentials,
    accountNumber: string,
    month: string
  ): Promise<MonthlyReport>;
}

export interface TradingPort {
  placeOrder(
    credentials: IolCredentials,
    accountNumber: string,
    order: OrderRequest
  ): Promise<OrderResult>;
  cancelOperation(credentials: IolCredentials, operationNumber: string): Promise<OrderResult>;
}

export interface FciPort {
  subscribeFci(credentials: IolCredentials, request: FciSubscriptionRequest): Promise<OrderResult>;
  rescueFci(credentials: IolCredentials, request: FciRedemptionRequest): Promise<OrderResult>;
}

export interface OperationsPort {
  getOperations(
    credentials: IolCredentials,
    accountNumber: string,
    filters?: OperationFilters
  ): Promise<Operation[]>;
}

export type IolProvider = MarketDataPort & PortfolioPort & TradingPort & FciPort & OperationsPort;
export type LegacyIolProvider = IolProvider;
