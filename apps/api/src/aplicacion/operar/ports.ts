/**
 * Ports re-export — DIP local para aplicacion/operar (SDD8).
 * Re-exporta los puertos SDD2 desde services/iol/ports.ts sin
 * que aplicacion conozca infraestructura.
 */
export type { TradingPort, FciPort, MarketDataPort } from "../../services/iol/ports.js";
