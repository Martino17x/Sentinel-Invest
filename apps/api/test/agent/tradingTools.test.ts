import "./setup.js"; // ANTES de dotenv/config: IOL_PROVIDER=mock
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeOrderTool } from "../../src/services/agent/tools/placeOrder.js";
import { cancelOrderTool } from "../../src/services/agent/tools/cancelOrder.js";
import { subscribeFciTool, rescueFciTool } from "../../src/services/agent/tools/fci.js";
import type { ToolContext } from "../../src/services/agent/types.js";

// ============================================================
// Tools de trading (cancel_order, subscribe_fci, rescue_fci y
// place_order con especie D) — gates + ejecución en modo mock.
// Tests unitarios directos sobre execute (sin BD).
// ============================================================

const BASE_CTX: ToolContext = {
  userId: "u-trading-tools-test",
  scope: "trade",
  account: { id: "demo", iolAccountNumber: "demo-0001", currency: "ARS" },
  creds: { username: "", password: "" }, // el mock las ignora
  signal: new AbortController().signal,
};

function withScope(scope: ToolContext["scope"]): ToolContext {
  return { ...BASE_CTX, scope };
}

process.env.IOL_TRADING_ENABLED = "true";

test("cancel_order: trading deshabilitado → error SIN ejecutar", async () => {
  delete process.env.IOL_TRADING_ENABLED;
  const result = await cancelOrderTool.execute(withScope("trade"), { operationNumber: 123 });
  assert.equal(result.ok, false);
  assert.match(result.message, /deshabilitado/i);
});

test("cancel_order: requiere scope trade", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  const result = await cancelOrderTool.execute(withScope("read"), { operationNumber: 123 });
  assert.equal(result.ok, false);
  assert.match(result.message, /scope trade/);
});

test("cancel_order: ejecuta (mock) y confirma la cancelación", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  const result = await cancelOrderTool.execute(withScope("trade"), { operationNumber: 123456 });
  assert.equal(result.ok, true);
  assert.match(result.message, /123456/);
  assert.match(result.message, /cancelada/);
});

test("subscribe_fci: ejecuta (mock) y confirma la suscripción", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  const result = await subscribeFciTool.execute(withScope("trade"), { symbol: "FCIARB", amount: 50000 });
  assert.equal(result.ok, true);
  assert.match(result.message, /Suscripción simulada/);
  assert.match(result.message, /FCIARB/);
});

test("rescue_fci: ejecuta (mock) y confirma el rescate", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  const result = await rescueFciTool.execute(withScope("trade"), { symbol: "FCIARB", quantity: 100 });
  assert.equal(result.ok, true);
  assert.match(result.message, /Rescate simulado/);
  assert.match(result.message, /FCIARB/);
});

test("place_order: especie D (MEP) en bcba ejecuta; en otro mercado rechaza", async () => {
  process.env.IOL_TRADING_ENABLED = "true";

  const ok = await placeOrderTool.execute(withScope("trade"), {
    symbol: "AL30",
    side: "buy",
    qty: 10,
    priceType: "limit",
    price: 9500,
    market: "bcba",
    specie: "D",
  });
  assert.equal(ok.ok, true);
  assert.match(ok.message, /MOCK-/);

  const bad = await placeOrderTool.execute(withScope("trade"), {
    symbol: "AL30",
    side: "buy",
    qty: 10,
    priceType: "limit",
    price: 9500,
    market: "nyse",
    specie: "D",
  });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /solo operan en el mercado bcba/);
});
