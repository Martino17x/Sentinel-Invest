import "../agent/setup.js"; // ANTES de dotenv/config: IOL_PROVIDER=mock
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../../src/services/agent/executor.js";
import { agentRegistry } from "../../src/services/agent/tools/index.js";
import { analyzeStockTool } from "../../src/services/agent/tools/analyzeStock.js";
import { resetMarketCache } from "../../src/services/market/yahoo.js";
import { toolsVisibleForScope } from "../../src/mcp/server.js";
import { createTestUser, deleteTestUser } from "../agent/helpers.js";

// ============================================================
// Integración tool analyze_stock — Yahoo mockeado (stub global
// fetch), executeTool contra el REGISTRY REAL (agentRegistry).
// El executor resuelve cuenta + credenciales en modo mock (demo)
// y audita en agent_actions → usuario efímero en la BD local.
// ============================================================

const CHART_TS_BASE = 1_700_000_000;

function chartJson(closes: number[], opts: { error?: boolean } = {}): object {
  if (opts.error) {
    return { chart: { error: { code: "Not Found" }, result: null } };
  }
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
            currency: "ARS",
            longName: "Grupo Financiero Galicia",
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
            trailingPE: { raw: 12.1 },
            trailingEps: { raw: 580 },
            beta: { raw: 0.95 },
            returnOnEquity: { raw: 0.28 },
            debtToEquity: { raw: 1.4 },
            dividendYield: { raw: 0.0 },
            marketCap: { raw: 8_900_000_000_000 },
          },
          financialData: { profitMargins: { raw: 0.31 } },
          summaryDetail: {},
        },
      ],
    },
  };
}

const A3_COOKIE = "A3=d=AQAB~test-cookie; Path=/; Domain=.yahoo.com";

const BULLISH_CLOSES = Array.from({ length: 220 }, (_, i) => 1000 + i * 5);

function stubYahoo(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function stubChartOk(symbol = "GGAL.BA"): () => void {
  return stubYahoo((url) => {
    if (url.startsWith("https://fc.yahoo.com")) {
      return new Response("Will be right back", {
        status: 404,
        headers: { "set-cookie": A3_COOKIE },
      });
    }
    if (url.includes("/v1/test/getcrumb")) {
      return new Response("crumb-test", { status: 200 });
    }
    if (url.includes(`/v8/finance/chart/${symbol}`)) {
      return Response.json(chartJson(BULLISH_CLOSES));
    }
    if (url.includes("quoteSummary")) {
      return Response.json(fundamentalsJson());
    }
    return new Response("not stubbed", { status: 500 });
  });
}

test("registry real: analyze_stock registrado allow, sin proposeOnly, visible en MCP read", () => {
  const tool = agentRegistry.lookup("analyze_stock");
  assert.ok(tool, "analyze_stock debe estar en el registry");
  assert.equal(tool.name, "analyze_stock");
  assert.equal(tool.permission, "allow");
  assert.equal(tool.proposeOnly, undefined);

  // Auto-exposición MCP: mcp/server.ts itera registry.list() filtrando
  // por scope — sin registro manual, analyze_stock aparece en read y trade.
  const read = toolsVisibleForScope(agentRegistry, "read");
  const trade = toolsVisibleForScope(agentRegistry, "trade");
  assert.ok(read.some((t) => t.name === "analyze_stock"), "visible en scope read");
  assert.ok(trade.some((t) => t.name === "analyze_stock"), "visible en scope trade");
});

test("analyze_stock: schema — symbol 1-10 uppercase, market opcional", () => {
  const schema = analyzeStockTool.inputSchema;
  const lower = schema.safeParse({ symbol: "ggal" });
  assert.ok(lower.success);
  assert.equal(lower.data.symbol, "GGAL", "toUpperCase");

  assert.ok(schema.safeParse({ symbol: "AAPL" }).success, "sin market (CEDEAR → subyacente)");
  assert.ok(schema.safeParse({ symbol: "AAPL", market: "nyse" }).success);
  assert.equal(schema.safeParse({ symbol: "", market: "nyse" }).success, false, "symbol vacío");
  assert.equal(schema.safeParse({ symbol: "MUYLARGO-MAS-DE-10" }).success, false, "symbol > 10");
  assert.equal(schema.safeParse({ symbol: "NVDA", market: "bonds" }).success, false, "market inválido");
});

test("analyze_stock ok:true con señal y veredicto en el texto (formato es-AR)", async () => {
  const restore = stubChartOk();
  const userId = await createTestUser("u-analyze-ok");
  try {
    const result = await executeTool({
      toolName: "analyze_stock",
      args: { symbol: "GGAL" },
      userId,
      scope: "chat",
      registry: agentRegistry,
      clientName: "test",
    });
    assert.equal(result.ok, true);
    assert.match(result.message, /ALCISTA/, "el texto debe incluir el veredicto");
    assert.match(result.message, /\(\d+\/100\)/, "score en formato (N/100)");
    assert.match(result.message, /Técnicos: RSI/, "sección de técnicos");
    assert.match(result.message, /Fundamentos: PER/, "sección de fundamentales");
    assert.match(result.message, /no es asesoramiento/, "nota de riesgo");
    // Formato argentino: punto de miles / coma decimal
    assert.match(result.message, /2\.095/, "punto de miles en es-AR (2.095)");
    assert.match(result.message, /Riesgo:/, "nota de riesgo presente");
  } finally {
    await deleteTestUser(userId);
    restore();
    resetMarketCache();
  }
});

test("analyze_stock ok:false claro ante symbol_not_found", async () => {
  const restore = stubYahoo((url) => {
    if (url.includes("/v8/finance/chart/ZZZZNOPE")) {
      return Response.json(chartJson([], { error: true }));
    }
    return new Response("not stubbed", { status: 500 });
  });
  const userId = await createTestUser("u-analyze-nf");
  try {
    const result = await executeTool({
      toolName: "analyze_stock",
      args: { symbol: "ZZZZNOPE" },
      userId,
      scope: "chat",
      registry: agentRegistry,
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /no encontrado/);
  } finally {
    await deleteTestUser(userId);
    restore();
    resetMarketCache();
  }
});

test("analyze_stock: args inválidos → validation_error sin ejecutar", async () => {
  const restore = stubChartOk();
  const userId = await createTestUser("u-analyze-val");
  try {
    const result = await executeTool({
      toolName: "analyze_stock",
      args: { symbol: "" },
      userId,
      scope: "chat",
      registry: agentRegistry,
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /Argumentos inválidos/);
  } finally {
    await deleteTestUser(userId);
    restore();
    resetMarketCache();
  }
});
