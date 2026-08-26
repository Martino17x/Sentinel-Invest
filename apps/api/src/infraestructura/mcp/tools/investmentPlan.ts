import { z } from "zod";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";
import {
  InvestmentPlanService,
  InvestmentPlanError,
} from "../../../services/portfolio/InvestmentPlanService.js";
import {
  allocationTargetSchema,
  constraintsSchema,
} from "../../../services/portfolio/validation/plans.js";

// ============================================================
// Investment Plan MCP tools — thin wrappers sobre InvestmentPlanService
//
// 3 tools (permission allow, NO PROFILE GATE):
//   get_investment_plan            → latest (portfolio_id uuid)
//   list_investment_plan_history   → historial DESC
//   create_investment_plan         → create (portfolio_id + createPlanSchema)
//
// Ownership por ctx.userId (FORBIDDEN si no owner, NOT_FOUND si no existe).
// Parity a GET/POST /virtual-portfolios/:id/plans*.
// ============================================================

function formatPlan(plan: Record<string, unknown>): string {
  const version = plan.version as number;
  const title = plan.title as string;
  const alloc = (plan.allocation_target ?? plan.allocationTarget) as Record<string, number> | undefined;
  const objective = (plan.objective as string | null) ?? null;
  const rationale = (plan.rationale as string | null) ?? null;
  const constraints = plan.constraints as unknown;
  const createdBy = (plan.created_by ?? plan.createdBy) as string;
  const createdAt = (plan.created_at ?? plan.createdAt) as string | Date | null;

  const allocStr = alloc ? Object.entries(alloc).map(([k, v]) => `${k} ${v}%`).join(", ") : "—";
  const lines = [
    `Plan v${version} — ${title} (created_by: ${createdBy}${createdAt ? `, ${String(createdAt)}` : ""})`,
    `allocation_target: ${allocStr}`,
  ];
  if (objective) lines.push(`objective: ${objective}`);
  if (rationale) lines.push(`rationale: ${rationale}`);
  if (constraints) lines.push(`constraints: ${JSON.stringify(constraints)}`);
  lines.push(`JSON: ${JSON.stringify(plan)}`);
  return lines.join("\n");
}

function formatHistory(plans: Record<string, unknown>[]): string {
  if (plans.length === 0) return "Historial de planes: vacío (sin versiones)";
  const lines = plans.map((p) => {
    const v = p.version as number;
    const t = p.title as string;
    const alloc = (p.allocation_target ?? p.allocationTarget) as Record<string, number> | undefined;
    const allocStr = alloc ? Object.entries(alloc).map(([k, v2]) => `${k} ${v2}%`).join(", ") : "—";
    const by = (p.created_by ?? p.createdBy) as string;
    return `- v${v} — ${t} [${allocStr}] (by: ${by})`;
  });
  return `Historial de planes (${plans.length} versiones, DESC):\n${lines.join("\n")}`;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof InvestmentPlanError) {
    return `${err.code}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

const portfolioIdSchema = z.string().uuid({ message: "portfolio_id debe ser un UUID válido" });

export const getInvestmentPlanTool: ToolDefinition = {
  name: "get_investment_plan",
  description:
    "Plan de inversión vigente (latest) de un portafolio virtual: allocation_target, objetivo, constraints y versión actual. Requiere portfolio_id (UUID del virtual_portfolio del usuario). Parity a GET /virtual-portfolios/:id/plans/latest. Respeta ownership (FORBIDDEN si no es tu portafolio).",
  inputSchema: z.object({
    portfolio_id: portfolioIdSchema,
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { portfolio_id: string };
    try {
      if (ctx.signal.aborted) return { ok: false, message: "get_investment_plan: down — timeout 15s" };
      const plan = await InvestmentPlanService.getLatest(args.portfolio_id, ctx.userId);
      return { ok: true, message: formatPlan(plan as unknown as Record<string, unknown>) };
    } catch (err) {
      if (ctx.signal.aborted) return { ok: false, message: "get_investment_plan: down — timeout 15s" };
      const msg = toErrorMessage(err);
      // Preserve FORBIDDEN / NOT_FOUND codes for tests
      return { ok: false, message: `get_investment_plan: ${msg}` };
    }
  },
};

export const listInvestmentPlanHistoryTool: ToolDefinition = {
  name: "list_investment_plan_history",
  description:
    "Historial versionado de planes de inversión de un portafolio virtual (orden DESC por versión). Requiere portfolio_id (UUID). Parity a GET /virtual-portfolios/:id/plans. Respeta ownership (FORBIDDEN si no es tu portafolio).",
  inputSchema: z.object({
    portfolio_id: portfolioIdSchema,
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { portfolio_id: string };
    try {
      if (ctx.signal.aborted) return { ok: false, message: "list_investment_plan_history: down — timeout 15s" };
      const plans = await InvestmentPlanService.listPlans(args.portfolio_id, ctx.userId);
      return { ok: true, message: formatHistory(plans as unknown as Record<string, unknown>[]) };
    } catch (err) {
      if (ctx.signal.aborted) return { ok: false, message: "list_investment_plan_history: down — timeout 15s" };
      const msg = toErrorMessage(err);
      return { ok: false, message: `list_investment_plan_history: ${msg}` };
    }
  },
};

// create_investment_plan — portfolio_id + createPlanSchema fields
// Input validation mirrors HTTP Zod (title 1-100, allocation sum 100±0.01, etc.)
// Delegates to InvestmentPlanService.create(portfolioId, userId, data, "agent")
const createInvestmentPlanInputSchema = z
  .object({
    portfolio_id: portfolioIdSchema,
    title: z.string().trim().min(1, { message: "INVALID_TITLE" }).max(100, { message: "INVALID_TITLE" }),
    objective: z.string().trim().max(1000, { message: "INVALID_OBJECTIVE" }).optional(),
    rationale: z.string().trim().max(2000, { message: "INVALID_RATIONALE" }).optional(),
    constraints: constraintsSchema,
    allocation_target: allocationTargetSchema.optional(),
    allocationTarget: allocationTargetSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const hasSnake = data.allocation_target !== undefined;
    const hasCamel = data.allocationTarget !== undefined;
    if (!hasSnake && !hasCamel) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MISSING_ALLOCATION_TARGET", path: ["allocation_target"] });
    }
  });

export const createInvestmentPlanTool: ToolDefinition = {
  name: "create_investment_plan",
  description:
    "Crea una nueva versión del plan de inversión de un portafolio virtual (append-only versionado). Requiere portfolio_id (UUID), title (1-100), allocation_target (símbolo→pct suma 100±0.01, ej {AL30:40,GGAL:35,YPFD:15,TXAR:10}), y opcional objective, rationale, constraints {maxPorActivo,maxSector,betaMax}. Parity a POST /virtual-portfolios/:id/plans. Respeta ownership (FORBIDDEN) y valida UNKNOWN_SYMBOL / INVALID_ALLOCATION_SUM.",
  inputSchema: createInvestmentPlanInputSchema as unknown as z.ZodObject<z.ZodRawShape>,
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as {
      portfolio_id: string;
      title: string;
      objective?: string;
      rationale?: string;
      constraints?: { maxPorActivo?: number; maxSector?: number; betaMax?: number };
      allocation_target?: Record<string, number>;
      allocationTarget?: Record<string, number>;
    };
    try {
      if (ctx.signal.aborted) return { ok: false, message: "create_investment_plan: down — timeout 15s" };
      const { portfolio_id, ...rest } = args;
      // Normalize alias for service: keep both, service's createPlanSchema handles alias
      const data = {
        title: rest.title,
        objective: rest.objective,
        rationale: rest.rationale,
        constraints: rest.constraints,
        allocation_target: rest.allocation_target ?? rest.allocationTarget,
        allocationTarget: rest.allocationTarget ?? rest.allocation_target,
      };
      const plan = await InvestmentPlanService.create(portfolio_id, ctx.userId, data, "agent");
      return { ok: true, message: `Plan creado v${(plan as unknown as Record<string, unknown>).version}:\n${formatPlan(plan as unknown as Record<string, unknown>)}` };
    } catch (err) {
      if (ctx.signal.aborted) return { ok: false, message: "create_investment_plan: down — timeout 15s" };
      const msg = toErrorMessage(err);
      return { ok: false, message: `create_investment_plan: ${msg}` };
    }
  },
};
