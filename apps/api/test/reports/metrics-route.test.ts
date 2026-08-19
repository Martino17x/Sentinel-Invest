import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../../src/lib/jwt.js";
import portfolioRouter from "../../src/routes/portfolio.js";
import { db, schema } from "../../src/db/index.js";
import { addArtDays, artStartOfDay } from "../../src/services/reports/art-time.js";
import { resetMarketCache } from "../../src/services/market/yahoo.js";

// ============================================================
// Integración GET /api/portfolio/metrics (F3-A1, D11).
// Calcula métricas puras sobre portfolio_snapshots + benchmark
// Merval (^MERV). El fetch de Yahoo se STUBEA: devolvemos una
// serie diaria 2026 creciente para que la correlación se alinee.
// ============================================================

const USER_ID = randomUUID();
const EMAIL = "metrics-test@sentinel.local";
const ACCOUNT_ID = randomUUID();
const IOL_NUMBER = "METRICS-TEST-001";

let server: import("node:http").Server;
let base: string;
let token: string;

// ---- Stub de fetch (Yahoo chart) ----
let originalFetch: typeof fetch;
function buildMervalResponse() {
  const timestamps: number[] = [];
  const closes: number[] = [];
  const start = Date.UTC(2026, 0, 1, 12, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(start + i * 86_400_000);
    timestamps.push(Math.floor(d.getTime() / 1000));
    closes.push(1000 + i); // tendencia alcista estable
  }
  return {
    chart: {
      result: [
        {
          timestamp: timestamps,
          indicators: { quote: [{ close: closes }] },
          meta: {},
        },
      ],
    },
  };
}
function stubYahoo(): void {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return originalFetch(input, init);
    if (url.includes("query1.finance.yahoo.com") && url.includes("/chart/")) {
      return new Response(JSON.stringify(buildMervalResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("network stub: host externo bloqueado en test");
  }) as typeof fetch;
}
function restoreFetch(): void {
  globalThis.fetch = originalFetch;
  resetMarketCache();
}

async function insertSnapshot(totalValue: string, dayOffset: number): Promise<void> {
  await db.insert(schema.portfolioSnapshots).values({
    accountId: ACCOUNT_ID,
    totalValue,
    totalValueUsd: "0",
    cash: totalValue,
    cashArs: totalValue,
    cashUsd: "0",
    positionsValue: "0",
    unrealizedGain: "0",
    currency: "ARS",
    capturedAt: artStartOfDay(addArtDays(new Date(), -dayOffset)),
  });
}

before(async () => {
  process.env.IOL_PROVIDER = "api";
  await db.insert(schema.users).values({ id: USER_ID, email: EMAIL, passwordHash: "x" });
  await db.insert(schema.accounts).values({
    id: ACCOUNT_ID,
    userId: USER_ID,
    iolAccountNumber: IOL_NUMBER,
    currency: "ARS",
  });
  token = signAccessToken(USER_ID, EMAIL);

  const app = express();
  app.use(express.json());
  app.use("/api/portfolio", portfolioRouter);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}/api/portfolio`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db
    .delete(schema.portfolioSnapshots)
    .where(eq(schema.portfolioSnapshots.accountId, ACCOUNT_ID));
  await db.delete(schema.accounts).where(eq(schema.accounts.id, ACCOUNT_ID));
  await db.delete(schema.users).where(eq(schema.users.id, USER_ID));
  delete process.env.IOL_PROVIDER;
});

async function getMetrics(base: string, query = "", tk = token) {
  return fetch(`${base}/metrics${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${tk}` },
  });
}

test("GET /metrics: 200 con métricas calculadas sobre snapshots + Merval", async () => {
  stubYahoo();
  try {
    await insertSnapshot("100000", 5);
    await insertSnapshot("105000", 4);
    await insertSnapshot("103000", 3);
    await insertSnapshot("109000", 2);
    await insertSnapshot("112000", 1);

    const res = await getMetrics(base, "days=90&rf=0");
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      volatility: number;
      sharpe: number;
      maxDrawdown: number;
      mervalCorrelation: number;
      ytd: number;
      periodReturn: number;
      rf: number;
    };
    assert.equal(typeof body.volatility, "number");
    assert.ok(body.volatility > 0, "volatilidad > 0 con retornos no nulos");
    assert.equal(typeof body.sharpe, "number");
    assert.equal(typeof body.maxDrawdown, "number");
    assert.ok(body.maxDrawdown >= 0);
    assert.equal(typeof body.mervalCorrelation, "number", "correlación alineada con Merval");
    assert.ok(Math.abs(body.mervalCorrelation) <= 1, "correlación en rango [-1,1]");
    assert.equal(typeof body.ytd, "number");
    assert.equal(typeof body.periodReturn, "number");
    assert.ok(body.periodReturn > 0, "retorno del período positivo (serie creciente)");
    assert.equal(body.rf, 0, "rf default 0");
  } finally {
    restoreFetch();
  }
});

test("GET /metrics: rf se propaga y afecta el Sharpe", async () => {
  stubYahoo();
  try {
    // Offsets distintos a los del test anterior para no colisionar
    // con el unique(account_id, captured_at) de portfolio_snapshots.
    await insertSnapshot("100000", 15);
    await insertSnapshot("110000", 14);
    await insertSnapshot("115000", 13);
    await insertSnapshot("120000", 12);
    await insertSnapshot("125000", 11);

    const r0 = await getMetrics(base, "rf=0");
    const r1 = await getMetrics(base, "rf=0.1");
    const b0 = (await r0.json()) as { sharpe: number; rf: number };
    const b1 = (await r1.json()) as { sharpe: number; rf: number };
    assert.equal(b0.rf, 0);
    assert.equal(b1.rf, 0.1);
    assert.notEqual(b0.sharpe, b1.sharpe, "rf distinto cambia el Sharpe");
  } finally {
    restoreFetch();
  }
});

test("GET /metrics: 400 con rf no numérico", async () => {
  const res = await getMetrics(base, "rf=abc");
  assert.equal(res.status, 400);
});

test("GET /metrics: 401 sin token", async () => {
  const res = await getMetrics(base, "days=30", "");
  assert.equal(res.status, 401);
});
