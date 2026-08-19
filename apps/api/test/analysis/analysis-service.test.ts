import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { AnalysisServiceImpl } from "../../src/services/analysis/analysis-service.js";
import { getAnalysisService, resetAnalysisServiceForTests } from "../../src/services/analysis/index.js";
import { resetMarketCache } from "../../src/services/market/yahoo.js";
import { resetFundamentalsCache } from "../../src/services/analysis/fundamentals.js";
import { resetConsensusCache } from "../../src/services/analysis/consensus.js";
import { resetNewsCache } from "../../src/services/analysis/news.js";
import { resetScreenerCache } from "../../src/services/analysis/screener.js";

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
          meta: { regularMarketPrice: closes[closes.length - 1], currency: "ARS", shortName: symbol },
        },
      ],
    },
  };
}

function tvConsensusD(): unknown[] {
  return [0.7, 120.5, 90, 150, 8, 4, 1, 13, 1768000000] as unknown[];
}
function tvConsensusOk(): object {
  return { totalCount: 1, data: [{ s: "BCBA:GGAL", d: tvConsensusD() }] };
}
function tvHeadlineItem(id = "BCBA:GGAL/abc-123"): object {
  return {
    id,
    title: "GGAL news",
    provider: "reuters",
    source: "Reuters",
    published: 1724064000,
    link: "https://example.com/news",
    relatedSymbols: [{ symbol: "BCBA:GGAL" }],
  };
}
function tvHeadlinesOk(items: object[] = [tvHeadlineItem()]): object {
  return { items };
}
function yahooQuoteSummaryOk(): object {
  return {
    quoteSummary: {
      result: [
        {
          price: {},
          defaultKeyStatistics: { trailingPE: { raw: 12.3 }, trailingEps: { raw: 4.5 }, beta: { raw: 1.1 } },
          financialData: { profitMargins: { raw: 0.2 }, totalRevenue: {} },
          summaryDetail: { dividendYield: { raw: 0.03 }, marketCap: { raw: 1000000 } },
        },
      ],
    },
  };
}

function allOkFetch(): (url: string) => Response {
  return (url: string) => {
    if (url.includes("fc.yahoo.com")) return new Response("", { status: 404, headers: { "set-cookie": "A3=dummy123; Path=/;" } });
    if (url.includes("getcrumb")) return new Response("crumb123", { status: 200 });
    if (url.includes("/v10/finance/quoteSummary/")) return Response.json(yahooQuoteSummaryOk());
    if (url.includes("scanner.tradingview.com/global/scan")) return Response.json(tvConsensusOk());
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvHeadlinesOk());
    if (url.includes("/v8/finance/chart/")) {
      if (url.includes("%5EMERV") || url.includes("^MERV")) return Response.json(chartJson("^MERV", [100, 101, 102, 103, 104]));
      if (url.includes("GGAL.BA")) return Response.json(chartJson("GGAL.BA", [100, 101, 102, 103, 104]));
      return Response.json(chartJson("UNKNOWN", [100, 101]));
    }
    if (url.includes("scanner.tradingview.com/argentina/scan") || url.includes("scanner.tradingview.com/america/scan")) {
      return Response.json({ totalCount: 1, data: [{ s: "BCBA:GGAL", d: ["BCBA:GGAL", "GGAL", 45.2, 1.5, 1000000, 5000000000, 12.3] }] });
    }
    return new Response("not mocked", { status: 500 });
  };
}

beforeEach(() => {
  resetMarketCache();
  resetFundamentalsCache();
  resetConsensusCache();
  resetNewsCache();
  resetScreenerCache();
  resetAnalysisServiceForTests();
});
afterEach(() => {
  resetMarketCache();
  resetFundamentalsCache();
  resetConsensusCache();
  resetNewsCache();
  resetScreenerCache();
  resetAnalysisServiceForTests();
});

test("factory getAnalysisService singleton wiring", async () => {
  const svc1 = getAnalysisService();
  const svc2 = getAnalysisService();
  assert.equal(svc1, svc2);
  assert.equal(typeof svc1.fundamentals, "function");
  assert.equal(typeof svc1.consensus, "function");
  assert.equal(typeof svc1.news, "function");
  assert.equal(typeof svc1.newsFeed, "function");
  assert.equal(typeof svc1.newsById, "function");
  assert.equal(typeof svc1.screener, "function");
  assert.equal(typeof svc1.backtest, "function");
  assert.equal(typeof svc1.runBacktest, "function");
  assert.equal(typeof svc1.insights, "function");
  assert.equal(typeof svc1.getInsights, "function");
});

test("insights ok: 3 ok → insights {fundamentals, consensus, news} all ok with envelope data T|null cached source", async () => {
  const restore = stubFetch(allOkFetch());
  try {
    const svc = new AnalysisServiceImpl();
    const res = await svc.insights("GGAL", { market: "bcba" });
    assert.equal(res.symbol, "GGAL");
    assert.equal(res.market, "bcba");
    assert.ok(res.generatedAt);
    assert.ok(res.insights.fundamentals.status === "ok");
    assert.ok(res.insights.consensus.status === "ok");
    assert.ok(res.insights.news.status === "ok");
    // envelope shape: data T|null, cached boolean, source string
    for (const block of [res.insights.fundamentals, res.insights.consensus, res.insights.news]) {
      assert.equal(typeof block.cached, "boolean");
      assert.equal(typeof block.source, "string");
      assert.notEqual(block.data, undefined);
      assert.equal(block.status, "ok");
    }
    assert.ok(res.insights.fundamentals.data);
    assert.ok(res.insights.consensus.data);
    assert.ok(res.insights.news.data);
  } finally {
    restore();
  }
});

test("insights partial: 1 ok 2 down → sigue 200-like, 1 ok y 2 error con data null", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("fc.yahoo.com")) return new Response("", { status: 404, headers: { "set-cookie": "A3=x;" } });
    if (url.includes("getcrumb")) return new Response("crumb", { status: 200 });
    if (url.includes("/v10/finance/quoteSummary/")) return Response.json(yahooQuoteSummaryOk()); // fundamentals ok
    if (url.includes("scanner.tradingview.com/global/scan")) return new Response("server error", { status: 500 }); // consensus down
    if (url.includes("news-headlines.tradingview.com")) return new Response("server error", { status: 500 }); // news down (will fallback to yahoo which also 500)
    if (url.includes("query1.finance.yahoo.com/v1/finance/search")) return new Response("server error", { status: 500 }); // yahoo news fallback fails → down
    return new Response("no", { status: 500 });
  });
  try {
    const svc = new AnalysisServiceImpl();
    const res = await svc.getInsights("GGAL", { market: "bcba" });
    assert.equal(res.insights.fundamentals.status, "ok");
    assert.notEqual(res.insights.fundamentals.data, null);
    assert.equal(res.insights.consensus.status, "error");
    assert.equal(res.insights.consensus.data, null);
    assert.equal(typeof res.insights.consensus.cached, "boolean");
    assert.equal(typeof res.insights.consensus.source, "string");
    assert.ok(res.insights.consensus.error);
    assert.equal(res.insights.news.status, "error");
    assert.equal(res.insights.news.data, null);
    assert.ok(res.insights.news.error);
  } finally {
    restore();
  }
});

test("insights 2of3 down (solo 1 ok → still 200-like insights con Promise.allSettled)", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      return Response.json(tvHeadlinesOk([tvHeadlineItem("BCBA:GGAL/ok-1")])); // only news ok
    }
    if (url.includes("fc.yahoo.com") || url.includes("getcrumb") || url.includes("/v10/finance/quoteSummary/")) {
      return new Response("down", { status: 500 }); // fundamentals down (crumb fails)
    }
    if (url.includes("scanner.tradingview.com/global/scan")) return new Response("down", { status: 500 }); // consensus down
    if (url.includes("query1.finance.yahoo.com/v1/finance/search")) return new Response("down", { status: 500 });
    return new Response("down", { status: 500 });
  });
  try {
    const svc = new AnalysisServiceImpl();
    const res = await svc.insights("GGAL", { market: "bcba" });
    // solo news ok → still returns insights object (no throw) — equivocado sería 502 solo si todos down, acá 1 ok → 200-like
    assert.equal(res.insights.news.status, "ok");
    assert.notEqual(res.insights.news.data, null);
    assert.equal(res.insights.fundamentals.status, "error");
    assert.equal(res.insights.fundamentals.data, null);
    assert.equal(res.insights.consensus.status, "error");
    assert.equal(res.insights.consensus.data, null);
    // verify all blocks have cached boolean + source string even en error
    for (const b of [res.insights.fundamentals, res.insights.consensus, res.insights.news]) {
      assert.equal(typeof b.cached, "boolean");
      assert.equal(typeof b.source, "string");
      assert.equal(b.data === null ? b.status : "ok", b.status); // data null → error
    }
  } finally {
    restore();
  }
});

test("insights Promise.allSettled survives throw/timeout en un provider sin romper otros", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) throw new Error("ECONNREFUSED"); // news throw
    if (url.includes("fc.yahoo.com")) return new Response("", { status: 404, headers: { "set-cookie": "A3=x;" } });
    if (url.includes("getcrumb")) return new Response("crumb", { status: 200 });
    if (url.includes("/v10/finance/quoteSummary/")) return Response.json(yahooQuoteSummaryOk());
    if (url.includes("scanner.tradingview.com/global/scan")) return Response.json(tvConsensusOk());
    if (url.includes("query1.finance.yahoo.com/v1/finance/search")) return Response.json({ news: [] });
    return new Response("no", { status: 500 });
  });
  try {
    const svc = new AnalysisServiceImpl();
    const res = await svc.insights("GGAL", { market: "bcba" });
    assert.equal(res.insights.fundamentals.status, "ok");
    assert.equal(res.insights.consensus.status, "ok");
    assert.equal(res.insights.news.status, "error");
    assert.equal(res.insights.news.data, null);
  } finally {
    restore();
  }
});

test("facade delegations: getNewsById, getScreener, runBacktest funcionan", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      return Response.json(tvHeadlinesOk([tvHeadlineItem("BCBA:GGAL/abc-123"), tvHeadlineItem("other/1")]));
    }
    if (url.includes("scanner.tradingview.com/argentina/scan")) {
      return Response.json({ totalCount: 1, data: [{ s: "BCBA:GGAL", d: ["BCBA:GGAL", "GGAL", 45.2, 1.5, 1000000, 5000000000, 12.3] }] });
    }
    if (url.includes("/v8/finance/chart/")) {
      if (url.includes("%5EMERV") || url.includes("^MERV")) return Response.json(chartJson("^MERV", [100, 101, 102]));
      return Response.json(chartJson("GGAL.BA", [100, 101, 102, 103]));
    }
    return new Response("not mocked", { status: 500 });
  });
  try {
    const svc = new AnalysisServiceImpl();
    // screener
    const scr = await svc.getScreener("bcba");
    assert.equal(scr.status, "ok");
    assert.ok(Array.isArray(scr.data));
    // newsById via facade (popula feed 20 primero)
    await svc.newsFeed(5); // populate
    const nid = await svc.getNewsById(encodeURIComponent("BCBA:GGAL/abc-123"));
    // may be ok if found in feed 5 cache
    assert.ok(nid.status === "ok" || nid.status === "symbol_not_found");
    // backtest delegation via runBacktest
    const bt = await svc.runBacktest({ symbol: "GGAL", market: "bcba", benchmark: null });
    assert.equal(bt.status, "ok");
    assert.ok(bt.data);
    // also backtest via alias backtest(symbol, opts)
    const bt2 = await svc.backtest("GGAL", { market: "bcba", benchmark: null });
    assert.equal(bt2.status, "ok");
  } finally {
    restore();
  }
});
