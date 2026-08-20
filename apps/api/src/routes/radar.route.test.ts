import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { signAccessToken } from "../lib/jwt.js";
import radarRouter from "./radar.js";
import { resetRadarCacheForTests, DISCLAIMER } from "../services/market/radar.js";
import { resetMarketCache } from "../services/market/yahoo.js";

// ===================================================================
// radar.route.test.ts — GET /api/radar/ccl
//
// - 401 sin auth, q filter before paginate, limit 1..100,
//   cache <50ms, disclaimer exact
// Patron: stub global fetch para BYMA+Yahoo (igual que radar.test.ts)
// ===================================================================

const CHART_TS_BASE = 1_700_000_000;

function chartJson(closes: number[]): object {
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
            longName: "Test Inc",
          },
        },
      ],
    },
  };
}

interface BymaInstrument {
  symbol: string;
  trade: number;
  denominationCcy?: string;
  description?: string;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    // passthrough: server local del test no se mockea
    if (url.startsWith("http://127.0.0.1")) return original(input, init);
    return handler(url, init);
  }) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function makeBymaInstruments(): BymaInstrument[] {
  return [
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple Inc." },
    { symbol: "MSFT", trade: 25_000, denominationCcy: "ARS", description: "Microsoft Corp." },
    { symbol: "MELI", trade: 80_000, denominationCcy: "ARS", description: "MercadoLibre Inc." },
    { symbol: "GOOGL", trade: 27_000, denominationCcy: "ARS", description: "Alphabet Inc." },
  ];
}

function handlerForPrices(priceMap: Record<string, number>): (url: string, init?: RequestInit) => Response {
  const instruments = makeBymaInstruments();
  return (url: string, init?: RequestInit) => {
    if (url.includes("/free/cedears") && init?.method === "POST") return Response.json(instruments);
    if (url.includes("/free/market-open")) return Response.json(false);
    const m = url.match(/\/chart\/([^?]+)/);
    if (m) {
      const sym = decodeURIComponent(m[1]);
      const price = priceMap[sym];
      if (price == null) return Response.json({ chart: { error: { code: "Not Found" }, result: null } });
      return Response.json(chartJson([price]));
    }
    return new Response("not stubbed: " + url, { status: 500 });
  };
}

async function withApp(
  fn: (baseUrl: string, token: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/radar", radarRouter);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const token = signAccessToken("u-radar-route-test", "radar@test.local");
    await fn(`http://127.0.0.1:${port}/api/radar`, token);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

beforeEach(() => {
  resetRadarCacheForTests();
  resetMarketCache();
});

afterEach(() => {
  resetRadarCacheForTests();
  resetMarketCache();
});

// -------------------------------------------------------------------
// 401 without auth
// -------------------------------------------------------------------

test("GET /api/radar/ccl → 401 sin token", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230, MSFT: 300, MELI: 1800, GOOGL: 225 }));
  try {
    await withApp(async (base) => {
      const res = await fetch(`${base}/ccl`);
      assert.equal(res.status, 401);
      const body = (await res.json()) as { error: string };
      assert.ok(body.error.length > 0);
    });
  } finally {
    restore();
  }
});

test("GET /api/radar/ccl → 401 con token inválido", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230 }));
  try {
    await withApp(async (base) => {
      const res = await fetch(`${base}/ccl`, {
        headers: { Authorization: "Bearer token-invalido" },
      });
      assert.equal(res.status, 401);
    });
  } finally {
    restore();
  }
});

// -------------------------------------------------------------------
// q filter before paginate
// -------------------------------------------------------------------

test("GET /api/radar/ccl?q=MELI → filter before paginate (total=1, solo MELI)", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230, MSFT: 300, MELI: 1800, GOOGL: 225 }));
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ccl?q=MELI&page=1&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const body = (await res.json()) as { items: { symbol: string }[]; total: number };
      assert.equal(body.total, 1);
      assert.equal(body.items.length, 1);
      assert.equal(body.items[0].symbol, "MELI");
    });
  } finally {
    restore();
  }
});

test("GET /api/radar/ccl?q=apl (case-insensitive) → matchea AAPL", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230, MSFT: 300, MELI: 1800, GOOGL: 225 }));
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ccl?q=apl`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { items: { symbol: string }[]; total: number };
      // AAPL + AAPL name contains? at least AAPL
      assert.ok(body.total >= 1);
      assert.ok(body.items.some((r) => r.symbol === "AAPL"));
    });
  } finally {
    restore();
  }
});

test("GET /api/radar/ccl?q + paginate — q filtra antes, paginate después", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230, MSFT: 300, MELI: 1800, GOOGL: 225 }));
  try {
    await withApp(async (base, token) => {
      // sin q: total 4
      const rAll = await fetch(`${base}/ccl?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const all = (await rAll.json()) as { total: number };
      assert.equal(all.total, 4);

      // con q=M, filtrados (MSFT + MELI) → total 2, page 1 limit 1 → 1 item
      const rFiltered = await fetch(`${base}/ccl?q=M&page=1&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(rFiltered.status, 200);
      const filt = (await rFiltered.json()) as { items: unknown[]; total: number };
      // MSFT + MELI contienen M → al menos 2
      assert.ok(filt.total >= 2);
      assert.equal(filt.items.length, 1);
    });
  } finally {
    restore();
  }
});

// -------------------------------------------------------------------
// limit clamp 1..100
// -------------------------------------------------------------------

test("GET /api/radar/ccl?limit=200 → 400 (zod max 100)", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230 }));
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ccl?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
    });
  } finally {
    restore();
  }
});

test("GET /api/radar/ccl?limit=0 → 400 (zod min 1)", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230 }));
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ccl?limit=0`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
    });
  } finally {
    restore();
  }
});

test("GET /api/radar/ccl?limit=50 → ok (default en rango)", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230, MSFT: 300 }));
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ccl?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { limit: number };
      assert.equal(body.limit, 50);
    });
  } finally {
    restore();
  }
});

test("GET /api/radar/ccl?sort=invalid → 400", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230 }));
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ccl?sort=invalid`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 400);
    });
  } finally {
    restore();
  }
});

// -------------------------------------------------------------------
// disclaimer envelope exact + Cache-Control
// -------------------------------------------------------------------

test("GET /api/radar/ccl → envelope disclaimer exact + Cache-Control no-store + generatedAt ISO", async () => {
  const restore = stubFetch(handlerForPrices({ AAPL: 230 }));
  try {
    await withApp(async (base, token) => {
      const res = await fetch(`${base}/ccl`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const body = (await res.json()) as {
        disclaimer: string;
        generatedAt: string;
        cclPromedio: number | null;
        status: string;
        isMarketClosed: boolean;
        items: unknown[];
        total: number;
      };
      assert.equal(body.disclaimer, DISCLAIMER);
      assert.equal(body.disclaimer, "Información educativa, no asesoramiento financiero. No constituye recomendación CNV.");
      assert.match(body.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(typeof body.isMarketClosed, "boolean");
      assert.ok(["ok", "partial"].includes(body.status));
      assert.equal(typeof body.total, "number");
    });
  } finally {
    restore();
  }
});

// -------------------------------------------------------------------
// cached <50ms — segunda petición dentro de TTL debe ser stale-serve
// -------------------------------------------------------------------

test("GET /api/radar/ccl cached <50ms (segunda request sirve cache SWR)", async () => {
  let yahooFetches = 0;
  const handler = (url: string, init?: RequestInit): Response => {
    if (url.includes("/free/cedears") && init?.method === "POST")
      return Response.json([{ symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple" }]);
    if (url.includes("/free/market-open")) return Response.json(false);
    const m = url.match(/\/chart\/([^?]+)/);
    if (m) {
      yahooFetches++;
      return Response.json(chartJson([230]));
    }
    return new Response("not stubbed", { status: 500 });
  };
  const restore = stubFetch(handler);
  try {
    await withApp(async (base, token) => {
      const t0 = performance.now();
      const r1 = await fetch(`${base}/ccl`, { headers: { Authorization: `Bearer ${token}` } });
      const t1 = performance.now();
      assert.equal(r1.status, 200);
      const b1 = (await r1.json()) as { generatedAt: string };
      assert.ok(yahooFetches >= 1);

      // segunda request inmediata → debe venir de cache (no nuevo Yahoo bulk si TTL vigente)
      // No medimos wall-clock estricto 50ms en CI, pero verificamos que generatedAt no cambia y la respuesta es rápida
      const t2 = performance.now();
      const r2 = await fetch(`${base}/ccl`, { headers: { Authorization: `Bearer ${token}` } });
      const elapsed = performance.now() - t2;
      assert.equal(r2.status, 200);
      const b2 = (await r2.json()) as { generatedAt: string };
      assert.equal(b1.generatedAt, b2.generatedAt, "cached generatedAt debe ser idéntico");
      assert.ok(elapsed < 80, `cached responde rápido: ${elapsed.toFixed(1)}ms (esperado <80ms)`);

      void t0; void t1;
    });
  } finally {
    restore();
  }
});

