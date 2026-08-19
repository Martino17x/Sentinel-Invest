import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getFundamentals, fetchFundamentals, resetFundamentalsCache } from "../../src/services/analysis/fundamentals.js";
import { resetMarketCache } from "../../src/services/market/yahoo.js";

// ============================================================
// Helpers — stub global fetch como en cache.test.ts
// Yahoo fundamentals = fc.yahoo.com (cookie) + getcrumb + quoteSummary
// ============================================================

const A3_COOKIE = "A3=d=AQAB~test-cookie; Path=/; Domain=.yahoo.com";

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function fundamentalsJson(overrides: Record<string, unknown> = {}): object {
  return {
    quoteSummary: {
      result: [
        {
          defaultKeyStatistics: {
            trailingPE: { raw: 12.3 },
            forwardPE: { raw: 11.0 },
            trailingEps: { raw: 4.5 },
            beta: { raw: 1.1 },
            returnOnEquity: { raw: 0.3 },
            debtToEquity: { raw: 0.5 },
            ...((overrides.defaultKeyStatistics as object) ?? {}),
          },
          financialData: { profitMargins: { raw: 0.2 }, ...((overrides.financialData as object) ?? {}) },
          summaryDetail: {
            dividendYield: { raw: 0.03 },
            marketCap: { raw: 1_000_000 },
            trailingPE: { raw: 12.3 },
            ...((overrides.summaryDetail as object) ?? {}),
          },
          price: {},
          ...overrides,
        },
      ],
    },
  };
}

function yahooOkHandler(): (url: string) => Response {
  return (url: string) => {
    if (url.startsWith("https://fc.yahoo.com")) {
      return new Response("Will be right back", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    }
    if (url.includes("/v1/test/getcrumb")) return new Response("crumb-test", { status: 200 });
    if (url.includes("quoteSummary")) return Response.json(fundamentalsJson());
    return new Response("not stubbed", { status: 500 });
  };
}

beforeEach(() => {
  resetFundamentalsCache();
  resetMarketCache();
});

afterEach(() => {
  resetFundamentalsCache();
  resetMarketCache();
});

// ============================================================

test("ok: GGAL bcba → status ok, data con 8 campos, cached false, source yahoo", async () => {
  const restore = stubFetch(yahooOkHandler());
  try {
    const res = await getFundamentals("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.cached, false);
    assert.equal(res.source, "yahoo");
    assert.ok(res.data);
    assert.equal(res.data!.source, "yahoo");
    assert.equal(res.data!.pe, 12.3);
    assert.equal(res.data!.eps, 4.5);
    assert.equal(res.data!.beta, 1.1);
    assert.equal(res.data!.margin, 0.2);
    assert.equal(res.data!.roe, 0.3);
    assert.equal(res.data!.debtEquity, 0.5);
    assert.equal(res.data!.dividendYield, 0.03);
    assert.equal(res.data!.marketCap, 1_000_000);
    // data nunca undefined
    assert.notEqual(res.data, undefined);
  } finally {
    restore();
  }
});

test("alias fetchFundamentals export existe y delega a getFundamentals", async () => {
  const restore = stubFetch(yahooOkHandler());
  try {
    const res = await fetchFundamentals("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.ok(res.data);
    assert.equal(typeof fetchFundamentals, "function");
  } finally {
    restore();
  }
});

test("sin market: GGAL → resuelve .BA y ok (CEDEAR-unaware local)", async () => {
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) return new Response("x", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    if (url.includes("/v1/test/getcrumb")) return new Response("c", { status: 200 });
    if (url.includes("quoteSummary")) {
      assert.ok(url.includes("GGAL.BA"), `esperaba GGAL.BA en ${url}`);
      return Response.json(fundamentalsJson());
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getFundamentals("GGAL");
    assert.equal(res.status, "ok");
    assert.equal(res.source, "yahoo");
  } finally {
    restore();
  }
});

test("nyse AAPL → yahoo pelado AAPL", async () => {
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) return new Response("x", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    if (url.includes("/v1/test/getcrumb")) return new Response("c", { status: 200 });
    if (url.includes("quoteSummary")) {
      assert.ok(url.includes("/AAPL?") || url.includes("/AAPL&") || url.includes("quoteSummary/AAPL"), `esperaba AAPL pelado en ${url}`);
      assert.ok(!url.includes("AAPL.BA"), `no debe tener .BA: ${url}`);
      return Response.json(fundamentalsJson());
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getFundamentals("AAPL", "nyse");
    assert.equal(res.status, "ok");
  } finally {
    restore();
  }
});

test("AnalysisOpts object form {market, signal} → funciona igual", async () => {
  const restore = stubFetch(yahooOkHandler());
  try {
    const res = await getFundamentals("GGAL", { market: "bcba" });
    assert.equal(res.status, "ok");
  } finally {
    restore();
  }
});

test("Yahoo quoteSummary vacío (result null) → status down, data null, cached false, source yahoo", async () => {
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) return new Response("x", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    if (url.includes("/v1/test/getcrumb")) return new Response("c", { status: 200 });
    if (url.includes("quoteSummary")) return Response.json({ quoteSummary: { result: null } });
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getFundamentals("ZZZZ", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "yahoo");
    assert.ok(res.error);
    // data T|null nunca undefined
    assert.equal(res.data, null);
  } finally {
    restore();
  }
});

test("red caída / crumb fail → down data null (nunca lanza)", async () => {
  const restore = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    const res = await getFundamentals("GGAL", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "yahoo");
  } finally {
    restore();
  }
});

test("quoteSummary 500 → down data null", async () => {
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) return new Response("x", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    if (url.includes("/v1/test/getcrumb")) return new Response("c", { status: 200 });
    if (url.includes("quoteSummary")) return new Response("server error", { status: 500 });
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getFundamentals("GGAL", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
  } finally {
    restore();
  }
});

test("cache hit: 2ª llamada mismo símbolo dentro TTL 60min → cached true sin segundo fetch", async () => {
  let quoteSummaryCalls = 0;
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) return new Response("x", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    if (url.includes("/v1/test/getcrumb")) return new Response("c", { status: 200 });
    if (url.includes("quoteSummary")) {
      quoteSummaryCalls++;
      return Response.json(fundamentalsJson());
    }
    return new Response("no", { status: 500 });
  });
  try {
    const first = await getFundamentals("GGAL", "bcba");
    assert.equal(first.cached, false);
    assert.equal(first.status, "ok");
    const second = await getFundamentals("GGAL", "bcba");
    assert.equal(second.status, "ok");
    assert.equal(second.cached, true);
    assert.deepEqual(second.data, first.data);
    // quoteSummary solo 1 vez (segunda viene de cache)
    assert.equal(quoteSummaryCalls, 1);
  } finally {
    restore();
  }
});

test("cache key distingue yahoo symbol: GGAL.BA vs AAPL no colisionan", async () => {
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) return new Response("x", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    if (url.includes("/v1/test/getcrumb")) return new Response("c", { status: 200 });
    if (url.includes("quoteSummary")) {
      if (url.includes("GGAL.BA")) return Response.json(fundamentalsJson({ defaultKeyStatistics: { trailingPE: { raw: 12.3 } } }));
      if (url.includes("AAPL") && !url.includes("AAPL.BA")) {
        return Response.json(
          fundamentalsJson({ defaultKeyStatistics: { trailingPE: { raw: 99.9 }, trailingEps: { raw: 9.9 }, beta: { raw: 1.5 }, returnOnEquity: { raw: 0.5 }, debtToEquity: { raw: 0.2 } } })
        );
      }
      return Response.json(fundamentalsJson());
    }
    return new Response("no", { status: 500 });
  });
  try {
    const ggal = await getFundamentals("GGAL", "bcba");
    const aapl = await getFundamentals("AAPL", "nasdaq");
    assert.equal(ggal.data!.pe, 12.3);
    assert.equal(aapl.data!.pe, 99.9);
    // segunda llamada GGAL → cache hit con valor original
    const ggal2 = await getFundamentals("GGAL", "bcba");
    assert.equal(ggal2.cached, true);
    assert.equal(ggal2.data!.pe, 12.3);
  } finally {
    restore();
  }
});

test("campos null mapeados correctamente cuando Yahoo envía ausencia", async () => {
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) return new Response("x", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    if (url.includes("/v1/test/getcrumb")) return new Response("c", { status: 200 });
    if (url.includes("quoteSummary")) {
      return Response.json({
        quoteSummary: {
          result: [
            {
              defaultKeyStatistics: {},
              financialData: {},
              summaryDetail: {},
              price: {},
            },
          ],
        },
      });
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getFundamentals("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.data!.pe, null);
    assert.equal(res.data!.eps, null);
    assert.equal(res.data!.beta, null);
    assert.equal(res.data!.margin, null);
    assert.equal(res.data!.roe, null);
    assert.equal(res.data!.debtEquity, null);
    assert.equal(res.data!.dividendYield, null);
    assert.equal(res.data!.marketCap, null);
  } finally {
    restore();
  }
});
