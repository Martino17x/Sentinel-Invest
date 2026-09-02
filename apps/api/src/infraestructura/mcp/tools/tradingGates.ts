/**
 * Re-export puro — fuente canónica en aplicacion/operar/gates.ts (SDD8).
 * Cero lógica duplicada; evita drift de IOL_TRADING_ENABLED.
 * Mantiene compatibilidad con infra consumers que esperan
 * tradingGate(ctx) → ToolResult | null y maybePendingChat.
 */
export { isTradingEnabled, tradingGateTool as tradingGate, maybePendingChat } from "../../../aplicacion/operar/gates.js";
export { tradingGate as tradingGateHttp, requireCreds } from "../../../aplicacion/operar/gates.js";
