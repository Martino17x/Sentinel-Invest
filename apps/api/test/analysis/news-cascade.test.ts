import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getNews,
  fetchNewsFeed,
  resetNewsCache,
  mapGNewsItem,
  mapFinnhubItem,
  dedupeByUrl,
  shouldUseFinnhub,
  buildGNewsSearchUrl,
  buildGNewsTopHeadlinesUrl,
  buildGNewsUrl,
  fetchGNews,
  fetchFinnhub,
} from "../../src/services/analysis/news.js";

// ---- helpers ----

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function gnewsPayload(articles: object[]): object {
  return { totalArticles: articles.length, articles };
}
function gnewsArticle(over: Record<string, unknown> = {}): object {
  return {
    title: "Galicia reporta ganancias record Q2",
    description: "GGAL presento balance trimestral con suba 20% interanual",
    content: "Contenido completo del articulo con detalles del balance y proyecciones...",
    url: "https://example.com/ggal-q2-2025",
    image: "https://example.com/images/ggal.jpg",
    publishedAt: "2025-08-19T10:00:00Z",
    source: { name: "Infobae", url: "https://infobae.com" },
    ...over,
  };
}
function finnhubPayload(items: object[]): object {
  return items; // finnhub returns array directly
}
function finnhubItem(over: Record<string, unknown> = {}): object {
  return {
    headline: "Apple unveils new iPhone with AI features",
    summary: "Apple announced...",
    url: "https://finnhub.io/news/aapl-1",
    id: 12345,
    source: "Finnhub",
    image: "https://finnhub.io/img/aapl.jpg",
    datetime: 1724064000,
    ...over,
  };
}
function tvPayload(items: object[]): object {
  return { items };
}
function tvItem(over: Record<string, unknown> = {}): object {
  return {
    id: "BCBA:GGAL/tv-1",
    title: "GGAL sube 3% en BCBA",
    source: "TradingView",
    published: 1724064000,
    link: "https://tradingview.com/news/ggal",
    relatedSymbols: [{ symbol: "BCBA:GGAL" }],
    ...over,
  };
}

// preserve env
const origEnv = { ...process.env };

beforeEach(() => {
  resetNewsCache();
  process.env.GNEWS_API_KEY = "test-gnews-key";
  process.env.FINNHUB_API_KEY = "test-finnhub-key";
  process.env.NEWS_PROVIDER = "gnews";
});

afterEach(() => {
  resetNewsCache();
  process.env.GNEWS_API_KEY = origEnv.GNEWS_API_KEY;
  process.env.FINNHUB_API_KEY = origEnv.FINNHUB_API_KEY;
  process.env.NEWS_PROVIDER = origEnv.NEWS_PROVIDER;
  // restore any other mutations
  for (const k of Object.keys(process.env)) {
    if (!(k in origEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(origEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ============================================================
// 5.1 cascade tests
// ============================================================

test("5.1 GNews primary ok → provider gnews degraded false + image/description", async () => {
  const urls: string[] = [];
  const restore = stubFetch((url) => {
    urls.push(url);
    if (url.includes("gnews.io/api/v4/search")) {
      assert.ok(url.includes("token=test-gnews-key"), "GNews token en query");
      assert.ok(url.includes("lang=es") && url.includes("country=ar"), "lang/country ar");
      assert.ok(url.includes("max=10"), "max=10");
      // q should contain GGAL + Grupo Financiero Galicia
      assert.ok(url.includes("GGAL"), "q debe contener GGAL");
      return Response.json(gnewsPayload([gnewsArticle()]));
    }
    if (url.includes("finnhub.io")) assert.fail("Finnhub no debe ser llamado cuando GNews ok");
    if (url.includes("news-headlines.tradingview.com")) assert.fail("TV no debe ser llamado cuando GNews ok");
    return new Response("unexpected", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.source, "gnews");
    assert.ok(res.data);
    assert.equal(res.data!.source, "gnews");
    assert.equal(res.data!.degraded, false);
    assert.equal(res.data!.items.length, 1);
    const it = res.data!.items[0];
    assert.equal(it.provider, "gnews");
    assert.equal(it.degraded, false);
    assert.ok(it.image && it.imageUrl, "image/imageUrl presentes");
    assert.equal(it.image, it.imageUrl);
    assert.ok(it.description, "description presente");
    assert.equal(it.summary, it.description, "alias summary === description");
    assert.ok(it.content, "content presente");
    assert.ok(it.url.includes("example.com"));
  } finally {
    restore();
  }
});

test("5.1 GNews empty → Finnhub ok (CEDEAR AAPL isCedear true)", async () => {
  const hits: string[] = [];
  const restore = stubFetch((url, init) => {
    hits.push(url);
    if (url.includes("gnews.io/api/v4/search")) {
      return Response.json(gnewsPayload([])); // empty
    }
    if (url.includes("finnhub.io/api/v1/company-news")) {
      assert.ok(url.includes("symbol=AAPL"), "finnhub symbol=AAPL");
      // check header X-Finnhub-Token
      const h = (init?.headers ?? {}) as Record<string, string>;
      assert.equal(h["X-Finnhub-Token"], "test-finnhub-key", "X-Finnhub-Token header");
      return Response.json(finnhubPayload([finnhubItem()]));
    }
    if (url.includes("news-headlines.tradingview.com")) assert.fail("TV no debe llamarse si Finnhub ok");
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("AAPL"); // sin market → CEDEAR → NASDAQ:AAPL → isCedear true
    assert.equal(res.status, "ok");
    assert.equal(res.source, "finnhub");
    assert.equal(res.data!.source, "finnhub");
    assert.equal(res.data!.degraded, false);
    assert.equal(res.data!.items[0].provider, "finnhub");
    assert.ok(res.data!.items[0].image, "finnhub image");
    assert.equal(res.data!.items[0].degraded, false);
  } finally {
    restore();
  }
});

test("5.1 GNews 429 degraded fallback → TV degraded true (no 500)", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io/api/v4/search")) {
      return new Response(JSON.stringify({ message: "quotaExceeded" }), { status: 429 });
    }
    if (url.includes("finnhub.io")) {
      // GGAL bcba puro skips finnhub even if gnews 429
      assert.fail("Finnhub debe ser skip para BCBA puro GGAL");
    }
    if (url.includes("news-headlines.tradingview.com")) {
      return Response.json(tvPayload([tvItem()]));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "ok", "429 GNews no debe dar 500 sino degraded ok");
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.degraded, true);
    assert.equal(res.data!.items[0].provider, "tradingview");
    assert.equal(res.data!.items[0].degraded, true);
    assert.equal(res.data!.items[0].image, null);
    assert.equal(res.data!.items[0].imageUrl, null);
  } finally {
    restore();
  }
});

test("5.1 GNews 403 quota → degraded fallback TV (treated like 429)", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) return new Response("forbidden", { status: 403 });
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem({ id: "tv-403" })]));
    if (url.includes("finnhub.io")) assert.fail("Finnhub skip para GGAL bcba");
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.degraded, true);
  } finally {
    restore();
  }
});

test("5.1 Finnhub skip for BCBA pure (GGAL bcba) → TV directo sin llamar Finnhub", async () => {
  let finnhubCalled = false;
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) return Response.json(gnewsPayload([])); // empty
    if (url.includes("finnhub.io")) {
      finnhubCalled = true;
      return Response.json([]);
    }
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem()]));
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(finnhubCalled, false, "Finnhub must NOT be called for BCBA pure GGAL");
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.degraded, true);
    // gate helper direct
    assert.equal(shouldUseFinnhub("bcba", false), false, "shouldUseFinnhub(bcba,false)=false");
    assert.equal(shouldUseFinnhub("bcba", true), true, "CEDEAR true forces finnhub even in bcba");
    assert.equal(shouldUseFinnhub("nasdaq", false), true, "nasdaq market forces finnhub");
    assert.equal(shouldUseFinnhub(undefined, false), false, "undefined market non-cedear skip");
  } finally {
    restore();
  }
});

test("5.1 NEWS_PROVIDER flag = tradingview forces TV only (no GNews/Finnhub fetch)", async () => {
  process.env.NEWS_PROVIDER = "tradingview";
  let gnewsHit = false;
  let finnhubHit = false;
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) {
      gnewsHit = true;
      return Response.json(gnewsPayload([gnewsArticle()]));
    }
    if (url.includes("finnhub.io")) {
      finnhubHit = true;
      return Response.json([]);
    }
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem({ id: "tv-flag" })]));
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(gnewsHit, false, "GNews must not be hit when NEWS_PROVIDER=tradingview");
    assert.equal(finnhubHit, false, "Finnhub must not be hit when tradingview forced");
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.degraded, true);
  } finally {
    restore();
  }
});

test("5.1 NEWS_PROVIDER=finnhub skips GNews and tries Finnhub first (CEDEAR)", async () => {
  process.env.NEWS_PROVIDER = "finnhub";
  let gnewsHit = false;
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) {
      gnewsHit = true;
      return Response.json(gnewsPayload([gnewsArticle()]));
    }
    if (url.includes("finnhub.io")) return Response.json(finnhubPayload([finnhubItem()]));
    if (url.includes("news-headlines.tradingview.com")) assert.fail("TV no debe si Finnhub ok");
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("AAPL");
    assert.equal(gnewsHit, false, "GNews skip when flag=finnhub");
    assert.equal(res.source, "finnhub");
  } finally {
    restore();
  }
});

test("5.1 NEWS_PROVIDER=finnhub + BCBA pure → Finnhub gate still skips → TV", async () => {
  process.env.NEWS_PROVIDER = "finnhub";
  let finnhubHit = false;
  const restore = stubFetch((url) => {
    if (url.includes("finnhub.io")) {
      finnhubHit = true;
      return Response.json([]);
    }
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem()]));
    if (url.includes("gnews.io")) assert.fail("GNews skip cuando flag=finnhub");
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(finnhubHit, false, "Finnhub gate blocks BCBA pure even when flag=finnhub");
    assert.equal(res.source, "tradingview");
  } finally {
    restore();
  }
});

test("5.1 mapGNewsItem alias summary===description + provider/degraded + null image handling", () => {
  const raw = {
    title: "Test Title",
    description: "desc foo",
    content: "full body",
    url: "https://example.com/1",
    image: null,
    source: { name: " Reuters " },
    publishedAt: "2025-01-01T00:00:00Z",
  } as unknown as Record<string, unknown>;
  const mapped = mapGNewsItem(raw, "BCBA:GGAL");
  assert.ok(mapped);
  assert.equal(mapped!.summary, "desc foo");
  assert.equal(mapped!.description, "desc foo");
  assert.equal(mapped!.summary, mapped!.description);
  assert.equal(mapped!.provider, "gnews");
  assert.equal(mapped!.degraded, false);
  assert.equal(mapped!.image, null);
  assert.equal(mapped!.imageUrl, null);
  // with image
  const raw2 = { ...raw, image: "https://cdn.example/img.jpg", url: "https://example.com/2" } as Record<string, unknown>;
  const m2 = mapGNewsItem(raw2, null);
  assert.equal(m2!.image, "https://cdn.example/img.jpg");
  assert.equal(m2!.imageUrl, "https://cdn.example/img.jpg");
});

test("5.1 mapFinnhubItem: headline→title, summary→description+content, provider finnhub, image mapping", () => {
  const raw = {
    headline: "Finnhub Headline",
    summary: "summary text",
    url: "https://finnhub.io/news/1",
    id: 999,
    source: "Finnhub",
    image: "https://finnhub.io/img.jpg",
    datetime: 1724064000,
  } as unknown as Record<string, unknown>;
  const m = mapFinnhubItem(raw, "NASDAQ:AAPL");
  assert.ok(m);
  assert.equal(m!.title, "Finnhub Headline");
  assert.equal(m!.description, "summary text");
  assert.equal(m!.content, "summary text");
  assert.equal(m!.provider, "finnhub");
  assert.equal(m!.degraded, false);
  assert.equal(m!.image, "https://finnhub.io/img.jpg");
  assert.equal(m!.imageUrl, "https://finnhub.io/img.jpg");
  assert.equal(m!.symbol, "NASDAQ:AAPL");
});

test("5.1 dedupeByUrl: removes duplicate urls case-insensitive", () => {
  const a = { id: "1", url: "https://example.com/a", title: "t", source: "s", publishedAt: null, symbol: null, summary: null, provider: "gnews" as const } as unknown as Parameters<typeof dedupeByUrl>[0][number];
  const b = { id: "2", url: "https://EXAMPLE.com/a", title: "t2", source: "s", publishedAt: null, symbol: null, summary: null, provider: "gnews" as const } as unknown as Parameters<typeof dedupeByUrl>[0][number];
  const c = { id: "3", url: "https://example.com/b", title: "t3", source: "s", publishedAt: null, symbol: null, summary: null, provider: "gnews" as const } as unknown as Parameters<typeof dedupeByUrl>[0][number];
  const out = dedupeByUrl([a, b, c]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "1");
  assert.equal(out[1].id, "3");
});

test("5.1 buildGNewsUrl helpers: search contains token+params, top-headlines limit clamp", () => {
  const search = buildGNewsSearchUrl("GGAL Grupo");
  assert.ok(search && search.includes("gnews.io/api/v4/search"), "search url");
  assert.ok(search.includes("token=test-gnews-key"));
  assert.ok(search.includes("lang=es"));
  const top5 = buildGNewsTopHeadlinesUrl(5);
  assert.ok(top5 && top5.includes("top-headlines"));
  assert.ok(top5.includes("max=5"));
  const topClamped = buildGNewsTopHeadlinesUrl(100);
  assert.ok(topClamped!.includes("max=20"), "clamp to 20");
  const unifiedSearch = buildGNewsUrl("query test");
  assert.ok(unifiedSearch!.includes("search"));
  const unifiedTop = buildGNewsUrl(10);
  assert.ok(unifiedTop!.includes("top-headlines"));
  const unifiedDefault = buildGNewsUrl();
  assert.ok(unifiedDefault!.includes("top-headlines") && unifiedDefault!.includes("max=20"));
  // missing key → null
  delete process.env.GNEWS_API_KEY;
  assert.equal(buildGNewsSearchUrl("x"), null);
  assert.equal(buildGNewsTopHeadlinesUrl(5), null);
  assert.equal(buildGNewsUrl("x"), null);
  process.env.GNEWS_API_KEY = "test-gnews-key";
});

test("5.1 fetchGNews/fetchFinnhub return null on missing key (no throw)", async () => {
  delete process.env.GNEWS_API_KEY;
  const r1 = await fetchGNews("GGAL");
  assert.equal(r1, null);
  process.env.GNEWS_API_KEY = "test-gnews-key";
  delete process.env.FINNHUB_API_KEY;
  const r2 = await fetchFinnhub("AAPL");
  assert.equal(r2, null);
  process.env.FINNHUB_API_KEY = "test-finnhub-key";
});

test("5.1 GNews empty + Finnhub empty (CEDEAR) → TV fallback degraded", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) return Response.json(gnewsPayload([]));
    if (url.includes("finnhub.io")) return Response.json([]);
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem({ id: "tv-final" })]));
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("AAPL");
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.degraded, true);
  } finally {
    restore();
  }
});
