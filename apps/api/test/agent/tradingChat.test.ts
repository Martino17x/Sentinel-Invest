import "./setup.js"; // ANTES de dotenv/config: IOL_PROVIDER=mock
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { placeOrderTool } from "../../src/services/agent/tools/placeOrder.js";
import { cancelOrderTool } from "../../src/services/agent/tools/cancelOrder.js";
import { subscribeFciTool } from "../../src/services/agent/tools/fci.js";
import type { ToolContext } from "../../src/services/agent/types.js";
import { db, schema } from "../../src/db/index.js";
import { createTestUser, deleteTestUser } from "./helpers.js";

// ============================================================
// Tools de trading en scope "chat": preparan la orden como
// pending_orders y NO ejecutan (confirmación explícita).
// ============================================================

process.env.IOL_TRADING_ENABLED = "true";

function chatCtx(userId: string): ToolContext {
  return {
    userId,
    scope: "chat",
    account: { id: "demo", iolAccountNumber: "demo-0001", currency: "ARS" },
    creds: { username: "", password: "" }, // el mock las ignora
    signal: new AbortController().signal,
  };
}

test("place_order en scope chat crea pending_orders y no ejecuta", async () => {
  const userId = await createTestUser("u-chat-place");
  try {
    const result = await placeOrderTool.execute(chatCtx(userId), {
      symbol: "GGAL",
      side: "buy",
      qty: 10,
      priceType: "limit",
      price: 9300,
      market: "bcba",
    });
    assert.equal(result.ok, true);
    assert.ok(result.pendingApproval, "debe devolver pendingApproval");
    assert.match(result.message, /Orden preparada/);
    assert.doesNotMatch(result.message, /MOCK-/, "no debe ejecutar en scope chat");

    const [row] = await db
      .select()
      .from(schema.pendingOrders)
      .where(eq(schema.pendingOrders.id, result.pendingApproval!.id));
    assert.ok(row, "fila pending_orders creada");
    assert.equal(row.tool, "place_order");
    assert.equal(row.status, "pending");
  } finally {
    await deleteTestUser(userId);
  }
});

test("cancel_order en scope chat crea pending_orders", async () => {
  const userId = await createTestUser("u-chat-cancel");
  try {
    const result = await cancelOrderTool.execute(chatCtx(userId), { operationNumber: 123456 });
    assert.equal(result.ok, true);
    assert.ok(result.pendingApproval);
    assert.equal(result.pendingApproval!.summary, "CANCELAR operación 123456");
  } finally {
    await deleteTestUser(userId);
  }
});

test("subscribe_fci en scope chat crea pending_orders", async () => {
  const userId = await createTestUser("u-chat-fci");
  try {
    const result = await subscribeFciTool.execute(chatCtx(userId), { symbol: "FCIARB", amount: 50000 });
    assert.equal(result.ok, true);
    assert.ok(result.pendingApproval);
    assert.match(result.pendingApproval!.summary, /SUSCRIBIR FCI FCIARB/);
  } finally {
    await deleteTestUser(userId);
  }
});
