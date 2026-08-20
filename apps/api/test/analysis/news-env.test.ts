import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getNews, fetchNewsFeed, resetNewsCache } from "../../src/services/analysis/news.js";

function stubFetch(handler: (url: string) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function tvPayload(items: object[]): object {
  return { items };
}
function tvItem(over: Record<string, unknown> = {}): object {
  return {
    id: "BCBA:GGAL/tv-env-1",
    title: "Env fallback TV title",
    source: "TradingView",
    published: 1724064000,
    link: "https://tv.com/env",
    relatedSymbols: [{ symbol: "BCBA:GGAL" }],
    ...over,
  };
}
function gnewsPayload(articles: object[]): object {
  return { totalArticles: articles.length, articles };
}

const origEnv = { ...process.env };

beforeEach(() => {
  resetNewsCache();
});

afterEach(() => {
  resetNewsCache();
  for (const k of Object.keys(process.env)) if (!(k in origEnv)) delete process.env[k];
  for (const [k, v] of Object.entries(origEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ============================================================
// 5.3 error/env tests
// ============================================================

test("5.3 no keys → GET /news/:symbol 200 degraded:true source tradingview no 500 + no throw", async () => {
  delete process.env.GNEWS_API_KEY;
  delete process.env.FINNHUB_API_KEY;
  process.env.NEWS_PROVIDER = "gnews";
  let gnewsHit = false;
  let finnhubHit = false;
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) {
      gnewsHit = true;
      return Response.json(gnewsPayload([]));
    }
    if (url.includes("finnhub.io")) {
      finnhubHit = true;
      return Response.json([]);
    }
    if (url.includes("news-headlines.tradingview.com")) {
      return Response.json(tvPayload([tvItem()]));
    }
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(gnewsHit, false, "no GNews fetch when key missing");
    assert.equal(finnhubHit, false, "no Finnhub fetch when key missing");
    assert.equal(res.status, "ok", "must be 200 ok not 500");
    assert.notEqual(res.status, "down");
    assert.ok(res.data);
    assert.equal(res.data!.source, "tradingview");
    assert.equal(res.data!.degraded, true);
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.items[0].provider, "tradingview");
    assert.equal(res.data!.items[0].degraded, true);
    assert.equal(res.data!.items[0].image, null);
  } finally {
    restore();
  }
});

test("5.3 no keys feed → degraded TV feed no 500", async () => {
  delete process.env.GNEWS_API_KEY;
  delete process.env.FINNHUB_API_KEY;
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) assert.fail("GNews must not be called without key");
    if (url.includes("finnhub.io")) assert.fail("Finnhub must not be called without key");
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem({ id: "feed-tv-1" }), tvItem({ id: "feed-tv-2" })]));
    return new Response("no", { status: 500 });
  });
  try {
    const feed = await fetchNewsFeed(5);
    assert.equal(feed.length, 2);
    assert.equal(feed[0].provider, "tradingview");
    assert.equal((feed[0] as unknown as { degraded: boolean }).degraded, true);
  } finally {
    restore();
  }
});

test("5.3 GNews 429 quota_exceeded → degraded 200 not 500 (with keys set)", async () => {
  process.env.GNEWS_API_KEY = "test-gnews-key";
  process.env.FINNHUB_API_KEY = "test-finnhub-key";
  process.env.NEWS_PROVIDER = "gnews";
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) {
      return new Response(JSON.stringify({ errors: ["quotaExceeded"] }), { status: 429 });
    }
    if (url.includes("finnhub.io")) {
      // GGAL bcba skip finnhub
      return Response.json([]);
    }
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem()]));
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "ok", "quota 429 must map to degraded 200 not 500/rate_limited");
    assert.notEqual(res.status, "down");
    assert.notEqual(res.status, "rate_limited");
    assert.equal(res.data!.degraded, true);
    assert.equal(res.data!.source, "tradingview");
    // status field must be ok per spec
    assert.equal(res.status, "ok");
  } finally {
    restore();
  }
});

test("5.3 NEWS_PROVIDER=tradingview forces TV even with keys present", async () => {
  process.env.GNEWS_API_KEY = "test-gnews-key";
  process.env.FINNHUB_API_KEY = "test-finnhub-key";
  process.env.NEWS_PROVIDER = "tradingview";
  let gnewsHit = false;
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) {
      gnewsHit = true;
      return Response.json(gnewsPayload([{ title: "should not see", url: "https://x.com", image: "https://x.com/i.jpg", description: "x", source: { name: "x" } }]));
    }
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem()]));
    if (url.includes("finnhub.io")) assert.fail("Finnhub skip when tradingview forced");
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("AAPL"); // CEDEAR would normally try Finnhub
    assert.equal(gnewsHit, false);
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.degraded, true);
  } finally {
    restore();
  }
});

test("5.3 only GNEWS_API_KEY set, FINNHUB missing → CEDEAR still degraded via GNews→TV (Finnhub skipped gracefully)", async () => {
  process.env.GNEWS_API_KEY = "test-gnews-key";
  delete process.env.FINNHUB_API_KEY;
  process.env.NEWS_PROVIDER = "gnews";
  let finnhubHit = false;
  const restore = stubFetch((url) => {
    if (url.includes("gnews.io")) return Response.json(gnewsPayload([])); // empty → would try finnhub for CEDEAR
    if (url.includes("finnhub.io")) {
      finnhubHit = true;
      return Response.json([]);
    }
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvPayload([tvItem()]));
    return new Response("no", { status: 500 });
  });
  try {
    const res = await getNews("AAPL");
    assert.equal(finnhubHit, false, "Finnhub must not be hit when FINNHUB_API_KEY missing");
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.degraded, true);
  } finally {
    restore();
  }
});

test("5.3 automated_traffic not triggered: no fetch(cdn.brandfetch.io) in apps/api (static check)", async () => {
  // This test verifies the backend never proxies to Brandfetch CDN.
  // We scan the source: ensure no file in apps/api fetches cdn.brandfetch.io
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
    }
    return out;
  }
  const apiSrc = join(process.cwd(), "apps", "api", "src");
  let files: string[] = [];
  try {
    files = walk(apiSrc);
  } catch {
    // if cwd is apps/api, fallback
    const alt = join(process.cwd(), "src");
    try {
      files = walk(alt);
    } catch {
      assert.fail("could not walk api src");
    }
  }
  for (const f of files) {
    const txt = readFileSync(f, "utf8");
    assert.equal(txt.includes("cdn.brandfetch.io") && txt.includes("fetch(") && txt.includes("brandfetch"), false, `Backend must not fetch cdn.brandfetch.io: ${f}`);
    // stricter: any fetch to brandfetch cdn at all
    if (txt.includes("cdn.brandfetch.io")) {
      // allow only comments/docs, but not fetch
      assert.equal(/fetch\s*\(\s*["'`]https:\/\/cdn\.brandfetch\.io/.test(txt), false, `fetch(cdn.brandfetch.io) forbidden in backend: ${f}`);
    }
  }
});

test("5.3 fetchJson status 0 (network down) → degraded not throw", async () => {
  process.env.GNEWS_API_KEY = "test-gnews-key";
  process.env.FINNHUB_API_KEY = "test-finnhub-key";
  const restore = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    const res = await getNews("GGAL", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    // must not throw
  } finally {
    restore();
  }
});
