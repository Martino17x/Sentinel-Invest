import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getNews, getNewsById, fetchNewsFeed, getNewsFeed, resetNewsCache } from "../../src/services/analysis/news.js";

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

// TV fixture helpers — shape mirrors NEWS_API.md (items with id containing ":" and "/")
function tvHeadlinesResponse(items: object[]): object {
  return { items };
}

function tvItem(overrides: Record<string, unknown> = {}): object {
  return {
    id: "BCBA:GGAL/abc-123",
    title: "GGAL reporta resultados record",
    provider: "reuters",
    source: "Reuters",
    published: 1724064000, // 2024-08-19
    link: "https://www.reuters.com/article/ggal-abc",
    relatedSymbols: [{ symbol: "BCBA:GGAL", logoid: "ggal" }],
    storyPath: "/news/BCBA:GGAL/abc-123/",
    ...overrides,
  };
}

function yahooNewsResponse(news: object[]): object {
  return { news };
}

function yahooItem(overrides: Record<string, unknown> = {}): object {
  return {
    uuid: "yahoo-uuid-1",
    title: "YPF sube tras balance",
    publisher: "Yahoo Finance",
    link: "https://finance.yahoo.com/news/ypf",
    providerPublishTime: 1724064000,
    ...overrides,
  };
}

beforeEach(() => {
  resetNewsCache();
});

afterEach(() => {
  resetNewsCache();
});

// ============================================================

test("ok: GGAL bcba → tradingview source, items ok, cached false", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      assert.ok(url.includes("symbol=BCBA%3AGGAL") || url.includes("symbol=BCBA:GGAL"), `tv url debe contener BCBA:GGAL: ${url}`);
      assert.ok(url.includes("client=web"), "client=web requerido");
      assert.ok(url.includes("lang=en"), "lang=en requerido");
      return Response.json(tvHeadlinesResponse([tvItem()]));
    }
    return new Response("not expected", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.data);
    assert.equal(res.data!.source, "tradingview");
    assert.equal(res.data!.items.length, 1);
    assert.equal(res.data!.items[0].id, "BCBA:GGAL/abc-123");
    assert.equal(res.data!.items[0].title, "GGAL reporta resultados record");
    assert.equal(res.data!.items[0].source, "Reuters");
    assert.equal(res.data!.items[0].symbol, "BCBA:GGAL");
    assert.ok(res.data!.items[0].publishedAt);
    assert.equal(res.data!.items[0].summary, null);
    assert.notEqual(res.data, undefined);
  } finally {
    restore();
  }
});

test("alias getNewsFeed existe y fetchNewsFeed degrade top 5", async () => {
  assert.equal(typeof fetchNewsFeed, "function");
  assert.equal(typeof getNewsFeed, "function");
  assert.equal(fetchNewsFeed, getNewsFeed);
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      // feed global sin symbol param
      assert.ok(!url.includes("symbol="), `feed global no debe tener symbol: ${url}`);
      const items = [tvItem({ id: "id-1", title: "Title 1" }), tvItem({ id: "id-2", title: "Title 2" }), tvItem({ id: "id-3", title: "Title 3" })];
      return Response.json(tvHeadlinesResponse(items));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const feed = await fetchNewsFeed(2);
    assert.equal(feed.length, 2);
    assert.equal(feed[0].id, "id-1");
    assert.equal(feed[1].id, "id-2");
  } finally {
    restore();
  }
});

test("fetchNewsFeed default 5 y limit clamp 20", async () => {
  let capturedUrl = "";
  const restore = stubFetch((url) => {
    capturedUrl = url;
    const items = Array.from({ length: 20 }, (_, i) => tvItem({ id: `id-${i}`, title: `T${i}` }));
    return Response.json(tvHeadlinesResponse(items));
  });
  try {
    const feed5 = await fetchNewsFeed();
    assert.equal(feed5.length, 5);
    // next call with 20 should fetch 20 (different cache key)
    resetNewsCache();
    const feed20 = await fetchNewsFeed(20);
    assert.equal(feed20.length, 20);
    void capturedUrl;
  } finally {
    restore();
  }
});

test("fallback Yahoo cuando TV vacío → source yahoo", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      return Response.json(tvHeadlinesResponse([])); // TV vacío
    }
    if (url.includes("query1.finance.yahoo.com/v1/finance/search")) {
      assert.ok(url.includes("GGAL.BA") || url.includes("GGAL"), `yahoo url debe contener GGAL: ${url}`);
      assert.ok(url.includes("newsCount=10"));
      return Response.json(yahooNewsResponse([yahooItem({ uuid: "y-1", title: "Yahoo title 1" })]));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.source, "yahoo");
    assert.equal(res.data!.source, "yahoo");
    assert.equal(res.data!.items.length, 1);
    assert.equal(res.data!.items[0].id, "y-1");
    assert.equal(res.data!.items[0].source, "Yahoo Finance");
  } finally {
    restore();
  }
});

test("down: TV 500 + Yahoo 500 → status down data null", async () => {
  const restore = stubFetch(() => new Response("server error", { status: 500 }));
  try {
    const res = await getNews("ZZZZ", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.error);
  } finally {
    restore();
  }
});

test("red caída (fetch lanza) → down data null (nunca lanza)", async () => {
  const restore = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
  } finally {
    restore();
  }
});

test("429 TV → rate_limited data null", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) return new Response("rate", { status: 429 });
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "rate_limited");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.error);
  } finally {
    restore();
  }
});

test("cache hit: 2ª llamada mismo tv símbolo dentro TTL 15min → cached true", async () => {
  let calls = 0;
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      calls++;
      return Response.json(tvHeadlinesResponse([tvItem()]));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const first = await getNews("GGAL", "bcba");
    assert.equal(first.cached, false);
    assert.equal(calls, 1);
    const second = await getNews("GGAL", "bcba");
    assert.equal(second.status, "ok");
    assert.equal(second.cached, true);
    assert.deepEqual(second.data, first.data);
    assert.equal(calls, 1, "segunda no debe hacer fetch");
  } finally {
    restore();
  }
});

test("cache hit feed: 2ª llamada fetchNewsFeed(5) → cached (no segundo fetch)", async () => {
  let calls = 0;
  const restore = stubFetch(() => {
    calls++;
    return Response.json(tvHeadlinesResponse([tvItem({ id: "f1" }), tvItem({ id: "f2" })]));
  });
  try {
    const a = await fetchNewsFeed(5);
    assert.equal(calls, 1);
    const b = await fetchNewsFeed(5);
    assert.deepEqual(b, a);
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

test("AnalysisOpts object form {market, signal} → funciona", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      assert.ok(url.includes("BCBA%3AGGAL") || url.includes("BCBA:GGAL"));
      return Response.json(tvHeadlinesResponse([tvItem()]));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", { market: "bcba" });
    assert.equal(res.status, "ok");
  } finally {
    restore();
  }
});

test("sin market: GGAL→BCBA:GGAL, AAPL CEDEAR→NASDAQ:AAPL", async () => {
  const seen: string[] = [];
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      const u = new URL(url);
      seen.push(u.searchParams.get("symbol") ?? "");
      return Response.json(tvHeadlinesResponse([tvItem({ id: `id-${seen.length}` })]));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const r1 = await getNews("GGAL");
    assert.equal(r1.status, "ok");
    assert.equal(seen[0], "BCBA:GGAL");
    const r2 = await getNews("AAPL");
    assert.equal(r2.status, "ok");
    assert.equal(seen[1], "NASDAQ:AAPL");
  } finally {
    restore();
  }
});

// getNewsById tests

test("getNewsById: encuentra id con '/' encoded → ok", async () => {
  const targetId = "BCBA:GGAL/abc-123";
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) {
      return Response.json(tvHeadlinesResponse([tvItem({ id: targetId }), tvItem({ id: "other/1" })]));
    }
    return new Response("no", { status: 500 });
  });
  try {
    // primero poblar feed 20
    await fetchNewsFeed(20);
    // buscar con encoded slash
    const encoded = encodeURIComponent(targetId); // BCBA%3AGGAL%2Fabc-123
    const res = await getNewsById(encoded);
    assert.equal(res.status, "ok");
    assert.ok(res.data);
    assert.equal(res.data!.id, targetId);
    assert.equal(res.data!.title, "GGAL reporta resultados record");
    // también con id sin encode debe funcionar
    const res2 = await getNewsById(targetId);
    assert.equal(res2.status, "ok");
    assert.equal(res2.data!.id, targetId);
  } finally {
    restore();
  }
});

test("getNewsById: encoded slash BCBA%3AGGAL%2Fabc-123 → decodifica y encuentra", async () => {
  const targetId = "BCBA:GGAL/abc-123";
  const restore = stubFetch(() => Response.json(tvHeadlinesResponse([tvItem({ id: targetId })])));
  try {
    const encoded = "BCBA%3AGGAL%2Fabc-123";
    const res = await getNewsById(encoded);
    assert.equal(res.status, "ok");
    assert.equal(res.data!.id, targetId);
  } finally {
    restore();
  }
});

test("getNewsById: inexistente → symbol_not_found data null", async () => {
  const restore = stubFetch(() => Response.json(tvHeadlinesResponse([tvItem({ id: "exists-1" })])));
  try {
    const res = await getNewsById("no-existe/xyz");
    assert.equal(res.status, "symbol_not_found");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.error);
  } finally {
    restore();
  }
});

test("getNewsById: busca en feed cacheado 5|10|20 sin refetch extra si está en cache 5", async () => {
  const targetId = "cached-id-5";
  const restore = stubFetch(() => Response.json(tvHeadlinesResponse([tvItem({ id: targetId })])));
  let calls = 0;
  const originalFetch = globalThis.fetch;
  // we track via stub already; just ensure feed 5 populated then getNewsById finds it without new fetch for 20 if already in 5
  try {
    await fetchNewsFeed(5);
    // now stub to count if fetch called again for getNewsById — it will need 20 if not in 5? but our target is in 5, so should be found before refetch 20
    // Our implementation searches caches 5|10|20 before refetching 20, so second call should not fetch if found in 5
    let fetchCalls = 0;
    const prev = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls++;
      return (prev as typeof fetch)(input, init);
    }) as typeof fetch;
    const res = await getNewsById(targetId);
    assert.equal(res.status, "ok");
    // fetchCalls should be 0 because found in cache 5
    assert.equal(fetchCalls, 0);
    globalThis.fetch = prev;
    void calls;
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});
