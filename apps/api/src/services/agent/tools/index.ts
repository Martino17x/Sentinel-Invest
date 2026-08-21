import { createToolRegistry, type ToolRegistry } from "../registry.js";
import type { ToolDefinition } from "../types.js";
import { searchKnowledgeTool } from "../knowledge/knowledgeTool.js";
import { getDollarRatesTool } from "./dollarRates.js";
import { placeOrderTool } from "./placeOrder.js";
import { cancelOrderTool } from "./cancelOrder.js";
import { subscribeFciTool, rescueFciTool } from "./fci.js";
import { getPortfolioTool } from "./portfolio.js";
import { getQuoteTool, searchInstrumentsTool } from "./quotes.js";
import { getMonthlyReportsTool } from "./reports.js";
import { analyzeStockTool } from "./analyzeStock.js";
import { fundamentalsTool } from "./fundamentals.js";
import { analystConsensusTool } from "./analyst_consensus.js";
import { earningsTool } from "./earnings.js";
import { newsTool } from "./news.js";
import { backtestStrategyTool } from "./backtest_strategy.js";
import { getRadarCclTool } from "./radarCcl.js";
import { getBondAnalyticsTool } from "./bondAnalytics.js";
import { getBondCurveTool } from "./bondCurve.js";
import { getBondCashflowTool } from "./bondCashflow.js";
import { getBondPanelTool } from "./bondPanel.js";
import { getBondFichaTool } from "./bondFicha.js";
import { getScreenerTool } from "./screener.js";
import { getOperationsTool } from "./operations.js";
import { getMovementsTool } from "./movements.js";

// ============================================================
// Registry de tools del agente — fuente ÚNICA de definiciones
//
// Compartido entre el engine (chat loop) y la capa MCP (fase G).
// Matriz de permisos (spec §1):
//   get_portfolio / get_quote / search_instruments /
//   get_dollar_rates / get_monthly_reports / analyze_stock /
//   search_knowledge → allow
//   place_order / cancel_order / subscribe_fci / rescue_fci → allow con gates
//   (IOL_TRADING_ENABLED + scope trade + credenciales; proposeOnly los oculta
//   del scope read — ver tradingGates.ts)
//
// La validación fail-fast del registry corre en el módulo:
// si un tool está mal definido, el server no arranca.
// ============================================================

const DOMAIN_TOOLS: ToolDefinition[] = [
  getPortfolioTool,
  getQuoteTool,
  searchInstrumentsTool,
  getDollarRatesTool,
  getMonthlyReportsTool,
  analyzeStockTool,
  fundamentalsTool,
  analystConsensusTool,
  earningsTool,
  newsTool,
  backtestStrategyTool,
  searchKnowledgeTool,
  placeOrderTool,
  cancelOrderTool,
  subscribeFciTool,
  rescueFciTool,
  getRadarCclTool,
  getBondAnalyticsTool,
  getBondCurveTool,
  getBondCashflowTool,
  getBondPanelTool,
  getBondFichaTool,
  getScreenerTool,
  getOperationsTool,
  getMovementsTool,
];

export function createAgentRegistry(): ToolRegistry {
  const registry = createToolRegistry();
  for (const tool of DOMAIN_TOOLS) {
    registry.register(tool);
  }
  return registry;
}

/** Singleton del engine — validado al cargar el módulo (fail-fast al boot) */
export const agentRegistry = createAgentRegistry();

export type { ToolRegistry } from "../registry.js";
