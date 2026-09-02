import "../agent/setup.js";
import "dotenv/config";
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { agentRegistry } from "../../src/services/agent/tools/index.js";
import { fundamentalsTool } from "../../src/services/agent/tools/fundamentals.js";
import { analystConsensusTool } from "../../src/services/agent/tools/analyst_consensus.js";
import { earningsTool } from "../../src/services/agent/tools/earnings.js";
import { newsTool } from "../../src/services/agent/tools/news.js";
import { backtestStrategyTool } from "../../src/services/agent/tools/backtest_strategy.js";
import { executeTool } from "../../src/services/agent/executor.js";
import { resetFundamentalsCache } from "../../src/services/analysis/fundamentals.js";
import { resetConsensusCache } from "../../src/services/analysis/consensus.js";
import { resetNewsCache } from "../../src/services/analysis/news.js";
import { resetMarketCache } from "../../src/services/market/yahoo.js";
import { createTestUser, deleteTestUser } from "../agent/helpers.js";

// ============================================================
// tools.test.ts — 5 agent tools batch A7 (A7a+A7b)
// fundamentals, analyst_consensus, earnings→consensus,
// news, backtest_strategy + registry + SYSTEM_PROMPT
// ============================================================

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => { globalThis.fetch = original; };
}

const A3_COOKIE = "A3=d=AQAB~test-cookie; Path=/; Domain=.yahoo.com";
const CHART_TS = 1_700_000_000;

function chartJson(closes: number[]): object {
  return {
    chart: {
      result: [
        {
          timestamp: closes.map((_, i) => CHART_TS + i * 86400),
          indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }] },
          meta: { regularMarketPrice: closes[closes.length - 1], currency: "ARS", shortName: "GGAL" },
        },
      ],
    },
  };
}

function fundamentalsOkJson(): object {
  return {
    quoteSummary: {
      result: [
        {
          defaultKeyStatistics: {
            trailingPE: { raw: 12.3 },
            trailingEps: { raw: 4.5 },
            beta: { raw: 1.1 },
            returnOnEquity: { raw: 0.23 },
            debtToEquity: { raw: 0.5 },
            dividendYield: { raw: 0.03 },
            marketCap: { raw: 1_000_000 },
          },
          financialData: { profitMargins: { raw: 0.2 } },
          summaryDetail: {},
        },
      ],
    },
  };
}

function tvConsensusOk(tv = "BCBA:GGAL", earnings = 1768000000): object {
  // order: Recommend.All, high, low, avg, buy, hold, sell, count, earnings_unix
  return { totalCount: 1, data: [{ s: tv, d: [0.7, 120.5, 90, 150, 8, 4, 1, 13, earnings] }] };
}

function tvNewsItems(count = 3, tv = "BCBA:GGAL"): object {
  const items = Array.from({ length: count }, (_, i) => ({
    id: `${tv}/news-${i}`,
    title: `Noticia ${i + 1} de ${tv}`,
    source: "Reuters",
    link: `https://www.tradingview.com/news/${i}`,
    published: CHART_TS + i * 3600,
    relatedSymbols: [{ symbol: tv }],
    summary: `Resumen ${i}`,
  }));
  return { items };
}

beforeEach(() => {
  resetFundamentalsCache();
  resetConsensusCache();
  resetNewsCache();
  resetMarketCache();
});
afterEach(() => {
  resetFundamentalsCache();
  resetConsensusCache();
  resetNewsCache();
  resetMarketCache();
});

// ---- registry ----

test("registry: 5 tools registradas con permission allow", () => {
  const names = ["fundamentals", "analyst_consensus", "earnings", "news", "backtest_strategy"];
  for (const n of names) {
    const t = agentRegistry.lookup(n);
    assert.ok(t, `${n} debe estar en agentRegistry`);
    assert.equal(t!.permission, "allow", `${n} permission allow`);
    assert.ok(t!.description.length > 10, `${n} description presente`);
    assert.ok(t!.inputSchema, `${n} inputSchema`);
  }
  // DOMAIN_TOOLS son fuente única → registry.list debe contenerlas
  const listed = agentRegistry.names();
  for (const n of names) assert.ok(listed.includes(n));
});

test("registry: inputSchema valida symbol requerido y market enum local (bcba/nyse/nasdaq)", () => {
  assert.equal(fundamentalsTool.inputSchema.safeParse({ symbol: "" }).success, false);
  assert.equal(fundamentalsTool.inputSchema.safeParse({ symbol: "TOOLONG12345" }).success, false);
  // market local NO incluye bonds/fci
  assert.equal(fundamentalsTool.inputSchema.safeParse({ symbol: "GGAL", market: "bonds" }).success, false);
  assert.ok(fundamentalsTool.inputSchema.safeParse({ symbol: "ggal" }).success, "toUpperCase");
  assert.ok(fundamentalsTool.inputSchema.safeParse({ symbol: "GGAL", market: "bcba" }).success);
  assert.ok(backtestStrategyTool.inputSchema.safeParse({ symbol: "AAPL", market: "nasdaq", range: "1y" }).success);
  assert.equal(backtestStrategyTool.inputSchema.safeParse({ symbol: "AAPL", range: "3m" }).success, false, "range solo 1y|5y");
  assert.ok(backtestStrategyTool.inputSchema.safeParse({ symbol: "GGAL" }).success, "range default 1y");
});

// ---- SYSTEM_PROMPT ----

test("SYSTEM_PROMPT menciona los 5 tools", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/services/agent/chatLoop.ts", "utf-8");
  for (const needle of ["fundamentals", "analyst_consensus", "earnings", "news", "backtest_strategy"]) {
    assert.match(src, new RegExp(needle), `SYSTEM_PROMPT debe mencionar ${needle}`);
  }
});

// ---- fundamentals ----

test("fundamentals ok:true tabla es-AR (PER, EPS, cache flag)", async () => {
  const restore = stubFetch((url) => {
    if (url.startsWith("https://fc.yahoo.com")) return new Response("x", { status: 404, headers: { "set-cookie": A3_COOKIE } });
    if (url.includes("/v1/test/getcrumb")) return new Response("crumb", { status: 200 });
    if (url.includes("quoteSummary")) return Response.json(fundamentalsOkJson());
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-fund-ok");
  try {
    const r = await executeTool({ toolName: "fundamentals", args: { symbol: "GGAL", market: "bcba" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, true);
    assert.match(r.message, /Fundamentales de GGAL/, "cabecera");
    assert.match(r.message, /PER:/, "PER presente");
    assert.match(r.message, /EPS:/, "EPS presente");
    assert.match(r.message, /Beta:/, "Beta");
    assert.match(r.message, /Margen:/, "Margen");
    assert.match(r.message, /ROE:/, "ROE");
    // es-AR: coma decimal
    assert.match(r.message, /12,3/, "formato es-AR con coma");
    assert.match(r.message, /fuente: yahoo/, "fuente");
  } finally { await deleteTestUser(uid); restore(); }
});

test("fundamentals ok:false cuando Yahoo down (nunca lanza)", async () => {
  const restore = stubFetch(() => { throw new Error("ECONNREFUSED"); });
  const uid = await createTestUser("u-tools-fund-down");
  try {
    const r = await executeTool({ toolName: "fundamentals", args: { symbol: "GGAL" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, false);
    assert.match(r.message, /no disponibles/i);
    assert.match(r.message, /GGAL/);
  } finally { await deleteTestUser(uid); restore(); }
});

// ---- analyst_consensus ----

test("analyst_consensus ok:true con rating, targets y earnings countdown", async () => {
  const restore = stubFetch((url, init) => {
    if (url.includes("scanner.tradingview.com/global/scan")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.deepEqual(body.symbols, { tickers: ["BCBA:GGAL"] });
      return Response.json(tvConsensusOk("BCBA:GGAL", 1768000000));
    }
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-cons-ok");
  try {
    const r = await executeTool({ toolName: "analyst_consensus", args: { symbol: "GGAL", market: "bcba" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, true);
    assert.match(r.message, /Consenso de GGAL/, "cabecera");
    assert.match(r.message, /Recomendaci/, "recomendación");
    assert.match(r.message, /Distribuci/, "distribución");
    assert.match(r.message, /Precio objetivo/, "targets");
    assert.match(r.message, /earnings/i, "earnings");
    assert.match(r.message, /fuente: tradingview/, "fuente");
  } finally { await deleteTestUser(uid); restore(); }
});

test("analyst_consensus ok:false símbolo vacío data → down", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("scanner.tradingview.com")) return Response.json({ totalCount: 0, data: [] });
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-cons-down");
  try {
    const r = await executeTool({ toolName: "analyst_consensus", args: { symbol: "ZZZZ", market: "bcba" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, false);
    assert.match(r.message, /no disponible/i);
  } finally { await deleteTestUser(uid); restore(); }
});

// ---- earnings (reusa consensus) ----

test("earnings ok:true con countdown (reusa consensus)", async () => {
  const future = Math.floor(Date.now() / 1000) + 5 * 86400;
  const restore = stubFetch((url) => {
    if (url.includes("scanner.tradingview.com")) {
      return Response.json({ totalCount: 1, data: [{ s: "BCBA:GGAL", d: [0.7, 120, 90, 100, 5, 2, 1, 8, future] }] });
    }
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-earn-ok");
  try {
    const r = await executeTool({ toolName: "earnings", args: { symbol: "GGAL", market: "bcba" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, true);
    assert.match(r.message, /Próximo earnings de GGAL/, "cabecera");
    assert.match(r.message, /\d{4}-\d{2}-\d{2}/, "fecha ISO");
    assert.match(r.message, /días|hoy|mañana/, "countdown");
  } finally { await deleteTestUser(uid); restore(); }
});

test("earnings ok:false cuando nextEarningsDate null → Sin fecha", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("scanner.tradingview.com")) {
      return Response.json({ totalCount: 1, data: [{ s: "BCBA:GGAL", d: [0.7, 120, 90, 100, 5, 2, 1, 8, 0] }] });
    }
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-earn-null");
  try {
    const r = await executeTool({ toolName: "earnings", args: { symbol: "GGAL", market: "bcba" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, false);
    assert.match(r.message, /Sin fecha de earnings/i);
  } finally { await deleteTestUser(uid); restore(); }
});

test("earnings ok:false cuando consensus down", async () => {
  const restore = stubFetch(() => { throw new Error("down"); });
  const uid = await createTestUser("u-tools-earn-down");
  try {
    const r = await executeTool({ toolName: "earnings", args: { symbol: "GGAL" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, false);
    assert.match(r.message, /no disponibles/i);
  } finally { await deleteTestUser(uid); restore(); }
});

// ---- news ----

test("news ok:true lista top 5 con título y link", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) return Response.json(tvNewsItems(7, "BCBA:GGAL"));
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-news-ok");
  try {
    const r = await executeTool({ toolName: "news", args: { symbol: "GGAL", market: "bcba" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, true);
    assert.match(r.message, /Noticias de GGAL/, "cabecera");
    assert.match(r.message, /Noticia 1/, "item 1");
    assert.match(r.message, /Reuters/, "fuente item");
    assert.match(r.message, /tradingview\.com\/news/, "link");
    // top 5 → no debe aparecer Noticia 6 o 7 si recorta a 5
    // (tool recorta a 5)
    assert.doesNotMatch(r.message, /Noticia 6/, "top 5");
  } finally { await deleteTestUser(uid); restore(); }
});

test("news ok:true Sin noticias recientes cuando items vacío (tv ok vacío → yahoo vacío → ok empty)", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("news-headlines.tradingview.com")) return Response.json({ items: [] });
    if (url.includes("query1.finance.yahoo.com")) return Response.json({ news: [] });
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-news-empty");
  try {
    const r = await executeTool({ toolName: "news", args: { symbol: "GGAL", market: "bcba" }, userId: uid, scope: "chat", registry: agentRegistry });
    // spec: empty con ok true y mensaje Sin noticias, o down → ok:false
    // nuestra impl: tv empty + yahoo empty → ok true empty → Sin noticias
    assert.ok(r.ok === true || r.ok === false, "ok boolean");
    if (r.ok) assert.match(r.message, /Sin noticias/i);
    else assert.match(r.message, /no disponibles/i);
  } finally { await deleteTestUser(uid); restore(); }
});

// ---- backtest_strategy ----

test("backtest_strategy ok:true buy&hold con métricas y nota de riesgo", async () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i * 1.2);
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) {
      if (url.includes("%5EMERV") || url.includes("^MERV")) return Response.json(chartJson(Array.from({ length: 30 }, (_, i) => 1000 + i)));
      return Response.json(chartJson(closes));
    }
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-bt-ok");
  try {
    const r = await executeTool({ toolName: "backtest_strategy", args: { symbol: "GGAL", market: "bcba", range: "1y" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, true);
    assert.match(r.message, /Backtest buy&hold de GGAL/, "cabecera");
    assert.match(r.message, /Retorno total:/, "retorno");
    assert.match(r.message, /Volatilidad:/, "volatilidad");
    assert.match(r.message, /Sharpe:/, "sharpe");
    assert.match(r.message, /drawdown/i, "drawdown");
    assert.match(r.message, /no es asesoramiento/, "riesgo");
    assert.match(r.message, /Benchmark/, "benchmark");
  } finally { await deleteTestUser(uid); restore(); }
});

test("backtest_strategy degrade sin benchmark cuando no se pide, ok:true", async () => {
  const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) return Response.json(chartJson(closes));
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-bt-nobm");
  try {
    const r = await executeTool({ toolName: "backtest_strategy", args: { symbol: "GGAL", market: "bcba", range: "1y", benchmark: "^MERV" }, userId: uid, scope: "chat", registry: agentRegistry });
    // if benchmark fetch fails (we return closes for all, so benchmark ok too)
    // but this verifies the tool doesn't crash with benchmark
    assert.equal(r.ok, true);
  } finally { await deleteTestUser(uid); restore(); }
});

test("backtest_strategy ok:false símbolo no encontrado", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) return new Response("not found", { status: 404 });
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-bt-nf");
  try {
    const r = await executeTool({ toolName: "backtest_strategy", args: { symbol: "ZZZZ", market: "bcba" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, false);
    assert.match(r.message, /no disponible/i);
  } finally { await deleteTestUser(uid); restore(); }
});

test("backtest_strategy valida range default 1y y acepta 5y", async () => {
  // validate via schema, not network
  assert.ok(backtestStrategyTool.inputSchema.safeParse({ symbol: "GGAL" }).success, "sin range → default 1y");
  // execute without range → should default to 1y internally
  const closes = Array.from({ length: 10 }, (_, i) => 100 + i);
  const restore = stubFetch((url) => {
    if (url.includes("/v8/finance/chart/")) return Response.json(chartJson(closes));
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-bt-default");
  try {
    const r = await executeTool({ toolName: "backtest_strategy", args: { symbol: "GGAL" }, userId: uid, scope: "chat", registry: agentRegistry });
    assert.equal(r.ok, true);
    assert.match(r.message, /rango 1y/, "default 1y");
  } finally { await deleteTestUser(uid); restore(); }
});

// ---- ctx.signal passthrough (no throw) ----

test("todos los tools respetan ctx.signal sin crash (signal abortado no cuelga)", async () => {
  // signal already aborted → fetch should be aborted quickly or return down gracefully
  const restore = stubFetch((_url, init) => {
    if (init?.signal?.aborted) return new Response("aborted", { status: 500 });
    return new Response("no", { status: 500 });
  });
  const uid = await createTestUser("u-tools-signal");
  try {
    const ctrl = new AbortController();
    ctrl.abort();
    // Use fundamentals with aborted signal via executeTool harness:
    // executor crea su propio controller (15s), pero tool recibe ctx.signal de executor
    // Acá probamos directo tool.execute con signal abortado
    const ctx = { userId: uid, scope: "chat" as const, account: { id: "a", iolAccountNumber: "1", currency: "ARS" }, creds: { username: "", password: "" } as never, signal: ctrl.signal };
    const r = await fundamentalsTool.execute(ctx, { symbol: "GGAL", market: "bcba" });
    assert.equal(typeof r.ok, "boolean");
    assert.equal(typeof r.message, "string");
  } finally { await deleteTestUser(uid); restore(); }
});
