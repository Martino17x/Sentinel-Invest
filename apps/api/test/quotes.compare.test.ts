import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { signAccessToken } from "../src/lib/jwt.js";
import quotesRouter from "../src/interfaces/http/routes/quotes.js";
import { registerBroker, clearRegistry } from "../src/infraestructura/providers/registry.js";
import { deleteCache } from "../src/infra/cache/CacheFactory.js";

// Helpers para stub fetch BYMA (para provider byma)
function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const orig = globalThis.fetch;
  const stub = (async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return (orig as typeof fetch)(input as never, init);
    return handler(url, init);
  }) as typeof fetch;
  globalThis.fetch = stub;
  return () => { globalThis.fetch = orig; };
}

function makeQuote(symbol: string, price: number, source: string) {
  return {
    symbol,
    market: "bcba",
    lastPrice: price,
    variationPct: 1.2,
    currency: "ARS",
    updatedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    source,
    cacheHit: false,
    name: symbol,
    bid: price - 1,
    ask: price + 1,
    open: price,
    high: price + 5,
    low: price - 5,
    prevClose: price - 2,
    volume: 1000,
  };
}

async function startServer(router: express.Router): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use("/api/quotes", router);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))),
  };
}

let restoreFetch: (() => void) | null = null;

beforeEach(() => {
  clearRegistry();
  try { deleteCache(); } catch {}
  // mock creds per provider
  (globalThis as unknown as { __mockBrokerCreds?: unknown }).__mockBrokerCreds = {
    iol: { username: "u", password: "p" },
    ppi: { username: "u", password: "p" },
  };
  process.env.BROKER_IOL_ENABLED = "true";
  process.env.BROKER_PPI_ENABLED = "true";
  process.env.CACHE_ENABLED = "false";
});

afterEach(() => {
  clearRegistry();
  try { deleteCache(); } catch {}
  delete (globalThis as unknown as { __mockBrokerCreds?: unknown }).__mockBrokerCreds;
  if (restoreFetch) { restoreFetch(); restoreFetch = null; }
  delete process.env.BROKER_IOL_ENABLED;
  delete process.env.BROKER_PPI_ENABLED;
  delete process.env.CACHE_ENABLED;
});

test("GET /compare/:symbol 207 parcial cuando un provider falla (ppi timeout)", async () => {
  // Mock providers
  registerBroker("iol", () => ({
    getQuote: async () => makeQuote("GGAL", 100, "iol"),
    getPanel: async () => ({ summary: { market: "bcba", assetType: "cedear", totalVariationPct: 0, updatedAt: new Date().toISOString(), isRealtime: true }, quotes: [], total: 0 }),
    getQuoteHistory: async () => [],
    getPortfolio: async () => { throw new Error("not"); },
    getOperations: async () => [],
    getPortfolioHistory: async () => [],
    getMonthlyCloses: async () => [],
    getMonthlyReport: async () => { throw new Error("not"); },
  } as unknown as never));

  registerBroker("ppi", () => ({
    getQuote: async () => { throw Object.assign(new Error("timeout"), { code: "timeout" }); },
    getPanel: async () => ({ summary: { market: "bcba", assetType: "cedear", totalVariationPct: 0, updatedAt: new Date().toISOString(), isRealtime: true }, quotes: [], total: 0 }),
    getQuoteHistory: async () => [],
    getPortfolio: async () => { throw new Error("not"); },
    getOperations: async () => [],
    getPortfolioHistory: async () => [],
    getMonthlyCloses: async () => [],
    getMonthlyReport: async () => { throw new Error("not"); },
  } as unknown as never));

  // BYMA stub via fetch for provider byma when included
  restoreFetch = stubFetch((url) => {
    if (url.includes("bymadata")) {
      // QuoteService hace 3 POSTs panel; respondemos vacío pero getQuote buscará en panel
      // Simplificamos: retornar instrumentos con GGAL
      return Response.json([{ symbol: "GGAL", trade: 105, denominationCcy: "ARS", description: "GGAL" }]);
    }
    return Response.json({});
  });

  const token = signAccessToken("user-1", "test@test.com");
  const { url, close } = await startServer(quotesRouter);
  try {
    const res = await fetch(`${url}/api/quotes/compare/GGAL?providers=iol,ppi`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 207, `esperaba 207 parcial, got ${res.status} body ${await res.clone().text()}`);
    const body = await res.json() as { symbol: string; results: Record<string, unknown>; fetchedAt: string };
    assert.equal(body.symbol, "GGAL");
    assert.ok((body.results.iol as { quote?: unknown }).quote, "iol debe tener quote");
    const ppiEntry = body.results.ppi as { error?: string; code?: string };
    assert.equal(ppiEntry.code, "timeout");
    assert.ok(body.fetchedAt);
  } finally {
    await close();
  }
});

test("GET /compare/:symbol 502 cuando todos fallan", async () => {
  registerBroker("iol", () => ({
    getQuote: async () => { throw new Error("boom"); },
    getPanel: async () => ({ summary: { market: "bcba", assetType: "cedear", totalVariationPct: 0, updatedAt: new Date().toISOString(), isRealtime: true }, quotes: [], total: 0 }),
    getQuoteHistory: async () => [],
    getPortfolio: async () => { throw new Error("not"); },
    getOperations: async () => [],
    getPortfolioHistory: async () => [],
    getMonthlyCloses: async () => [],
    getMonthlyReport: async () => { throw new Error("not"); },
  } as unknown as never));
  registerBroker("ppi", () => ({
    getQuote: async () => { throw new Error("boom2"); },
    getPanel: async () => ({ summary: { market: "bcba", assetType: "cedear", totalVariationPct: 0, updatedAt: new Date().toISOString(), isRealtime: true }, quotes: [], total: 0 }),
    getQuoteHistory: async () => [],
    getPortfolio: async () => { throw new Error("not"); },
    getOperations: async () => [],
    getPortfolioHistory: async () => [],
    getMonthlyCloses: async () => [],
    getMonthlyReport: async () => { throw new Error("not"); },
  } as unknown as never));

  const token = signAccessToken("user-2", "t2@test.com");
  const { url, close } = await startServer(quotesRouter);
  try {
    const res = await fetch(`${url}/api/quotes/compare/YPFD?providers=iol,ppi`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 502);
    const body = await res.json() as { results: Record<string, unknown> };
    assert.ok((body.results.iol as { error?: string }).error);
    assert.ok((body.results.ppi as { error?: string }).error);
  } finally {
    await close();
  }
});

test("GET /compare/:symbol 200 cuando todos ok y p-limit no suma latencia", async () => {
  const t0 = Date.now();
  registerBroker("iol", () => ({
    getQuote: async () => { await new Promise((r) => setTimeout(r, 80)); return makeQuote("AAPL", 200, "iol"); },
    getPanel: async () => ({ summary: { market: "bcba", assetType: "cedear", totalVariationPct: 0, updatedAt: new Date().toISOString(), isRealtime: true }, quotes: [], total: 0 }),
    getQuoteHistory: async () => [],
    getPortfolio: async () => { throw new Error("not"); },
    getOperations: async () => [],
    getPortfolioHistory: async () => [],
    getMonthlyCloses: async () => [],
    getMonthlyReport: async () => { throw new Error("not"); },
  } as unknown as never));
  registerBroker("ppi", () => ({
    getQuote: async () => { await new Promise((r) => setTimeout(r, 80)); return makeQuote("AAPL", 201, "ppi"); },
    getPanel: async () => ({ summary: { market: "bcba", assetType: "cedear", totalVariationPct: 0, updatedAt: new Date().toISOString(), isRealtime: true }, quotes: [], total: 0 }),
    getQuoteHistory: async () => [],
    getPortfolio: async () => { throw new Error("not"); },
    getOperations: async () => [],
    getPortfolioHistory: async () => [],
    getMonthlyCloses: async () => [],
    getMonthlyReport: async () => { throw new Error("not"); },
  } as unknown as never));

  const token = signAccessToken("user-3", "t3@test.com");
  const { url, close } = await startServer(quotesRouter);
  try {
    const res = await fetch(`${url}/api/quotes/compare/AAPL?providers=iol,ppi`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const elapsed = Date.now() - t0;
    assert.equal(res.status, 200);
    // fan-out paralelo: elapsed ~80ms, no 160ms
    assert.ok(elapsed < 300, `latencia debe ser ~max no suma, fue ${elapsed}ms`);
  } finally {
    await close();
  }
});
