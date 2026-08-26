import { and, desc, eq, sql } from "drizzle-orm";
import { db, pool, schema } from "../../db/index.js";
import {
  createPlanSchema,
  getUnknownSymbols,
} from "./validation/plans.js";

// Pseudo-symbols that are always considered known (they are not tickers)
const PSEUDO_SYMBOLS = new Set(["cash", "dollar_linked", "CASH", "DOLLAR_LINKED"]);

// Seed + common BYMA tickers allowlist (covers spec seed + typical panels)
const ALLOWLIST = new Set([
  // seed v1
  "T2X5",
  "TX26",
  "SPY",
  "AAPL",
  "MSFT",
  "META",
  "YPFD",
  "cash",
  "dollar_linked",
  // spec example
  "AL30",
  "GGAL",
  "TXAR",
  // extra CER / bopreal / bonos
  "AL35",
  "AE38",
  "GD30",
  "GD35",
  "GD38",
  "TX28",
  "TX38",
  "T2X6",
  "T5X4",
  "BPO26",
  "BPJ25",
  // equity BCBA
  "BMA",
  "SUPV",
  "PAMP",
  "CEPU",
  "TRAN",
  "EDN",
  "LOMA",
  "TECO2",
  "COME",
  "CRES",
  "BYMA",
  "VALO",
  "MIRG",
  // cedears
  "GOOGL",
  "AMZN",
  "NVDA",
  "TSLA",
  "KO",
  "MELI",
  "GLOB",
  "DESP",
  "VIST",
]);

const KNOWN_SYMBOLS = new Set([...ALLOWLIST, ...PSEUDO_SYMBOLS]);

export type CreatePlanData = {
  title: string;
  objective?: string;
  allocation_target?: Record<string, number>;
  allocationTarget?: Record<string, number>;
  rationale?: string;
  constraints?: { maxPorActivo?: number; maxSector?: number; betaMax?: number };
};

export class InvestmentPlanError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "InvestmentPlanError";
  }
}

async function getOwnedVirtualPortfolio(userId: string, portfolioId: string) {
  const [portfolio] = await db
    .select()
    .from(schema.virtualPortfolios)
    .where(and(eq(schema.virtualPortfolios.id, portfolioId), eq(schema.virtualPortfolios.userId, userId)));
  return portfolio ?? null;
}

async function portfolioExists(portfolioId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.virtualPortfolios.id })
    .from(schema.virtualPortfolios)
    .where(eq(schema.virtualPortfolios.id, portfolioId));
  return !!row;
}

function mapValidationCode(message: string): string {
  if (message === "INVALID_ALLOCATION_SUM") return "INVALID_ALLOCATION_SUM";
  if (message === "EMPTY_ALLOCATION") return "INVALID_ALLOCATION_SUM";
  if (message === "MISSING_ALLOCATION_TARGET") return "INVALID_ALLOCATION_SUM";
  if (message === "UNKNOWN_SYMBOL") return "UNKNOWN_SYMBOL";
  if (message === "INVALID_CONSTRAINTS") return "INVALID_CONSTRAINTS";
  if (message === "INVALID_TITLE") return "INVALID_TITLE";
  if (message === "INVALID_SYMBOL_FORMAT") return "UNKNOWN_SYMBOL";
  return message;
}

export async function createPlan(
  portfolioId: string,
  userId: string,
  rawData: unknown,
  createdBy: "user" | "agent" = "user"
) {
  // ownership check (404 vs 403)
  const owned = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!owned) {
    const exists = await portfolioExists(portfolioId);
    if (exists) throw new InvestmentPlanError(403, "FORBIDDEN", "No tenés permiso sobre este portafolio");
    throw new InvestmentPlanError(404, "NOT_FOUND", "Portafolio no encontrado");
  }

  // Zod validation (shape, sum 100, constraints)
  const parsed = createPlanSchema.safeParse(rawData);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const code = mapValidationCode(first?.message ?? "INVALID_ALLOCATION_SUM");
    // for symbol unknown vs sum vs constraints differentiate
    if (code === "UNKNOWN_SYMBOL" || code === "INVALID_SYMBOL_FORMAT") {
      throw new InvestmentPlanError(400, "UNKNOWN_SYMBOL", first?.message ?? "Símbolo desconocido");
    }
    if (code === "INVALID_CONSTRAINTS") {
      throw new InvestmentPlanError(400, "INVALID_CONSTRAINTS", first?.message ?? "Constraints inválidos");
    }
    throw new InvestmentPlanError(400, code, first?.message ?? "Datos inválidos");
  }

  const { title, objective, rationale, constraints, allocation_target } = parsed.data;

  // símbolo live (getUnknownSymbols) — against allowlist + pseudo
  const unknown = getUnknownSymbols(allocation_target, KNOWN_SYMBOLS);
  if (unknown.length > 0) {
    throw new InvestmentPlanError(400, "UNKNOWN_SYMBOL", `Símbolos desconocidos: ${unknown.join(", ")}`, {
      unknown,
    });
  }

  // Transacción SERIALIZABLE con SELECT MAX FOR UPDATE + INSERT
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Set isolation inside transaction
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    const maxRes = await client.query(
      "SELECT COALESCE(MAX(version), 0)::int AS max FROM portfolio_investment_plans WHERE portfolio_id = $1 FOR UPDATE",
      [portfolioId]
    );
    const nextVersion = Number(maxRes.rows[0]?.max ?? 0) + 1;

    // Use drizzle-typed insert via raw query with jsonb casts
    const insertRes = await client.query(
      `INSERT INTO portfolio_investment_plans
        (portfolio_id, user_id, version, title, objective, allocation_target, rationale, constraints, created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9)
       RETURNING *`,
      [
        portfolioId,
        userId,
        nextVersion,
        title,
        objective ?? null,
        JSON.stringify(allocation_target),
        rationale ?? null,
        constraints ? JSON.stringify(constraints) : null,
        createdBy,
      ]
    );

    await client.query("COMMIT");
    const row = insertRes.rows[0];
    return toPlanDto(row);
  } catch (err: unknown) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    // Postgres unique_violation 23505 or message contains unique
    const isUnique =
      (err as { code?: string })?.code === "23505" ||
      msg.includes("plans_portfolio_version_unique") ||
      msg.includes("portfolio_investment_plans_portfolio_id_version_unique") ||
      msg.includes("unique") ||
      msg.includes("duplicate");
    if (isUnique) {
      throw new InvestmentPlanError(409, "VERSION_CONFLICT", "Conflicto de versión — reintentar", {
        retry: true,
      });
    }
    // rethrow InvestmentPlanError as-is
    if (err instanceof InvestmentPlanError) throw err;
    throw err;
  } finally {
    client.release();
  }
}

function toPlanDto(row: Record<string, unknown>) {
  // raw row from pg: snake_case keys
  return {
    id: row.id,
    portfolio_id: row.portfolio_id ?? row.portfolioId,
    portfolioId: row.portfolio_id ?? row.portfolioId,
    user_id: row.user_id ?? row.userId,
    userId: row.user_id ?? row.userId,
    version: Number(row.version),
    title: row.title,
    objective: row.objective,
    allocation_target: row.allocation_target ?? row.allocationTarget,
    allocationTarget: row.allocation_target ?? row.allocationTarget,
    rationale: row.rationale,
    constraints: row.constraints,
    created_by: row.created_by ?? row.createdBy,
    createdBy: row.created_by ?? row.createdBy,
    created_at: row.created_at ?? row.createdAt,
    createdAt: row.created_at ?? row.createdAt,
  };
}

export async function listPlans(portfolioId: string, userId: string) {
  const owned = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!owned) {
    const exists = await portfolioExists(portfolioId);
    if (exists) throw new InvestmentPlanError(403, "FORBIDDEN", "No tenés permiso sobre este portafolio");
    throw new InvestmentPlanError(404, "NOT_FOUND", "Portafolio no encontrado");
  }
  const rows = await db
    .select()
    .from(schema.portfolioInvestmentPlans)
    .where(eq(schema.portfolioInvestmentPlans.portfolioId, portfolioId))
    .orderBy(desc(schema.portfolioInvestmentPlans.version));
  return rows.map((r) => ({
    id: r.id,
    portfolio_id: r.portfolioId,
    portfolioId: r.portfolioId,
    user_id: r.userId,
    userId: r.userId,
    version: r.version,
    title: r.title,
    objective: r.objective,
    allocation_target: r.allocationTarget,
    allocationTarget: r.allocationTarget,
    rationale: r.rationale,
    constraints: r.constraints,
    created_by: r.createdBy,
    createdBy: r.createdBy,
    created_at: r.createdAt,
    createdAt: r.createdAt,
  }));
}

export async function getPlan(portfolioId: string, userId: string, version: number) {
  const owned = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!owned) {
    const exists = await portfolioExists(portfolioId);
    if (exists) throw new InvestmentPlanError(403, "FORBIDDEN", "No tenés permiso sobre este portafolio");
    throw new InvestmentPlanError(404, "NOT_FOUND", "Portafolio no encontrado");
  }
  const [row] = await db
    .select()
    .from(schema.portfolioInvestmentPlans)
    .where(
      and(eq(schema.portfolioInvestmentPlans.portfolioId, portfolioId), eq(schema.portfolioInvestmentPlans.version, version))
    );
  if (!row) throw new InvestmentPlanError(404, "NOT_FOUND", `Plan versión ${version} no encontrado`);
  return {
    id: row.id,
    portfolio_id: row.portfolioId,
    portfolioId: row.portfolioId,
    user_id: row.userId,
    userId: row.userId,
    version: row.version,
    title: row.title,
    objective: row.objective,
    allocation_target: row.allocationTarget,
    allocationTarget: row.allocationTarget,
    rationale: row.rationale,
    constraints: row.constraints,
    created_by: row.createdBy,
    createdBy: row.createdBy,
    created_at: row.createdAt,
    createdAt: row.createdAt,
  };
}

export async function getLatest(portfolioId: string, userId: string) {
  const owned = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!owned) {
    const exists = await portfolioExists(portfolioId);
    if (exists) throw new InvestmentPlanError(403, "FORBIDDEN", "No tenés permiso sobre este portafolio");
    throw new InvestmentPlanError(404, "NOT_FOUND", "Portafolio no encontrado");
  }
  const [row] = await db
    .select()
    .from(schema.portfolioInvestmentPlans)
    .where(eq(schema.portfolioInvestmentPlans.portfolioId, portfolioId))
    .orderBy(desc(schema.portfolioInvestmentPlans.version))
    .limit(1);
  if (!row) throw new InvestmentPlanError(404, "NOT_FOUND", "Sin planes para este portafolio");
  return {
    id: row.id,
    portfolio_id: row.portfolioId,
    portfolioId: row.portfolioId,
    user_id: row.userId,
    userId: row.userId,
    version: row.version,
    title: row.title,
    objective: row.objective,
    allocation_target: row.allocationTarget,
    allocationTarget: row.allocationTarget,
    rationale: row.rationale,
    constraints: row.constraints,
    created_by: row.createdBy,
    createdBy: row.createdBy,
    created_at: row.createdAt,
    createdAt: row.createdAt,
  };
}

// Aliases for task spec naming
export const InvestmentPlanService = {
  createPlan,
  create: createPlan,
  listPlans,
  list: listPlans,
  getPlan,
  getVersion: getPlan,
  getLatest,
};

export default InvestmentPlanService;
