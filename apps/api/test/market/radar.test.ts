import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getRadar, resetRadarCacheForTests, DISCLAIMER } from "../../src/services/market/radar.js";
import { resetMarketCache } from "../../src/services/market/yahoo.js";

// ===================================================================
// radar.test.ts — integración con BYMA + Yahoo mockeados
//
// Mock strategy: stub global fetch to intercept both BYMA (postPanel)
// and Yahoo chart requests. Reset Swr caches between tests.
// La ruta real del orquestador es:
//
//   BYMA POST .../free/cedears  → PanelQuote[] (symbol, trade, denominationCcy)
//   BYMA GET  .../free/market-open → boolean
//   Yahoo  GET .../v8/finance/chart/{symbol}?range=1d
//
// Use cases del spec:
// - allSettled ok / rate_limited / symbol_not_found
// - USD/C/D → ccl:null excluido de promedio
// - total vs filtered, sort spread, status partial
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

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: any, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

interface BymaInstrument {
  symbol: string;
  trade: number;
  denominationCcy?: string;
  description?: string;
  ticker?: string;
}

function bymaHandler(instruments: BymaInstrument[]): (url: string, init?: RequestInit) => Response {
  return (url: string, init?: RequestInit) => {
    // BYMA panel cedears
    if (url.includes("/free/cedears") && init?.method === "POST") {
      return Response.json(instruments);
    }
    if (url.includes("/free/market-open")) {
      return Response.json(true);
    }
    return new Response("not stubbed: " + url, { status: 500 });
  };
}

// Yahoo handler helpers
function yahooChartHandler(
  priceMap: Record<string, number>,
  fails: Record<string, { status: number; body?: object }> = {},
): (url: string) => Response {
  return (url: string) => {
    if (url.includes("/free/cedears") || url.includes("/free/market-open")) {
      // fallback — not here
      return new Response("unexpected", { status: 500 });
    }
    const m = url.match(/\/chart\/([^?]+)/);
    if (m) {
      const symbol = decodeURIComponent(m[1]);
      if (fails[symbol]) {
        const f = fails[symbol];
        if (f.status === 404) {
          return Response.json({ chart: { error: { code: "Not Found" }, result: null } });
        }
        return new Response(f.body ? JSON.stringify(f.body) : "{}", { status: f.status as number });
      }
      const price = priceMap[symbol];
      if (price == null) {
        return Response.json({ chart: { error: { code: "Not Found" }, result: null } });
      }
      return Response.json(chartJson([price]));
    }
    return new Response("not stubbed yahoo: " + url, { status: 500 });
  };
}

function combinedHandler(
  instruments: BymaInstrument[],
  priceMap: Record<string, number>,
  fails: Record<string, { status: number }> = {},
): (url: string, init?: RequestInit) => Response {
  return (url: string, init?: RequestInit) => {
    if (url.includes("/free/cedears") && init?.method === "POST") return Response.json(instruments);
    if (url.includes("/free/market-open")) return Response.json(false);
    const m = url.match(/\/chart\/([^?]+)/);
    if (m) {
      const sym = decodeURIComponent(m[1]);
      if (fails[sym]) {
        if (fails[sym].status === 404) return Response.json({ chart: { error: { code: "Not Found" }, result: null } });
        return new Response("{}", { status: fails[sym].status });
      }
      const price = priceMap[sym];
      if (price == null) return Response.json({ chart: { error: { code: "Not Found" }, result: null } });
      return Response.json(chartJson([price]));
    }
    return new Response("not stubbed: " + url, { status: 500 });
  };
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
// 1) All OK — mediana y spreads
// -------------------------------------------------------------------

test("radar: allSettled ok → promedio mediano, spreads, status ok", async () => {
  const instruments: BymaInstrument[] = [
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple Inc." },
    { symbol: "MSFT", trade: 25_000, denominationCcy: "ARS", description: "Microsoft Corp." },
  ];
  // AAPL 32100*10/230 ≈1395.65 ; MSFT 25000*10/300 ≈833.33
  const prices: Record<string, number> = { AAPL: 230, MSFT: 300 };

  const restore = stubFetch(combinedHandler(instruments, prices));
  try {
    const res = await getRadar({ page: 1, limit: 50, sort: "spread" });
    assert.equal(res.status, "ok");
    assert.equal(res.disclaimer, DISCLAIMER);
    assert.equal(res.items.length, 2);
    // promedio = mediana de [1395.65, 833.33] = (1395.65+833.33)/2 ≈1114.49
    assert.ok(res.cclPromedio !== null);
    const expectedAapl = (32_100 * 10) / 230;
    const expectedMsft = (25_000 * 10) / 300;
    const expectedPromedio = (expectedAapl + expectedMsft) / 2;
    assert.ok(Math.abs(res.cclPromedio! - expectedPromedio) < 0.01);
    // spreads: AAPL por encima, MSFT por debajo
    const aapl = res.items.find((r) => r.symbol === "AAPL")!;
    const msft = res.items.find((r) => r.symbol === "MSFT")!;
    assert.ok(aapl.spreadVsAvg! > 0);
    assert.ok(msft.spreadVsAvg! < 0);
    assert.ok(aapl.ccl !== null && msft.ccl !== null);
  } finally {
    restore();
  }
});

// -------------------------------------------------------------------
// 2) USD / C/D → ccl null excluido de promedio
// -------------------------------------------------------------------

test("radar: USD y sufijo C/D → ccl null, excluido de promedio", async () => {
  const instruments: BymaInstrument[] = [
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple Inc." },
    // USD / C-D variants para otra base (NVDA) — no deben interferir con AAPL (evita modo híbrido BYMA)
    { symbol: "NVDAC", trade: 33_000, denominationCcy: "USD", description: "NVIDIA C" },
    { symbol: "NVDAD", trade: 32_500, denominationCcy: "ARS", description: "NVIDIA D" },
    { symbol: "MSFT", trade: 25_000, denominationCcy: "USD", description: "Microsoft USD" },
  ];
  const prices: Record<string, number> = { AAPL: 230, MSFT: 300 };

  const restore = stubFetch(combinedHandler(instruments, prices));
  try {
    const res = await getRadar({ page: 1, limit: 50, sort: "symbol" });
    // Solo AAPL contribuye al promedio (único ARS válido con Yahoo ok) — NVDA/MSFT son USD y quedan excluidos
    assert.equal(res.cclPromedio, (32_100 * 10) / 230);
    const nvdaC = res.items.find((r) => r.symbol === "NVDAC")!;
    const nvdaD = res.items.find((r) => r.symbol === "NVDAD")!;
    const msft = res.items.find((r) => r.symbol === "MSFT")!;
    assert.equal(nvdaC.ccl, null);
    assert.equal(nvdaC.spreadVsAvg, null);
    assert.equal(nvdaC.currency, "USD");
    assert.equal(nvdaD.ccl, null);
    assert.equal(msft.ccl, null);
    assert.equal(nvdaC.status, "ok");
    // total incluye todas las filtradas por ratio (antes de paginar)
    assert.equal(res.total, 4);
  } finally {
    restore();
  }
});

// -------------------------------------------------------------------
// 3) allSettled con fallos: rate_limited y symbol_not_found → status partial
// -------------------------------------------------------------------

test("radar: Yahoo rate_limited y symbol_not_found → status partial, filas con ccl null y status mapped", async () => {
  const instruments: BymaInstrument[] = [
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple Inc." },
    { symbol: "MSFT", trade: 25_000, denominationCcy: "ARS", description: "Microsoft" },
    { symbol: "GOOGL", trade: 20_000, denominationCcy: "ARS", description: "Alphabet" },
  ];
  const prices: Record<string, number> = { AAPL: 230 };
  const fails: Record<string, { status: number }> = {
    MSFT: { status: 429 },
    GOOGL: { status: 404 },
  };

  const restore = stubFetch(combinedHandler(instruments, prices, fails));
  try {
    const res = await getRadar({ page: 1, limit: 50, sort: "spread" });
    assert.equal(res.status, "partial");
    // Solo AAPL tiene ccl válido → promedio = ccl de AAPL
    assert.ok(res.cclPromedio !== null);
    const aapl = res.items.find((r) => r.symbol === "AAPL")!;
    const msft = res.items.find((r) => r.symbol === "MSFT")!;
    const googl = res.items.find((r) => r.symbol === "GOOGL")!;
    assert.ok(aapl.ccl !== null);
    assert.equal(aapl.status, "ok");
    assert.equal(msft.ccl, null);
    assert.equal(msft.status, "rate_limited");
    assert.equal(googl.ccl, null);
    assert.equal(googl.status, "symbol_not_found");
  } finally {
    restore();
  }
});

// -------------------------------------------------------------------
// 4) total vs filtered + sort spread desc
// -------------------------------------------------------------------

test("radar: total vs filtered, sort spread desc (nulls al final)", async () => {
  // 3 ARS válidos con CCLs distintos para verificar orden por spread
  // AAPL 1395, MSFT 833, GOOGL 1200 → promedio ≈1142.66
  const instruments: BymaInstrument[] = [
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple Inc." }, // 1395
    { symbol: "MSFT", trade: 25_000, denominationCcy: "ARS", description: "Microsoft" }, // 833
    { symbol: "GOOGL", trade: 27_000, denominationCcy: "ARS", description: "Alphabet" }, // 1200 si subyacente 225
    { symbol: "TSLA", trade: 15_000, denominationCcy: "ARS", description: "Tesla Inc." }, // fail → null
  ];
  const prices: Record<string, number> = { AAPL: 230, MSFT: 300, GOOGL: 225 };
  const fails: Record<string, { status: number }> = { TSLA: { status: 429 } };

  const restore = stubFetch(combinedHandler(instruments, prices, fails));
  try {
    const res = await getRadar({ page: 1, limit: 50, sort: "spread" });
    assert.equal(res.total, 4);
    // orden spread desc: AAPL (+22%), GOOGL (+5%), MSFT (-27%), TSLA (null al final)
    assert.equal(res.items[0].symbol, "AAPL");
    assert.ok(res.items[0].spreadVsAvg! > res.items[1].spreadVsAvg!);
    assert.ok(res.items[1].spreadVsAvg! > res.items[2].spreadVsAvg!);
    assert.equal(res.items[3].symbol, "TSLA");
    assert.equal(res.items[3].ccl, null);
  } finally {
    restore();
  }
});

test("radar: filter lastPrice>0 y ratio existente descarta sin ratio y precio 0", async () => {
  const instruments: BymaInstrument[] = [
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple" },
    { symbol: "NOPRICE", trade: 0, denominationCcy: "ARS", description: "No price" },
    { symbol: "ZZZZFAKE", trade: 10_000, denominationCcy: "ARS", description: "Sin ratio en tabla" },
  ];
  const prices: Record<string, number> = { AAPL: 230 };

  const restore = stubFetch(combinedHandler(instruments, prices));
  try {
    const res = await getRadar({ page: 1, limit: 50, sort: "symbol" });
    assert.equal(res.total, 1);
    assert.equal(res.items[0].symbol, "AAPL");
  } finally {
    restore();
  }
});

test("radar: q filter before paginate — total refleja filtrado", async () => {
  const instruments: BymaInstrument[] = [
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple Inc." },
    { symbol: "MSFT", trade: 25_000, denominationCcy: "ARS", description: "Microsoft" },
    { symbol: "MELI", trade: 80_000, denominationCcy: "ARS", description: "MercadoLibre" },
  ];
  const prices: Record<string, number> = { AAPL: 230, MSFT: 300, MELI: 1800 };

  const restore = stubFetch(combinedHandler(instruments, prices));
  try {
    const res = await getRadar({ q: "MELI", page: 1, limit: 10, sort: "spread" });
    assert.equal(res.total, 1);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].symbol, "MELI");
  } finally {
    restore();
  }
});

test("radar: sort symbol alfabético", async () => {
  const instruments: BymaInstrument[] = [
    { symbol: "MSFT", trade: 25_000, denominationCcy: "ARS", description: "Microsoft" },
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple" },
  ];
  const prices: Record<string, number> = { AAPL: 230, MSFT: 300 };

  const restore = stubFetch(combinedHandler(instruments, prices));
  try {
    const res = await getRadar({ page: 1, limit: 50, sort: "symbol" });
    assert.equal(res.items[0].symbol, "AAPL");
    assert.equal(res.items[1].symbol, "MSFT");
  } finally {
    restore();
  }
});

test("radar: paginación slice correcto", async () => {
  const instruments: BymaInstrument[] = [
    { symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple" },
    { symbol: "MSFT", trade: 25_000, denominationCcy: "ARS", description: "Microsoft" },
    { symbol: "MELI", trade: 80_000, denominationCcy: "ARS", description: "MercadoLibre" },
  ];
  const prices: Record<string, number> = { AAPL: 230, MSFT: 300, MELI: 1800 };

  const restore = stubFetch(combinedHandler(instruments, prices));
  try {
    const p1 = await getRadar({ page: 1, limit: 2, sort: "symbol" });
    const p2 = await getRadar({ page: 2, limit: 2, sort: "symbol" });
    assert.equal(p1.items.length, 2);
    assert.equal(p2.items.length, 1);
    assert.equal(p1.total, 3);
    assert.equal(p2.total, 3);
    // no overlap
    const s1 = new Set(p1.items.map((r) => r.symbol));
    for (const r of p2.items) assert.ok(!s1.has(r.symbol));
  } finally {
    restore();
  }
});

test("radar: disclaimer envelope exact en respuesta base", async () => {
  const instruments: BymaInstrument[] = [{ symbol: "AAPL", trade: 32_100, denominationCcy: "ARS", description: "Apple" }];
  const prices: Record<string, number> = { AAPL: 230 };
  const restore = stubFetch(combinedHandler(instruments, prices));
  try {
    const res = await getRadar({ page: 1, limit: 50, sort: "spread" });
    assert.equal(res.disclaimer, "Información educativa, no asesoramiento financiero. No constituye recomendación CNV.");
    assert.match(res.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof res.isMarketClosed, "boolean");
  } finally {
    restore();
  }
});


