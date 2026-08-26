import { createToolRegistry, type ToolRegistry } from "../registry.js";
import type { ToolDefinition } from "../types.js";
import { searchKnowledgeTool } from "../knowledge/knowledgeTool.js";
import { getDollarRatesTool } from "../../../infraestructura/mcp/tools/dollarRates.js";
import { placeOrderTool } from "../../../infraestructura/mcp/tools/placeOrder.js";
import { cancelOrderTool } from "../../../infraestructura/mcp/tools/cancelOrder.js";
import { subscribeFciTool, rescueFciTool } from "../../../infraestructura/mcp/tools/fci.js";
import { getPortfolioTool } from "../../../infraestructura/mcp/tools/portfolio.js";
import { getQuoteTool, searchInstrumentsTool } from "../../../infraestructura/mcp/tools/quotes.js";
import { getMonthlyReportsTool } from "../../../infraestructura/mcp/tools/reports.js";
import { analyzeStockTool } from "../../../infraestructura/mcp/tools/analyzeStock.js";
import { fundamentalsTool } from "../../../infraestructura/mcp/tools/fundamentals.js";
import { analystConsensusTool } from "../../../infraestructura/mcp/tools/analyst_consensus.js";
import { earningsTool } from "../../../infraestructura/mcp/tools/earnings.js";
import { newsTool } from "../../../infraestructura/mcp/tools/news.js";
import { backtestStrategyTool } from "../../../infraestructura/mcp/tools/backtest_strategy.js";
import { getRadarCclTool } from "../../../infraestructura/mcp/tools/radarCcl.js";
import { getBondAnalyticsTool } from "../../../infraestructura/mcp/tools/bondAnalytics.js";
import { getBondCurveTool } from "../../../infraestructura/mcp/tools/bondCurve.js";
import { getBondCashflowTool } from "../../../infraestructura/mcp/tools/bondCashflow.js";
import { getBondPanelTool } from "../../../infraestructura/mcp/tools/bondPanel.js";
import { getBondFichaTool } from "../../../infraestructura/mcp/tools/bondFicha.js";
import { getScreenerTool } from "../../../infraestructura/mcp/tools/screener.js";
import { getOperationsTool } from "../../../infraestructura/mcp/tools/operations.js";
import {
  createMovementTool,
  deleteMovementTool,
  getMovementsTool,
  importMovementsConfirmTool,
  importMovementsPreviewTool,
  patchMovementTool,
  reconcileTool,
} from "../../../infraestructura/mcp/tools/movements.js";
import { getPortfolioHistoryTool } from "../../../infraestructura/mcp/tools/portfolioHistory.js";
import { getSeriesTool } from "../../../infraestructura/mcp/tools/series.js";
import { getCalendarTool } from "../../../infraestructura/mcp/tools/calendar.js";
import { getMetricsTool } from "../../../infraestructura/mcp/tools/metrics.js";
import { getQuoteHistoryTool } from "../../../infraestructura/mcp/tools/quoteHistory.js";
import { getNewsFeedTool } from "../../../infraestructura/mcp/tools/newsFeed.js";
import { getInvestorProfileTool } from "../../../infraestructura/mcp/tools/investorProfile.js";
import {
  createInvestmentPlanTool,
  getInvestmentPlanTool,
  listInvestmentPlanHistoryTool,
} from "../../../infraestructura/mcp/tools/investmentPlan.js";

// ============================================================
// Registry de tools del agente â€” fuente ÃšNICA de definiciones
//
// Compartido entre el engine (chat loop) y la capa MCP (fase G).
// Matriz de permisos (spec Â§1):
//   get_portfolio / get_quote / search_instruments /
//   get_dollar_rates / get_monthly_reports / analyze_stock /
//   search_knowledge â†’ allow
//   place_order / cancel_order / subscribe_fci / rescue_fci â†’ allow con gates
//   (IOL_TRADING_ENABLED + scope trade + credenciales; proposeOnly los oculta
//   del scope read â€” ver tradingGates.ts)
//
// La validaciÃ³n fail-fast del registry corre en el mÃ³dulo:
// si un tool estÃ¡ mal definido, el server no arranca.
// ============================================================

export type ToolCategory = "cartera" | "mercado" | "bonos" | "conocimiento" | "trading";

const TOOL_CATEGORY_MAP: Record<string, ToolCategory> = {
  // cartera (14+3) â€” lectura + gestiÃ³n efectivo (sub-grupo colapsado en UI)
  get_portfolio: "cartera",
  get_portfolio_history: "cartera",
  get_series: "cartera",
  get_calendar: "cartera",
  get_metrics: "cartera",
  get_monthly_reports: "cartera",
  get_movements: "cartera",
  get_operations: "cartera",
  create_movement: "cartera",
  patch_movement: "cartera",
  delete_movement: "cartera",
  import_movements_preview: "cartera",
  import_movements_confirm: "cartera",
  reconcile: "cartera",
  get_investment_plan: "cartera",
  list_investment_plan_history: "cartera",
  create_investment_plan: "cartera",
  // mercado y dÃ³lar (6)
  get_quote: "mercado",
  search_instruments: "mercado",
  get_quote_history: "mercado",
  get_dollar_rates: "mercado",
  get_radar_ccl: "mercado",
  get_screener: "mercado",
  // renta fija / bonos (5)
  get_bond_analytics: "bonos",
  get_bond_curve: "bonos",
  get_bond_cashflow: "bonos",
  get_bond_panel: "bonos",
  get_bond_ficha: "bonos",
  // conocimiento y anÃ¡lisis (9)
  search_knowledge: "conocimiento",
  analyze_stock: "conocimiento",
  fundamentals: "conocimiento",
  analyst_consensus: "conocimiento",
  earnings: "conocimiento",
  news: "conocimiento",
  get_news_feed: "conocimiento",
  backtest_strategy: "conocimiento",
  get_investor_profile: "conocimiento",
  // trading (4) â€” requiere scope trade
  place_order: "trading",
  cancel_order: "trading",
  subscribe_fci: "trading",
  rescue_fci: "trading",
};

export function mapToolToCategory(toolName: string): ToolCategory | null {
  return TOOL_CATEGORY_MAP[toolName] ?? null;
}

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
  createMovementTool,
  patchMovementTool,
  deleteMovementTool,
  importMovementsPreviewTool,
  importMovementsConfirmTool,
  reconcileTool,
  getPortfolioHistoryTool,
  getSeriesTool,
  getCalendarTool,
  getMetricsTool,
  getQuoteHistoryTool,
  getNewsFeedTool,
  getInvestorProfileTool,
  getInvestmentPlanTool,
  listInvestmentPlanHistoryTool,
  createInvestmentPlanTool,
];

export function createAgentRegistry(): ToolRegistry {
  const registry = createToolRegistry();
  for (const tool of DOMAIN_TOOLS) {
    registry.register(tool);
  }
  return registry;
}

/** Singleton del engine â€” validado al cargar el mÃ³dulo (fail-fast al boot) */
export const agentRegistry = createAgentRegistry();

export type { ToolRegistry } from "../registry.js";
