import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runBacktest, getBacktest, fetchBacktest } from "../../src/services/analysis/backtest.js";
import { resetMarketCache } from "../../src/services/market/yahoo.js";

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function chartJson(symbol: string, closes: number[], startTs = 1700000000): object {
  const timestamps = closes.map((_, i) => startTs + i * 86400);
  const volumes = closes.map(() => 1000000);
  return {
    chart: {
      error: null,
      result: [
        {
          timestamp: timestamps,
          indicators: { quote: [{ close: closes, volume: volumes }] },
          meta: {
            regularMarketPrice: closes[closes.length - 1],
            currency: "ARS",
            shortName: symbol,
            longName: symbol,
          },
        },
      ],
    },
  };
}

function closesUp(n = 30, start = 100): number[] {
  const arr: number[] = [];
  for (let i = 0; i < n; i++) arr.push(start + i * 1.5 + Math.sin(i) * 0.5);
  return arr;
}

beforeEach(() => {
  resetMarketCache();
});
afterEach(() => {
  resetMarketCache();
});

test("ok: GGAL bcba 1y → status ok, series+metrics, cached false, source yahoo", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) {
      // GGAL.BA main, ^MERV benchmark
      if (url.includes(encodeURIComponent("^MERV")) || url.includes("%5EMERV")) {
        return Response.json(chartJson("^MERV", closesUp(30, 1000)));
      }
      assert.ok(url.includes("GGAL.BA"), `yahoo symbol GGAL.BA: ${url}`);
      assert.ok(url.includes("range=1y"), `range 1y: ${url}`);
      return Response.json(chartJson("GGAL.BA", closesUp(30, 100)));
    }
    return new Response("not found", { status: 404 });
  });
  try {
    const res = await runBacktest({ symbol: "GGAL", market: "bcba", range: "1y" });
    assert.equal(res.status, "ok");
    assert.equal(res.cached, false);
    assert.equal(res.source, "yahoo");
    assert.ok(res.data);
    assert.ok(Array.isArray(res.data!.series));
    assert.equal(res.data!.series.length, 30);
    assert.ok(res.data!.metrics);
    assert.equal(typeof res.data!.metrics.totalReturn, "number");
    assert.equal(typeof res.data!.metrics.annualizedReturn, "number");
    assert.equal(typeof res.data!.metrics.volatility, "number");
    assert.equal(typeof res.data!.metrics.maxDrawdown, "number");
    // sharpe may be null or number
    assert.ok(res.data!.metrics.sharpe === null || typeof res.data!.metrics.sharpe === "number");
    // benchmark should be present (default ^MERV degrade ok)
    assert.ok(res.data!.benchmark);
    assert.equal(res.data!.benchmark!.name, "^MERV");
    // legacy alias
    assert.equal((res.data as unknown as Record<string, unknown>).symbol, "GGAL");
    assert.equal((res.data as unknown as Record<string, unknown>).period, "1y");
  } finally {
    restore();
  }
});

test("ok: AAPL nasdaq 5y with custom benchmark SPY → tv NASDAQ:AAPL yahoo AAPL", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) {
      if (url.includes("SPY")) return Response.json(chartJson("SPY", closesUp(30, 400)));
      assert.ok(url.includes("AAPL") && !url.includes("AAPL.BA"), `AAPL pelado: ${url}`);
      assert.ok(url.includes("range=5y"));
      return Response.json(chartJson("AAPL", closesUp(30, 150)));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await runBacktest({ symbol: "AAPL", market: "nasdaq", range: "5y", benchmark: "SPY" });
    assert.equal(res.status, "ok");
    assert.ok(res.data!.benchmark);
    assert.equal(res.data!.benchmark!.name, "SPY");
  } finally {
    restore();
  }
});

test("benchmark failure degrade: main ok sin benchmark cuando benchmark 500", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) {
      if (url.includes(encodeURIComponent("^MERV")) || url.includes("%5EMERV")) {
        return new Response("server error", { status: 500 });
      }
      return Response.json(chartJson("GGAL.BA", closesUp(20, 100)));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await runBacktest({ symbol: "GGAL", market: "bcba" });
    assert.equal(res.status, "ok");
    assert.ok(res.data);
    assert.equal(res.data!.benchmark, undefined);
    assert.equal((res.data as unknown as Record<string, unknown>).benchmarkComparison, undefined);
  } finally {
    restore();
  }
});

test("benchmark null → sin benchmark y ok", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) {
      return Response.json(chartJson("GGAL.BA", closesUp(20, 100)));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await runBacktest({ symbol: "GGAL", market: "bcba", benchmark: null });
    assert.equal(res.status, "ok");
    assert.equal(res.data!.benchmark, undefined);
  } finally {
    restore();
  }
});

test("symbol_not_found: Yahoo 404 → status symbol_not_found data null", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) return new Response("not found", { status: 404 });
    return new Response("no", { status: 500 });
  });
  try {
    const res = await runBacktest({ symbol: "ZZZZ", market: "bcba" });
    assert.equal(res.status, "symbol_not_found");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "yahoo");
    assert.ok(res.error);
  } finally {
    restore();
  }
});

test("down: red caída → status down data null (nunca lanza)", async () => {
  const restore = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    const res = await runBacktest({ symbol: "GGAL", market: "bcba" });
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
  } finally {
    restore();
  }
});

test("rate_limited: Yahoo 429 → status rate_limited", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) return new Response("rate", { status: 429 });
    return new Response("no", { status: 500 });
  });
  try {
    const res = await runBacktest({ symbol: "GGAL", market: "bcba" });
    assert.equal(res.status, "rate_limited");
    assert.equal(res.data, null);
    assert.ok(res.error);
  } finally {
    restore();
  }
});

test("alias exports fetchBacktest/getBacktest existen y delegan", async () => {
  assert.equal(typeof fetchBacktest, "function");
  assert.equal(typeof getBacktest, "function");
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) {
      if (url.includes("%5EMERV") || url.includes("^MERV")) return Response.json(chartJson("^MERV", closesUp(10, 1000)));
      return Response.json(chartJson("GGAL.BA", closesUp(10, 100)));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const r1 = await fetchBacktest({ symbol: "GGAL", market: "bcba" });
    assert.equal(r1.status, "ok");
    const r2 = await getBacktest({ symbol: "GGAL", market: "bcba", benchmark: null });
    assert.equal(r2.status, "ok");
  } finally {
    restore();
  }
});

test("signal abort passthrough no rompe (timeout interno 8s)", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) return Response.json(chartJson("GGAL.BA", closesUp(10, 100)));
    return new Response("no", { status: 500 });
  });
  try {
    const controller = new AbortController();
    const res = await runBacktest({ symbol: "GGAL", market: "bcba", benchmark: null }, controller.signal);
    assert.equal(res.status, "ok");
  } finally {
    restore();
  }
});
