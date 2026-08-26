import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/index.js";
import { agentRegistry, mapToolToCategory } from "../src/aplicacion/agente/tools/index.js";
import { isProfileGatedTool } from "../src/aplicacion/agente/investorProfileGuard.js";
import { executeTool } from "../src/aplicacion/agente/executor.js";

// ------------------------------------------------------------------
// Unit — shape & registry (no DB required)
// ------------------------------------------------------------------
describe("mcp investmentPlan — unit", () => {
  test("registry contiene los 3 tools y son allow", () => {
    const names = agentRegistry.names();
    assert.ok(names.includes("get_investment_plan"), "falta get_investment_plan");
    assert.ok(names.includes("list_investment_plan_history"), "falta list_investment_plan_history");
    assert.ok(names.includes("create_investment_plan"), "falta create_investment_plan");
    for (const n of ["get_investment_plan", "list_investment_plan_history", "create_investment_plan"]) {
      const t = agentRegistry.lookup(n);
      assert.ok(t, `lookup ${n}`);
      assert.equal(t!.permission, "allow", `${n} permission`);
    }
  });

  test("TOOL_CATEGORY_MAP → cartera para los 3 tools", () => {
    for (const n of ["get_investment_plan", "list_investment_plan_history", "create_investment_plan"]) {
      assert.equal(mapToolToCategory(n), "cartera", `${n} category`);
    }
  });

  test("investmentPlan tools NO están gateados por perfil inversor", () => {
    for (const n of ["get_investment_plan", "list_investment_plan_history", "create_investment_plan"]) {
      assert.equal(isProfileGatedTool(n), false, `${n} no debe estar en PROFILE_GATED_TOOLS`);
    }
  });

  test("inputSchema valida portfolio_id uuid y rechaza vacío", () => {
    for (const n of ["get_investment_plan", "list_investment_plan_history"]) {
      const tool = agentRegistry.lookup(n)!;
      const bad = tool.inputSchema.safeParse({ portfolio_id: "not-uuid" });
      assert.equal(bad.success, false, `${n} debe rechazar uuid inválido`);
      const empty = tool.inputSchema.safeParse({});
      assert.equal(empty.success, false, `${n} debe rechazar vacío`);
      const ok = tool.inputSchema.safeParse({ portfolio_id: randomUUID() });
      assert.equal(ok.success, true, `${n} debe aceptar uuid válido`);
    }
  });

  test("create_investment_plan inputSchema requiere title + allocation", () => {
    const tool = agentRegistry.lookup("create_investment_plan")!;
    const missing = tool.inputSchema.safeParse({ portfolio_id: randomUUID(), title: "" });
    // title vacío o allocation faltante debe fallar
    assert.equal(missing.success, false);
    const ok = tool.inputSchema.safeParse({
      portfolio_id: randomUUID(),
      title: "Plan Test",
      allocation_target: { AL30: 50, GGAL: 50 },
    });
    assert.equal(ok.success, true);
  });
});

// ------------------------------------------------------------------
// Integration — ownership & latest (requiere DATABASE_URL)
// ------------------------------------------------------------------
const hasDb = !!process.env.DATABASE_URL;
const OWNER_ID = randomUUID();
const OWNER_EMAIL = "mcp-plan-owner@sentinel.local";
const OTHER_ID = randomUUID();
const OTHER_EMAIL = "mcp-plan-other@sentinel.local";
let portfolioId = "";

before(async () => {
  if (!hasDb) return;
  await db.insert(schema.users).values({ id: OWNER_ID, email: OWNER_EMAIL, passwordHash: "x" });
  await db.insert(schema.users).values({ id: OTHER_ID, email: OTHER_EMAIL, passwordHash: "x" });
  const { ensureSchema } = await import("../src/db/ensure-schema.js");
  await ensureSchema().catch(() => undefined);
  // ensure dummy account for OWNER (executor NO_ACCOUNT now bypasses, but create dummy for completeness)
  const [acct] = await db
    .insert(schema.accounts)
    .values({ id: randomUUID(), userId: OWNER_ID, iolAccountNumber: `mcp-${OWNER_ID.slice(0, 8)}` } as never)
    .returning()
    .catch(() => [] as never[]);
  void acct;
  const { InvestmentPlanService } = await import("../src/services/portfolio/InvestmentPlanService.js");
  const [portfolio] = await db
    .insert(schema.virtualPortfolios)
    .values({ id: randomUUID(), userId: OWNER_ID, name: "MCP Plans PF", description: "mcp test" })
    .returning();
  portfolioId = portfolio.id;
  // seed v1 via service (owner)
  await InvestmentPlanService.create(portfolioId, OWNER_ID, { title: "Plan Base MCP", allocation_target: { AL30: 40, GGAL: 35, YPFD: 15, TXAR: 10 } }, "user");
});

after(async () => {
  if (!hasDb) return;
  if (portfolioId) {
    await db.delete(schema.portfolioInvestmentPlans).where(eq(schema.portfolioInvestmentPlans.portfolioId, portfolioId)).catch(() => undefined);
    await db.delete(schema.virtualPortfolios).where(eq(schema.virtualPortfolios.id, portfolioId)).catch(() => undefined);
  }
  // cleanup accounts
  try {
    const { eq: eq2 } = await import("drizzle-orm");
    await db.delete(schema.accounts).where(eq2(schema.accounts.userId, OWNER_ID)).catch(() => undefined);
    await db.delete(schema.accounts).where(eq2(schema.accounts.userId, OTHER_ID)).catch(() => undefined);
  } catch {}
  await db.delete(schema.users).where(eq(schema.users.id, OWNER_ID)).catch(() => undefined);
  await db.delete(schema.users).where(eq(schema.users.id, OTHER_ID)).catch(() => undefined);
});

test("get_investment_plan retorna latest (owner)", { skip: !hasDb }, async () => {
  const result = await executeTool({
    toolName: "get_investment_plan",
    args: { portfolio_id: portfolioId },
    userId: OWNER_ID,
    scope: "read",
    registry: agentRegistry,
    clientName: "test:mcp-plan",
  });
  assert.equal(result.ok, true, `ok true, msg=${result.message.slice(0, 300)}`);
  assert.ok(result.message.includes("AL30") || result.message.includes("allocation_target"), "mensaje debe contener allocation");
  assert.ok(result.message.includes("v1") || result.message.includes("Plan Base"), "mensaje debe contener v1");
});

test("get_investment_plan sin permiso → FORBIDDEN (other user)", { skip: !hasDb }, async () => {
  const result = await executeTool({
    toolName: "get_investment_plan",
    args: { portfolio_id: portfolioId },
    userId: OTHER_ID,
    scope: "read",
    registry: agentRegistry,
    clientName: "test:mcp-plan",
  });
  assert.equal(result.ok, false);
  assert.ok(result.message.includes("FORBIDDEN"), `esperaba FORBIDDEN, got: ${result.message}`);
});

test("list_investment_plan_history retorna historial (owner)", { skip: !hasDb }, async () => {
  const result = await executeTool({
    toolName: "list_investment_plan_history",
    args: { portfolio_id: portfolioId },
    userId: OWNER_ID,
    scope: "read",
    registry: agentRegistry,
    clientName: "test:mcp-plan",
  });
  assert.equal(result.ok, true);
  assert.ok(result.message.includes("v1") || result.message.includes("Historial"), "historial debe mencionar v1");
});

test("create_investment_plan sin permiso → FORBIDDEN sin crear row", { skip: !hasDb }, async () => {
  const beforeRows = await db
    .select()
    .from(schema.portfolioInvestmentPlans)
    .where(eq(schema.portfolioInvestmentPlans.portfolioId, portfolioId));
  const beforeCount = beforeRows.length;

  const result = await executeTool({
    toolName: "create_investment_plan",
    args: { portfolio_id: portfolioId, title: "Intento Otro", allocation_target: { AL30: 50, GGAL: 50 } },
    userId: OTHER_ID,
    scope: "read",
    registry: agentRegistry,
    clientName: "test:mcp-plan",
  });
  assert.equal(result.ok, false, `esperaba FORBIDDEN, msg=${result.message}`);
  assert.ok(result.message.includes("FORBIDDEN"), `esperaba FORBIDDEN en mensaje, got: ${result.message}`);

  const afterRows = await db
    .select()
    .from(schema.portfolioInvestmentPlans)
    .where(eq(schema.portfolioInvestmentPlans.portfolioId, portfolioId));
  assert.equal(afterRows.length, beforeCount, "no debe haber creado row cuando no es owner");
});
