/**
 * @deprecated Importá desde "./ports.js" — este archivo es solo re-export compat.
 * La interfaz gorda IolProvider (13 métodos) se partió en 5 puertos ISP.
 */
export type { IolProvider, LegacyIolProvider, BrokerProvider, BrokerType, BrokerCredentials } from "./ports.js";
export type { MarketDataPort, PortfolioPort, TradingPort, FciPort, OperationsPort } from "./ports.js";
