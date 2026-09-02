import "./setup.js"; // ANTES de dotenv/config: IOL_PROVIDER=mock
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { signAccessToken } from "../../src/lib/jwt.js";
import ordersRouter from "../../src/routes/orders.js";

// ============================================================
// Integración ruta POST /api/orders (mock):
//   - 403 sin IOL_TRADING_ENABLED
//   - 400 con args inválidos
//   - 200 con ejecución simulada (MockIolProvider)
// La autenticación se mockea con un access token real (JWT).
// ============================================================

async function withApp(fn: (baseUrl: string, token: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/orders", ordersRouter);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const token = signAccessToken("11111111-1111-4111-8111-111111111111", "orders@test.local");
    await fn(`http://127.0.0.1:${port}/api/orders`, token);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function post(base: string, token: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

test("POST /api/orders: 403 si el trading está deshabilitado", async () => {
  delete process.env.IOL_TRADING_ENABLED;
  await withApp(async (base, token) => {
    const res = await post(base, token, "/", {
      symbol: "GGAL",
      side: "buy",
      qty: 10,
      priceType: "market",
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /deshabilitado/i);
  });
});

test("POST /api/orders: 400 con args inválidos (qty <= 0)", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  await withApp(async (base, token) => {
    const res = await post(base, token, "/", {
      symbol: "GGAL",
      side: "buy",
      qty: -5,
      priceType: "market",
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error.length > 0);
  });
});

test("POST /api/orders: 200 y ejecuta la orden (modo mock)", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  await withApp(async (base, token) => {
    const res = await post(base, token, "/", {
      symbol: "GGAL",
      side: "buy",
      qty: 10,
      priceType: "limit",
      price: 9300,
      market: "bcba",
      term: "t1",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; orderId: string; status: string };
    assert.equal(body.ok, true);
    assert.match(body.orderId, /MOCK-/);
  });
});

test("POST /api/orders/fci/subscribe: 200 (modo mock)", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  await withApp(async (base, token) => {
    const res = await post(base, token, "/fci/subscribe", {
      symbol: "FCIARB",
      amount: 50000,
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; orderId: string };
    assert.equal(body.ok, true);
    assert.match(body.orderId, /MOCK-FCI-/);
  });
});

test("POST /api/orders/123/cancel: 200 (modo mock)", async () => {
  process.env.IOL_TRADING_ENABLED = "true";
  await withApp(async (base, token) => {
    const res = await post(base, token, "/123456/cancel", {});
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; orderId: string; status: string };
    assert.equal(body.ok, true);
    assert.equal(body.orderId, "123456");
  });
});
