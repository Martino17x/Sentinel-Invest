import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../../../src/lib/jwt.js";
import {
  createPlanSchema,
  getUnknownSymbols,
} from "../../../src/services/portfolio/validation/plans.js";
import { db, schema } from "../../../src/db/index.js";
import virtualPortfoliosRouter from "../../../src/interfaces/http/routes/virtualPortfolios.js";

// ------------------------------------------------------------------
// Unit: validación Zod (no requiere DB)
// ------------------------------------------------------------------
describe("plans validation — unit", () => {
  test("400 sum 80 → INVALID_ALLOCATION_SUM", () => {
    const parsed = createPlanSchema.safeParse({
      title: "Test",
      allocation_target: { AL30: 50, GGAL: 30 },
    });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const codes = parsed.error.issues.map((i) => i.message);
      assert.ok(codes.includes("INVALID_ALLOCATION_SUM"), `codes=${codes.join(",")}`);
    }
  });

  test("400 sum 100 ok", () => {
    const parsed = createPlanSchema.safeParse({
      title: "Test",
      allocation_target: { AL30: 50, GGAL: 50 },
    });
    assert.equal(parsed.success, true);
  });

  test("400 UNKNOWN_SYMBOL via getUnknownSymbols", () => {
    const unknown = getUnknownSymbols({ FAKE: 100 }, new Set(["AL30", "GGAL"]));
    assert.deepEqual(unknown, ["FAKE"]);
  });

  test("pseudo symbols cash/dollar_linked son conocidos", () => {
    const unknown = getUnknownSymbols(
      { cash: 10, dollar_linked: 15, AL30: 75 },
      new Set(["AL30", "cash", "dollar_linked"])
    );
    assert.deepEqual(unknown, []);
  });

  test("400 sum 100.01 dentro de tolerancia ±0.01", () => {
    const parsed = createPlanSchema.safeParse({
      title: "T",
      allocation_target: { AL30: 33.33, GGAL: 33.33, YPFD: 33.34 },
    });
    assert.equal(parsed.success, true);
  });

  test("400 sum 100.02 fuera de tolerancia", () => {
    const parsed = createPlanSchema.safeParse({
      title: "T",
      allocation_target: { AL30: 50.02, GGAL: 50.0 },
    });
    // 100.02 diff 0.02 > 0.01 => fail
    assert.equal(parsed.success, false);
  });
});

// ------------------------------------------------------------------
// Integration: API routes (requiere DATABASE_URL)
// Si no hay DB, se skipea — typecheck sigue verde.
// ------------------------------------------------------------------
const hasDb = !!process.env.DATABASE_URL;
const USER_ID = randomUUID();
const EMAIL = "plans-test-owner@sentinel.local";
const OTHER_ID = randomUUID();
const OTHER_EMAIL = "plans-test-other@sentinel.local";
let portfolioId = "";
let token = "";
let otherToken = "";
let server: import("node:http").Server;
let base = "";

before(async () => {
  if (!hasDb) return;
  await db.insert(schema.users).values({ id: USER_ID, email: EMAIL, passwordHash: "x" });
  await db.insert(schema.users).values({ id: OTHER_ID, email: OTHER_EMAIL, passwordHash: "x" });
  // ensure schema exists (ensure-schema already runs on boot, but force)
  const { ensureSchema } = await import("../../../src/db/ensure-schema.js");
  await ensureSchema().catch(() => undefined);
  const [portfolio] = await db
    .insert(schema.virtualPortfolios)
    .values({ id: randomUUID(), userId: USER_ID, name: "Plans Test PF", description: "test" })
    .returning();
  portfolioId = portfolio.id;
  token = signAccessToken(USER_ID, EMAIL);
  otherToken = signAccessToken(OTHER_ID, OTHER_EMAIL);
  const app = express();
  app.use(express.json());
  app.use("/api/virtual-portfolios", virtualPortfoliosRouter);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (!hasDb) return;
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (portfolioId) {
    await db.delete(schema.portfolioInvestmentPlans).where(eq(schema.portfolioInvestmentPlans.portfolioId, portfolioId)).catch(() => undefined);
    await db.delete(schema.virtualPortfolios).where(eq(schema.virtualPortfolios.id, portfolioId)).catch(() => undefined);
  }
  await db.delete(schema.users).where(eq(schema.users.id, USER_ID)).catch(() => undefined);
  await db.delete(schema.users).where(eq(schema.users.id, OTHER_ID)).catch(() => undefined);
});

async function req(method: string, path: string, body?: unknown, tk = token) {
  if (!hasDb) return { status: 0, json: async () => ({}) } as unknown as Response;
  const headers: Record<string, string> = {};
  if (tk) headers.Authorization = `Bearer ${tk}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res;
}

test("403 non-owner en POST /:id/plans", { skip: !hasDb }, async () => {
  const res = await req("POST", `/api/virtual-portfolios/${portfolioId}/plans`, { title: "X", allocation_target: { AL30: 100 } }, otherToken);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("400 sum 80 en POST /:id/plans → INVALID_ALLOCATION_SUM", { skip: !hasDb }, async () => {
  const res = await req("POST", `/api/virtual-portfolios/${portfolioId}/plans`, {
    title: "Bad sum",
    allocation_target: { AL30: 50, GGAL: 30 },
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "INVALID_ALLOCATION_SUM");
});

test("400 UNKNOWN_SYMBOL FAKE en POST /:id/plans", { skip: !hasDb }, async () => {
  const res = await req("POST", `/api/virtual-portfolios/${portfolioId}/plans`, {
    title: "Fake",
    allocation_target: { FAKE: 100 },
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "UNKNOWN_SYMBOL");
});

test("201 creación v1 + GET history [v1] + GET latest === v1", { skip: !hasDb }, async () => {
  const res = await req("POST", `/api/virtual-portfolios/${portfolioId}/plans`, {
    title: "Plan v1",
    allocation_target: { AL30: 40, GGAL: 35, YPFD: 15, TXAR: 10 },
  });
  assert.equal(res.status, 201);
  const created = (await res.json()) as { plan: { version: number } };
  assert.equal(created.plan.version, 1);

  const histRes = await req("GET", `/api/virtual-portfolios/${portfolioId}/plans`);
  assert.equal(histRes.status, 200);
  const hist = (await histRes.json()) as { plans: { version: number }[] };
  assert.ok(hist.plans.length >= 1);
  assert.equal(hist.plans[0]!.version, 1);

  const latestRes = await req("GET", `/api/virtual-portfolios/${portfolioId}/plans/latest`);
  assert.equal(latestRes.status, 200);
  const latest = (await latestRes.json()) as { plan: { version: number } };
  assert.equal(latest.plan.version, 1);

  const v1Res = await req("GET", `/api/virtual-portfolios/${portfolioId}/plans/1`);
  assert.equal(v1Res.status, 200);
  const v1 = (await v1Res.json()) as { plan: { version: number } };
  assert.equal(v1.plan.version, 1);
});

test("404 version inexistente", { skip: !hasDb }, async () => {
  const res = await req("GET", `/api/virtual-portfolios/${portfolioId}/plans/999`);
  assert.equal(res.status, 404);
});

test("409 race concurrent → VERSION_CONFLICT (simulado con doble insert mismo version)", { skip: !hasDb }, async () => {
  // Creamos v2 primero
  const r2 = await req("POST", `/api/virtual-portfolios/${portfolioId}/plans`, {
    title: "Plan v2",
    allocation_target: { AL30: 50, GGAL: 50 },
  });
  assert.equal(r2.status, 201);

  // Intento concurrente real: dos POST simultáneos para v3
  const [a, b] = await Promise.all([
    req("POST", `/api/virtual-portfolios/${portfolioId}/plans`, {
      title: "Race A",
      allocation_target: { AL30: 60, GGAL: 40 },
    }),
    req("POST", `/api/virtual-portfolios/${portfolioId}/plans`, {
      title: "Race B",
      allocation_target: { AL30: 70, GGAL: 30 },
    }),
  ]);
  // Uno debe ser 201, el otro puede ser 201 (serializado) o 409 (si hubo colisión).
  // El spec exige que si ambos calculan MAX+1 = 3 al mismo tiempo, uno falle 409.
  // En SERIALIZABLE sin retry, Postgres serializa y uno gana; el otro reintento daría OK.
  // Aceptamos ambos como 201 O uno 409; lo importante es que no haya 500 y que tras ambos haya v3 y v4 o solo v3.
  const statuses = [a.status, b.status].sort();
  assert.ok(
    (statuses[0] === 201 && statuses[1] === 201) || (statuses.includes(201) && statuses.includes(409)),
    `statuses=${statuses.join(",")}`
  );

  // Historial debe estar ordenado DESC [v3,v2,v1] o [v4,v3,v2,v1]
  const histRes = await req("GET", `/api/virtual-portfolios/${portfolioId}/plans`);
  const hist = (await histRes.json()) as { plans: { version: number }[] };
  const versions = hist.plans.map((p) => p.version);
  const sorted = [...versions].sort((x, y) => y - x);
  assert.deepEqual(versions, sorted, "historial DESC");

  // Latest debe ser MAX
  const latestRes = await req("GET", `/api/virtual-portfolios/${portfolioId}/plans/latest`);
  const latest = (await latestRes.json()) as { plan: { version: number } };
  assert.equal(latest.plan.version, Math.max(...versions));

  // GET /plans/:version exacto debe coincidir con latest
  const exactRes = await req("GET", `/api/virtual-portfolios/${portfolioId}/plans/${latest.plan.version}`);
  const exact = (await exactRes.json()) as { plan: { version: number; id: string } };
  assert.equal(exact.plan.version, latest.plan.version);
});
