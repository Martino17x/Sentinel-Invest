import { createToolRegistry, type ToolRegistry } from "../registry.js";
import type { ToolDefinition } from "../types.js";
import { searchKnowledgeTool } from "../knowledge/knowledgeTool.js";
import { getDollarRatesTool } from "./dollarRates.js";
import { placeOrderTool } from "./placeOrder.js";
import { getPortfolioTool } from "./portfolio.js";
import { getQuoteTool, searchInstrumentsTool } from "./quotes.js";
import { getMonthlyReportsTool } from "./reports.js";
import { analyzeStockTool } from "./analyzeStock.js";

// ============================================================
// Registry de tools del agente — fuente ÚNICA de definiciones
//
// Compartido entre el engine (chat loop) y la capa MCP (fase G).
// Matriz de permisos (spec §1):
//   get_portfolio / get_quote / search_instruments /
//   get_dollar_rates / get_monthly_reports / analyze_stock /
//   search_knowledge → allow
//   place_order → exclude (stub de contrato, NUNCA ejecuta)
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
  searchKnowledgeTool,
  placeOrderTool,
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
