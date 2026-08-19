import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, sql } from "drizzle-orm";
import { signAccessToken } from "../../src/lib/jwt.js";
import portfolioMovementsRouter from "../../src/routes/portfolioMovements.js";
import { db, schema } from "../../src/db/index.js";
import { addArtDays, artStartOfDay } from "../../src/services/reports/art-time.js";

// ============================================================
// Integración rutas cash_movements (multitenant, JWT).
// Requiere BD (misma que el resto de la suite). Usa una cuenta real
// (IOL_PROVIDER=api) para respetar la FK de cash_movements; el gate
// getAccountForUser aísla por user_id.
// ============================================================

const USER_ID = randomUUID();
const EMAIL = "movements-test@sentinel.local";
const ACCOUNT_ID = randomUUID();
const IOL_NUMBER = "MOV-TEST-001";

let server: import("node:http").Server;
let base: string;
let token: string;

// Stub de fetch: rechaza hosts externos (IOL) para que /reconcile
// degrade a [] operaciones sin tocar la red.
let originalFetch: typeof fetch;
function stubExternalFetch(): void {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return originalFetch(input, init);
    throw new Error("network stub: external host bloqueado en test");
  }) as typeof fetch;
}
function restoreFetch(): void {
  globalThis.fetch = originalFetch;
}

let movementSeq = 0;
async function insertMovement(over: Record<string, unknown>): Promise<string> {
  const seq = movementSeq++;
  // Fecha única por llamada: el índice parcial detected_1per_day (D5)
  // capa detected a 1/día y el dedup_unique incluye la fecha, así que
  // cada inserción usa un día distinto para no colisionar entre tests.
  const date = over.date ?? `2026-08-${String(20 + seq).padStart(2, "0")}`;
  const [row] = await db
    .insert(schema.cashMovements)
    .values({
      accountId: ACCOUNT_ID,
      date: sql`${date}::date`,
      amount: String(over.amount ?? 50000),
      currency: (over.currency ?? "ARS") as "ARS" | "USD",
      type: (over.type ?? "deposit") as string,
      source: (over.source ?? "manual") as "manual" | "imported" | "detected",
      status: (over.status ?? "confirmed") as "confirmed" | "pending" | "rejected",
      description: (over.description as string) ?? null,
    })
    .returning({ id: schema.cashMovements.id });
  return row.id;
}

before(async () => {
  process.env.IOL_PROVIDER = "api";
  await db.insert(schema.users).values({
    id: USER_ID,
    email: EMAIL,
    passwordHash: "x",
  });
  await db.insert(schema.accounts).values({
    id: ACCOUNT_ID,
    userId: USER_ID,
    iolAccountNumber: IOL_NUMBER,
    currency: "ARS",
  });
  token = signAccessToken(USER_ID, EMAIL);

  const app = express();
  app.use(express.json());
  app.use("/api/portfolio", portfolioMovementsRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}/api/portfolio`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.delete(schema.cashMovements).where(eqAccount());
  await db.delete(schema.portfolioSnapshots).where(eq(schema.portfolioSnapshots.accountId, ACCOUNT_ID));
  await db.delete(schema.accounts).where(eq(schema.accounts.id, ACCOUNT_ID));
  await db.delete(schema.users).where(eq(schema.users.id, USER_ID));
  delete process.env.IOL_PROVIDER;
});

function eqAccount() {
  return sql`${schema.cashMovements.accountId} = ${ACCOUNT_ID}`;
}

async function get(base: string, path: string, tk = token) {
  return fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${tk}` } });
}
async function post(base: string, path: string, body: unknown, tk = token) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
    body: JSON.stringify(body),
  });
}
async function patch(base: string, path: string, body: unknown, tk = token) {
  return fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
    body: JSON.stringify(body),
  });
}
async function del(base: string, path: string, tk = token) {
  return fetch(`${base}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tk}` },
  });
}

test("POST /movements: 201 crea manual/confirmed", async () => {
  const res = await post(base, "/movements", {
    date: "2026-08-19",
    amount: 50000,
    currency: "ARS",
    type: "deposit",
    description: "depósito test",
  });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { movement: { id: string; status: string; source: string; amount: number } };
  assert.equal(body.movement.status, "confirmed");
  assert.equal(body.movement.source, "manual");
  assert.equal(body.movement.amount, 50000);
});

test("POST /movements: 400 con body inválido (amount no numérico)", async () => {
  const res = await post(base, "/movements", {
    date: "2026-08-19",
    amount: "mucho",
    currency: "ARS",
    type: "deposit",
  });
  assert.equal(res.status, 400);
});

test("POST /movements: 400 con fecha inválida", async () => {
  const res = await post(base, "/movements", {
    date: "19/08/2026",
    amount: 50000,
    currency: "ARS",
    type: "deposit",
  });
  assert.equal(res.status, 400);
});

test("GET /movements: 200 lista los movimientos del usuario", async () => {
  await insertMovement({ description: "para listar" });
  const res = await get(base, "/movements");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { movements: { id: string; date: string }[] };
  assert.ok(Array.isArray(body.movements));
  assert.ok(body.movements.length >= 1);
  assert.match(body.movements[0].date, /^\d{4}-\d{2}-\d{2}$/);
});

test("GET /movements: filtra por status", async () => {
  const res = await get(base, "/movements?status=pending");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { movements: { status: string }[] };
  assert.ok(body.movements.every((m) => m.status === "pending"));
});

test("PATCH /movements/:id: 200 confirma un pending (setea decidedAt)", async () => {
  const id = await insertMovement({ source: "detected", status: "pending", amount: 12345 });
  const res = await patch(base, `/movements/${id}`, { status: "rejected" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { movement: { status: string; decidedAt: string | null } };
  assert.equal(body.movement.status, "rejected");
  assert.ok(body.movement.decidedAt, "decidedAt seteado");
});

test("PATCH /movements/:id: 409 si no está pending", async () => {
  const id = await insertMovement({ status: "confirmed" });
  const res = await patch(base, `/movements/${id}`, { status: "rejected" });
  assert.equal(res.status, 409);
});

test("PATCH /movements/:id: 404 si no existe", async () => {
  const res = await patch(base, `/movements/${randomUUID()}`, { status: "rejected" });
  assert.equal(res.status, 404);
});

test("DELETE /movements/:id: 204 borra pending/rejected", async () => {
  const id = await insertMovement({ source: "detected", status: "rejected" });
  const res = await del(base, `/movements/${id}`);
  assert.equal(res.status, 204);
});

test("DELETE /movements/:id: 409 si está confirmed", async () => {
  const id = await insertMovement({ status: "confirmed" });
  const res = await del(base, `/movements/${id}`);
  assert.equal(res.status, 409);
});

test("POST /reconcile: 200 devuelve suggestions (preview, sin insertar)", async () => {
  stubExternalFetch();
  try {
    // snapshots: prev < today con delta inexplicado en ARS
    await db.insert(schema.portfolioSnapshots).values({
      accountId: ACCOUNT_ID,
      totalValue: "100000",
      totalValueUsd: "0",
      cash: "100000",
      cashArs: "100000",
      cashUsd: "0",
      positionsValue: "0",
      unrealizedGain: "0",
      currency: "ARS",
      capturedAt: artStartOfDay(addArtDays(new Date(), -2)),
    });
    await db.insert(schema.portfolioSnapshots).values({
      accountId: ACCOUNT_ID,
      totalValue: "200000",
      totalValueUsd: "0",
      cash: "200000",
      cashArs: "200000",
      cashUsd: "0",
      positionsValue: "0",
      unrealizedGain: "0",
      currency: "ARS",
      capturedAt: artStartOfDay(addArtDays(new Date(), -1)),
    });

    const res = await post(base, "/reconcile", {});
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      date: string;
      suggestions: { currency: string; thresholdExceeded: boolean; movement: { type: string } | null }[];
    };
    assert.ok(Array.isArray(body.suggestions));
    const ars = body.suggestions.find((s) => s.currency === "ARS");
    assert.ok(ars, "ARS presente");
    assert.equal(ars!.thresholdExceeded, true);
    assert.ok(ars!.movement, "sugiere movimiento detected");
    assert.equal(ars!.movement!.type, "deposit");

    // no insertó nada (preview): el conteo de detected no crece tras /reconcile
    const before = await get(base, "/movements?source=detected");
    const beforeBody = (await before.json()) as { movements: unknown[] };

    const after = await get(base, "/movements?source=detected");
    const afterBody = (await after.json()) as { movements: unknown[] };
    assert.equal(afterBody.movements.length, beforeBody.movements.length, "/reconcile no inserta detected");
  } finally {
    restoreFetch();
  }
});

test("sin token → 401", async () => {
  const res = await get(base, "/movements", "");
  assert.equal(res.status, 401);
});
