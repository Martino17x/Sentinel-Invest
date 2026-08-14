import { test } from "node:test";
import assert from "node:assert/strict";
import { toZod4 } from "../../src/mcp/zod4-adapter.js";
import {
  getQuoteTool,
  searchInstrumentsTool,
} from "../../src/services/agent/tools/quotes.js";
import { placeOrderTool } from "../../src/services/agent/tools/placeOrder.js";
import { getMonthlyReportsTool } from "../../src/services/agent/tools/reports.js";
import { getPortfolioTool } from "../../src/services/agent/tools/portfolio.js";

// ============================================================
// Adapter zod v3 → zod4 (capa MCP) — requiredness y tipos deben
// reflejar el contrato del engine; el executor valida SIEMPRE
// con el zod v3 real (defensa en profundidad).
// ============================================================

function parseOk(schema: ReturnType<typeof toZod4>, args: unknown): boolean {
  const result = schema.safeParse(args);
  return result.success;
}

test("toZod4: get_quote — market con default → opcional en MCP", () => {
  const schema = toZod4(getQuoteTool.inputSchema);
  assert.equal(parseOk(schema, { symbol: "GGAL" }), true, "sin market (default bcba)");
  assert.equal(parseOk(schema, { symbol: "GGAL", market: "nyse" }), true);
  assert.equal(parseOk(schema, { symbol: "GGAL", market: "no-existe" }), false, "enum inválido");
  assert.equal(parseOk(schema, { symbol: "" }), false, "symbol vacío");
  assert.equal(parseOk(schema, { symbol: "MUYLARGO-MAS-DE-10" }), false, "symbol > 10");
  assert.equal(parseOk(schema, {}), false, "symbol requerido");
});

test("toZod4: search_instruments — limit int y q requerida", () => {
  const schema = toZod4(searchInstrumentsTool.inputSchema);
  assert.equal(parseOk(schema, { q: "GGAL" }), true, "defaults market/assetType/limit");
  assert.equal(parseOk(schema, { q: "GGAL", limit: 50 }), true);
  assert.equal(parseOk(schema, { q: "GGAL", limit: 0 }), false, "limit min 1");
  assert.equal(parseOk(schema, { q: "GGAL", limit: 51 }), false, "limit max 50");
  assert.equal(parseOk(schema, { q: "GGAL", limit: 2.5 }), false, "limit int");
  assert.equal(parseOk(schema, { q: "" }), false, "q requerida");
});

test("toZod4: place_order — contrato completo con opcionales", () => {
  const schema = toZod4(placeOrderTool.inputSchema);
  assert.equal(parseOk(schema, { symbol: "GGAL", side: "buy", qty: 10 }), true);
  assert.equal(parseOk(schema, { symbol: "GGAL", side: "sell", qty: 1, priceType: "limit", price: 100 }), true);
  assert.equal(parseOk(schema, { symbol: "GGAL", side: "hold", qty: 10 }), false, "side enum");
  assert.equal(parseOk(schema, { symbol: "GGAL", side: "buy", qty: -5 }), false, "qty positiva");
  assert.equal(parseOk(schema, { symbol: "GGAL", side: "buy", qty: 0 }), false, "qty > 0");
});

test("toZod4: get_monthly_reports — month opcional con formato YYYY-MM", () => {
  const schema = toZod4(getMonthlyReportsTool.inputSchema);
  assert.equal(parseOk(schema, {}), true);
  assert.equal(parseOk(schema, { month: "2026-07" }), true);
  assert.equal(parseOk(schema, { month: "julio" }), false, "formato YYYY-MM");
});

test("toZod4: get_portfolio — sin argumentos (shape no estricto como el engine)", () => {
  const schema = toZod4(getPortfolioTool.inputSchema);
  assert.equal(parseOk(schema, {}), true);
  // z.object() de zod (v3 y v4) descarta keys desconocidas por defecto —
  // el executor valida igual con el schema real del engine
  assert.equal(parseOk(schema, { algo: 1 }), true);
});

test("toZod4: el schema MCP cumple Standard Schema (contrato del SDK v2)", () => {
  const schema = toZod4(getQuoteTool.inputSchema) as { "~standard"?: unknown };
  assert.ok(schema["~standard"], "debe exponer ~standard para el MCP SDK v2");
});
