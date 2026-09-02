import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchChart,
  fetchFundamentals,
  resetMarketCache,
} from "../../src/services/market/yahoo.js";

// ============================================================
// Fixtures
// ============================================================

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
            longName: "Test Inc.",
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
            trailingPE: { raw: 15.2 },
            trailingEps: { raw: 4.5 },
            beta: { raw: 1.1 },
            returnOnEquity: { raw: 0.25 },
            debtToEquity: { raw: 0.4 },
            dividendYield: { raw: 0.01 },
            marketCap: { raw: 1_000_000_000_000 },
          },
          financialData: { profitMargins: { raw: 0.3 } },
          summaryDetail: {},
        },
      ],
    },
  };
}

function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response> | Response
): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

const A3_COOKIE = "A3=d=AQAB~test-cookie; Path=/; Domain=.yahoo.com";

function crumbChainHandler(opts: { quoteSummaryStatus?: number } = {}) {
  let crumbCalls = 0;
  return (url: string): Response => {
    if (url.startsWith("https://fc.yahoo.com")) {
      return new Response("Will be right back", {
        status: 404,
        headers: { "set-cookie": A3_COOKIE },
      });
    }
    if (url.includes("/v1/test/getcrumb")) {
      crumbCalls++;
      return new Response(crumbCalls === 1 ? "crumb-old" : "crumb-new", { status: 200 });
    }
    if (url.includes("quoteSummary")) {
      if (opts.quoteSummaryStatus === 401) {
        return new Response("Invalid Crumb", { status: 401 });
      }
      return Response.json(fundamentalsJson());
    }
    return new Response("not stubbed", { status: 500 });
  };
}

// ============================================================
// fetchChart — parseo y cache
// ============================================================

test("chart 200 → ok con closes, fechas locales y meta; envía User-Agent", async () => {
  const closes = [100, 102, 101, 105];
  let seenUa = "";
  const restore = stubFetch((url, init) => {
    seenUa = (init?.headers as Record<string, string> | undefined)?.["User-Agent"] ?? "";
    assert.ok(url.includes("/v8/finance/chart/NVDA"));
    return Response.json(chartJson(closes));
  });
  try {
    const result = await fetchChart("NVDA");
    assert.equal(result.status, "ok");
    assert.equal(result.cached, false);
    assert.equal(result.data?.closes.length, 4);
    assert.deepEqual(result.data?.closes, closes);
    assert.equal(result.data?.dates.length, 4);
    assert.match(result.data?.dates[0] ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(result.data?.meta.regularMarketPrice, 105);
    assert.equal(result.data?.meta.fiftyTwoWeekLow, 50);
    assert.equal(result.data?.meta.fiftyTwoWeekHigh, 150);
    assert.equal(result.data?.meta.currency, "USD");
    assert.equal(result.data?.meta.name, "Test Inc.");
    assert.match(seenUa, /Mozilla\/5\.0/);
  } finally {
    restore();
    resetMarketCache();
  }
});

test("cache fresco (15min) → cached:true sin tocar la red", async () => {
  let fetches = 0;
  const restore = stubFetch(() => {
    fetches++;
    return Response.json(chartJson([100, 101]));
  });
  try {
    await fetchChart("AAPL");
    const second = await fetchChart("AAPL");
    assert.equal(second.status, "ok");
    assert.equal(second.cached, true);
    assert.equal(fetches, 1);
  } finally {
    restore();
    resetMarketCache();
  }
});

test("SWR: cache vencida → sirve stale + 1 solo refetch en background (dedup)", async () => {
  let fetches = 0;
  const restore = stubFetch(() => {
    fetches++;
    return Response.json(chartJson([100, 101, 102]));
  });
  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow() + offset;
  try {
    const first = await fetchChart("AAPL");
    assert.equal(first.cached, false);
    assert.equal(fetches, 1);

    offset = 16 * 60_000; // +16 min → TTL (15min) vencido

    const [s1, s2] = await Promise.all([fetchChart("AAPL"), fetchChart("AAPL")]);
    assert.equal(s1.status, "ok");
    assert.equal(s1.stale, true);
    assert.equal(s2.stale, true);

    await new Promise((r) => setTimeout(r, 50)); // deja completar el refresh
    assert.equal(fetches, 2); // 1 fetch original + 1 refresh (los concurrentes se dedup)

    const third = await fetchChart("AAPL");
    assert.equal(third.cached, true);
    assert.equal(third.stale, undefined);
    assert.equal(fetches, 2); // el refresh ya actualizó la cache
  } finally {
    Date.now = realNow;
    restore();
    resetMarketCache();
  }
});

test("chart.error → symbol_not_found", async () => {
  const restore = stubFetch(() =>
    Response.json({ chart: { error: { code: "Not Found" }, result: null } })
  );
  try {
    const result = await fetchChart("ZZZZNOPE");
    assert.equal(result.status, "symbol_not_found");
  } finally {
    restore();
    resetMarketCache();
  }
});

test("429 → backoff 500ms×2 (3 intentos) → rate_limited", async () => {
  let fetches = 0;
  const restore = stubFetch(async () => {
    fetches++;
    return new Response("{}", { status: 429 });
  });
  try {
    const start = Date.now();
    const result = await fetchChart("NVDA");
    const elapsed = Date.now() - start;
    assert.equal(result.status, "rate_limited");
    assert.equal(fetches, 3);
    assert.ok(elapsed >= 950, `backoff insuficiente: ${elapsed}ms`);
    assert.ok(elapsed < 5_000, `backoff demasiado lento: ${elapsed}ms`);
  } finally {
    restore();
    resetMarketCache();
  }
});

test("red caída → down (nunca lanza)", async () => {
  const restore = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    const result = await fetchChart("NVDA");
    assert.equal(result.status, "down");
  } finally {
    restore();
    resetMarketCache();
  }
});

test("resetMarketCache → el próximo fetch vuelve a la red", async () => {
  let fetches = 0;
  const restore = stubFetch(() => {
    fetches++;
    return Response.json(chartJson([100]));
  });
  try {
    await fetchChart("NVDA");
    resetMarketCache();
    const result = await fetchChart("NVDA");
    assert.equal(result.cached, false);
    assert.equal(fetches, 2);
  } finally {
    restore();
    resetMarketCache();
  }
});

// ============================================================
// fetchFundamentals — crumb flow
// ============================================================

test("fundamentals OK: cookie A3 → getcrumb → quoteSummary parseado", async () => {
  const restore = stubFetch((url, init) => {
    if (url.startsWith("https://fc.yahoo.com")) {
      assert.equal(init?.headers?.["User-Agent"], "Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
      return new Response("Will be right back", {
        status: 404,
        headers: { "set-cookie": A3_COOKIE },
      });
    }
    if (url.includes("/v1/test/getcrumb")) {
      return new Response("crumb-123", { status: 200 });
    }
    if (url.includes("quoteSummary/NVDA")) {
      assert.ok(url.includes("crumb=crumb-123"), "el crumb debe viajar en la query");
      assert.ok((init?.headers as Record<string, string> | undefined)?.Cookie?.startsWith("A3="));
      return Response.json(fundamentalsJson());
    }
    return new Response("not stubbed", { status: 500 });
  });
  try {
    const fundamentals = await fetchFundamentals("NVDA");
    assert.ok(fundamentals);
    assert.equal(fundamentals.pe, 15.2);
    assert.equal(fundamentals.eps, 4.5);
    assert.equal(fundamentals.beta, 1.1);
    assert.equal(fundamentals.margin, 0.3);
    assert.equal(fundamentals.roe, 0.25);
    assert.equal(fundamentals.debtEquity, 0.4);
    assert.equal(fundamentals.dividendYield, 0.01);
    assert.equal(fundamentals.marketCap, 1_000_000_000_000);
  } finally {
    restore();
    resetMarketCache();
  }
});

test("fundamentals: 401 Invalid Crumb → 1 re-fetch con crumb nuevo → OK", async () => {
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) {
      return new Response("Will be right back", {
        status: 404,
        headers: { "set-cookie": A3_COOKIE },
      });
    }
    if (url.includes("/v1/test/getcrumb")) {
      return new Response("crumb-new", { status: 200 });
    }
    if (url.includes("quoteSummary")) {
      if (url.includes("crumb=crumb-old")) return new Response("Invalid Crumb", { status: 401 });
      assert.ok(url.includes("crumb=crumb-new"));
      return Response.json(fundamentalsJson());
    }
    return new Response("not stubbed", { status: 500 });
  });
  try {
    const fundamentals = await fetchFundamentals("NVDA");
    assert.ok(fundamentals);
    assert.equal(fundamentals.pe, 15.2);
  } finally {
    restore();
    resetMarketCache();
  }
});

test("fundamentals: 401 doble → null (degradación técnico-only)", async () => {
  const restore = stubFetch(crumbChainHandler({ quoteSummaryStatus: 401 }));
  try {
    const fundamentals = await fetchFundamentals("NVDA");
    assert.equal(fundamentals, null);
  } finally {
    restore();
    resetMarketCache();
  }
});

test("fundamentals: red caída → null (nunca lanza)", async () => {
  const restore = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    const fundamentals = await fetchFundamentals("NVDA");
    assert.equal(fundamentals, null);
  } finally {
    restore();
    resetMarketCache();
  }
});
