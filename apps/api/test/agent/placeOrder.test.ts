import "./setup.js"; // ANTES de dotenv/config: IOL_PROVIDER=mock
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeOrderTool } from "../../src/services/agent/tools/placeOrder.js";
import type { ToolContext } from "../../src/services/agent/types.js";

// ============================================================
// place_order — operatoria real (gates + ejecución en modo mock)
//
// Tests unitarios directos sobre el execute del tool (sin BD):
// los gates A-D corren dentro de execute, antes de tocar IOL.
// El modo mock del provider simula la ejecución (setup.ts).
// ============================================================

const BASE_CTX: ToolContext = {
  userId: "u-place-order-test",
  scope: "trade",
  account: { id: "demo", iolAccountNumber: "demo-0001", currency: "ARS" },
  creds: { username: "", password: "" }, // el mock las ignora
  signal: new AbortController().signal,
};

function withScope(scope: ToolContext["scope"]): ToolContext {
  return { ...BASE_CTX, scope };
}

async function run(args: unknown, scope: ToolContext["scope"] = "trade") {
  return placeOrderTool.execute(withScope(scope), args);
}

process.env.IOL_TRADING_ENABLED = "true";

test("place_order: trading deshabilitado por defecto → error claro SIN ejecutar", async () => {
  delete process.env.IOL_TRADING_ENABLED;
  const result = await run({ symbol: "GGAL", side: "buy", qty: 10 });
  assert.equal(result.ok, false);
  assert.match(result.message, /deshabilitado/i);
});

test("place_order: requiere scope trade (MCP)", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  const result = await run({ symbol: "GGAL", side: "buy", qty: 10 }, "read");
  assert.equal(result.ok, false);
  assert.match(result.message, /scope trade/);
});

test("place_order: limit sin precio → error claro", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  const result = await run({ symbol: "GGAL", side: "buy", qty: 10, priceType: "limit" });
  assert.equal(result.ok, false);
  assert.match(result.message, /requieren un precio/);
});

test("place_order: limit con precio → ejecuta (mock) y confirma", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  const result = await run({
    symbol: "GGAL",
    side: "buy",
    qty: 10,
    priceType: "limit",
    price: 9300,
  });
  assert.equal(result.ok, true);
  assert.match(result.message, /compra/);
  assert.match(result.message, /MOCK-/);
});

test("place_order: market sin precio → resuelve referencia y ejecuta (mock)", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  const result = await run({ symbol: "GGAL", side: "sell", qty: 5, priceType: "market" });
  assert.equal(result.ok, true);
  assert.match(result.message, /venta/);
  assert.match(result.message, /MOCK-/);
});
