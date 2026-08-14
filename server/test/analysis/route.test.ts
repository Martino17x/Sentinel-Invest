import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { signAccessToken } from "../../src/lib/jwt.js";
import analysisRouter from "../../src/routes/analysis.js";
import { resetMarketCache } from "../../src/services/market/yahoo.js";

// ============================================================
// Integración ruta GET /api/analysis/:symbol — Yahoo mockeado
// (stub global fetch, mismo patrón que cache.test.ts).
//
// La ruta usa requireAuth → mintemos un access token real con el
// mismo JWT_SECRET del server (default en tests, jwt.ts) — el
// middleware solo verifica la firma, no toca la BD.
// ============================================================

const CHART_TS_BASE = 1_700_000_000;

function chartJson(closes: number[], opts: { error?: boolean } = {}): object {
  if (opts.error) {
    return { chart: { error: { code: "Not Found" }, result: null } };
  }
  return {
    chart: {
      result: [
        {
          timestamp: closes.map((_, i) => CHART_TS_BASE + i * 86400),
          indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }] },
          meta: {
            regularMarketPrice: closes[closes.length - 1],
            fiftyTwoWeekLow: 50,
            fiftyTwoWeekHigh: 150,
            currency: "USD",
            longName: "NVIDIA Corporation",
          },
        },
      ],
    },
  };
}

function fundamentalsJson(): object {
  return {
    quoteSummary: {
      result: [
        {
          defaultKeyStatistics: {
            trailingPE: { raw: 34.5 },
            trailingEps: { raw: 6.5 },
            beta: { raw: 2.2 },
            returnOnEquity: { raw: 0.6 },
            debtToEquity: { raw: 0.2 },
            dividendYield: { raw: 0.0045 },
            marketCap: { raw: 5_450_000_000_000 },
          },
          financialData: { profitMargins: { raw: 0.63 } },
          summaryDetail: {},
        },
      ],
    },
  };
}

const A3_COOKIE = "A3=d=AQAB~test-cookie; Path=/; Domain=.yahoo.com";

/** Serie creciente 220 barras → señal bullish (61/100) con todos los indicadores */
const BULLISH_CLOSES = Array.from({ length: 220 }, (_, i) => 1000 + i * 5);

function stubYahoo(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    // Passthrough: las llamadas al server local del test NO se mockean
    if (url.startsWith("http://127.0.0.1")) return original(input, init);
    return handler(url, init);
  }) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function stubChartOk(symbol = "NVDA"): () => void {
  return stubYahoo((url, init) => {
    if (url.startsWith("https://fc.yahoo.com")) {
      return new Response("Will be right back", {
        status: 404,
        headers: { "set-cookie": A3_COOKIE },
      });
    }
    if (url.includes("/v1/test/getcrumb")) {
      return new Response("crumb-test", { status: 200 });
    }
    if (url.includes(`/v8/finance/chart/${symbol}`)) {
      return Response.json(chartJson(BULLISH_CLOSES));
    }
    if (url.includes("quoteSummary")) {
      return Response.json(fundamentalsJson());
    }
    return new Response("not stubbed", { status: 500 });
  });
}

async function withApp(fn: (baseUrl: string, token: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/analysis", analysisRouter);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const token = signAccessToken("u-route-test", "route@test.local");
    await fn(`http://127.0.0.1:${port}/api/analysis`, token);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("ruta 200: analysis completo con señal, técnicos y fundamentales", async () => {
  const restore = stubChartOk();
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/NVDA`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { analysis: Record<string, unknown> };
      const a = body.analysis;
      assert.equal(a.status, "ok");
      assert.equal(a.symbol, "NVDA");
      assert.equal(a.tickerYahoo, "NVDA");
      assert.equal(a.price, BULLISH_CLOSES[BULLISH_CLOSES.length - 1]);
      assert.equal(typeof a.changePct, "number");
      assert.equal(a.currency, "USD");
      assert.deepEqual(a.range52w, { low: 50, high: 150 });
      assert.equal(typeof a.isMarketClosed, "boolean");
      assert.equal(a.cached, false);

      const t = a.technicals as Record<string, unknown>;
      assert.ok(t);
      assert.equal(typeof t.rsi, "number");
      assert.equal(typeof t.sma20, "number");
      assert.equal(typeof t.sma50, "number");
      assert.equal(typeof t.sma200, "number");
      assert.ok(t.macd && typeof (t.macd as Record<string, unknown>).histogram === "number");
      assert.equal(typeof t.volumeRatio, "number");
      assert.equal(typeof t.position52w, "number");

      const f = a.fundamentals as Record<string, unknown>;
      assert.ok(f);
      assert.equal(f.pe, 34.5);
      assert.equal(f.eps, 6.5);
      assert.equal(f.beta, 2.2);
      assert.equal(f.margin, 0.63);
      assert.equal(f.marketCap, 5_450_000_000_000);

      const s = a.signal as { verdict: string; score: number; breakdown: unknown[] } | null;
      assert.ok(s);
      assert.equal(s.verdict, "bullish"); // serie monotónica creciente
      assert.ok(s.score >= 60);
      assert.ok(s.breakdown.length >= 3);
      assert.ok(s.breakdown.every((f) => typeof (f as { score: number }).score === "number"));

      const series = a.series as { date: string; close: number }[];
      assert.equal(series.length, 220);
      assert.match(series[0].date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(series[219].close, BULLISH_CLOSES[219]);

      assert.equal(typeof a.summary, "string");
      assert.ok(a.summary.length > 20);
    });
  } finally {
    restore();
    resetMarketCache();
  }
});

test("ruta 404: símbolo inexistente (chart.error de Yahoo)", async () => {
  const restore = stubYahoo((url) => {
    if (url.includes("/v8/finance/chart/ZZZZNOPE")) {
      return Response.json(chartJson([], { error: true }));
    }
    return new Response("not stubbed", { status: 500 });
  });
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ZZZZNOPE`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 404);
      const body = (await res.json()) as { error: string; analysis: { status: string } };
      assert.match(body.error, /no encontrado/);
      assert.equal(body.analysis.status, "symbol_not_found");
    });
  } finally {
    restore();
    resetMarketCache();
  }
});

test("ruta 400: market inválido (zod rechaza antes de tocar Yahoo)", async () => {
  const restore = stubChartOk();
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/NVDA?market=bonds`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.ok(body.error.length > 0);
    });
  } finally {
    restore();
    resetMarketCache();
  }
});

test("ruta 400: symbol > 10 chars", async () => {
  const restore = stubChartOk();
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ABCDEFGHIJK`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
    });
  } finally {
    restore();
    resetMarketCache();
  }
});

test("ruta 429: rate limit de Yahoo → 429 con mensaje claro", async () => {
  const restore = stubYahoo(() => new Response("{}", { status: 429 }));
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/NVDA`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 429);
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /Límite de consultas/);
    });
  } finally {
    restore();
    resetMarketCache();
  }
});

test("ruta 502: Yahoo caído → degradado", async () => {
  const restore = stubYahoo(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/NVDA`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 502);
      const body = (await res.json()) as { error: string };
      assert.match(body.error, /no responde/);
    });
  } finally {
    restore();
    resetMarketCache();
  }
});

test("ruta 401: sin token", async () => {
  const restore = stubChartOk();
  try {
    await withApp(async (base) => {
      const res = await fetch(`${base}/NVDA`);
      assert.equal(res.status, 401);
    });
  } finally {
    restore();
    resetMarketCache();
  }
});
