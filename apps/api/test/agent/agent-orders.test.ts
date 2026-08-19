import "./setup.js"; // ANTES de dotenv/config: IOL_PROVIDER=mock
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { signAccessToken } from "../../src/lib/jwt.js";
import agentRouter from "../../src/routes/agent.js";
import { createPendingOrder } from "../../src/services/agent/pendingOrders.js";
import { createTestUser, deleteTestUser } from "./helpers.js";

// ============================================================
// Confirmación de órdenes del chat: POST /api/agent/orders/:id
// (approve ejecuta el tool en scope trade — mock; reject marca).
// ============================================================

process.env.IOL_TRADING_ENABLED = "true";

async function withApp(userId: string, fn: (base: string, token: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/agent", agentRouter);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const token = signAccessToken(userId, "orders@test.local");
    await fn(`http://127.0.0.1:${port}/api/agent`, token);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function post(base: string, token: string, path: string) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

test("approve: ejecuta la orden pendiente (mock) y la marca aprobada", async () => {
  const userId = await createTestUser("u-approve");
  try {
    const pending = await createPendingOrder({
      userId,
      tool: "place_order",
      args: { symbol: "GGAL", side: "buy", qty: 10, priceType: "limit", price: 9300, market: "bcba" },
      summary: "COMPRA 10 GGAL @ 9300 (bcba)",
    });

    await withApp(userId, async (base, token) => {
      const res = await post(base, token, `/orders/${pending.id}/approve`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean; message: string };
      assert.equal(body.ok, true);
      assert.match(body.message, /MOCK-|orden|Orden|simulada/i);
    });
  } finally {
    await deleteTestUser(userId);
  }
});

test("approve: 404 si la orden no es del usuario / no existe", async () => {
  const userId = await createTestUser("u-approve-404");
  try {
    await withApp(userId, async (base, token) => {
      const res = await post(base, token, "/orders/00000000-0000-4000-8000-000000000000/approve");
      assert.equal(res.status, 404);
    });
  } finally {
    await deleteTestUser(userId);
  }
});

test("reject: marca la orden como rechazada", async () => {
  const userId = await createTestUser("u-reject");
  try {
    const pending = await createPendingOrder({
      userId,
      tool: "subscribe_fci",
      args: { symbol: "FCIARB", amount: 50000 },
      summary: "SUSCRIBIR FCI FCIARB por $50000",
    });

    await withApp(userId, async (base, token) => {
      const res = await post(base, token, `/orders/${pending.id}/reject`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean };
      assert.equal(body.ok, true);
    });
  } finally {
    await deleteTestUser(userId);
  }
});
