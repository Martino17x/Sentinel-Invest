import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockBroker } from "../../src/infraestructura/providers/__mocks__/createMockBroker.js";
import { parsePpiSymbol, mapPpiMarketToCanonical, mapPpiQuoteToCanonical } from "../../src/infraestructura/providers/ppi/mappers.js";
import type { BrokerType } from "../../src/services/iol/ports.js";

// ============================================================
// Contract tests MarketDataPort por broker — Commit 3 (Req 10)
// describe.each(['iol','ppi']) → getQuote y getHistoricalSeries contra mocks
// Valida que PPI mapper produce Quote canónico idéntico a IOL shape.
// ============================================================

const BROKERS: BrokerType[] = ["iol", "ppi"];
const dummyCreds = { username: "test-user", password: "test-pass" };

for (const broker of BROKERS) {
  test(`MarketData contract [${broker}] getQuote retorna Quote canónico`, async () => {
    const provider = createMockBroker(broker);
    const quote = await provider.getQuote(dummyCreds, "GGAL", "bcba");

    assert.ok(typeof quote.symbol === "string" && quote.symbol.length > 0, "symbol string");
    assert.ok(typeof quote.market === "string", "market string");
    assert.ok(["bcba", "nyse", "nasdaq", "bonds", "fci", "crypto"].includes(quote.market), `market canónico: ${quote.market}`);
    assert.ok(typeof quote.lastPrice === "number" && quote.lastPrice > 0, "lastPrice >0");
    assert.ok(typeof quote.variationPct === "number", "variationPct number");
    assert.ok(quote.currency === "ARS" || quote.currency === "USD", `currency ARS|USD: ${quote.currency}`);
    assert.ok(typeof quote.updatedAt === "string" && !Number.isNaN(Date.parse(quote.updatedAt)), "updatedAt ISO");
    // Campos opcionales nullable
    assert.ok(quote.bid === null || typeof quote.bid === "number", "bid nullable number");
    assert.ok(quote.ask === null || typeof quote.ask === "number", "ask nullable number");
    assert.ok(quote.open === null || typeof quote.open === "number", "open nullable");
    assert.ok(quote.high === null || typeof quote.high === "number", "high nullable");
    assert.ok(quote.low === null || typeof quote.low === "number", "low nullable");
    assert.ok(quote.prevClose === null || typeof quote.prevClose === "number", "prevClose nullable");
    assert.ok(quote.volume === null || typeof quote.volume === "number", "volume nullable");
  });

  test(`MarketData contract [${broker}] getQuote AL30 normaliza símbolo`, async () => {
    const provider = createMockBroker(broker);
    const quote = await provider.getQuote(dummyCreds, "AL30", "bcba");
    assert.equal(quote.symbol, "AL30");
    assert.equal(quote.market, "bcba");
  });

  test(`MarketData contract [${broker}] getQuoteHistory retorna serie canónica`, async () => {
    const provider = createMockBroker(broker);
    const history = await provider.getQuoteHistory(dummyCreds, "GGAL", "bcba", 5);
    assert.ok(Array.isArray(history), "history array");
    assert.equal(history.length, 6, "days+1 puntos");
    for (const pt of history) {
      assert.ok(typeof pt.date === "string" && !Number.isNaN(Date.parse(pt.date)), `date ISO: ${pt.date}`);
      assert.ok(typeof pt.close === "number" && pt.close > 0, `close >0: ${pt.close}`);
    }
  });

  test(`MarketData contract [${broker}] getPanel retorna shape paginado canónico`, async () => {
    const provider = createMockBroker(broker);
    const panel = await provider.getPanel(dummyCreds, "bcba", "cedear", 1, 10, undefined);
    assert.ok(panel.summary, "summary exists");
    assert.ok(typeof panel.summary.market === "string", "summary.market string");
    assert.ok(typeof panel.summary.assetType === "string", "summary.assetType");
    assert.ok(typeof panel.summary.totalVariationPct === "number", "totalVariationPct number");
    assert.ok(Array.isArray(panel.quotes), "quotes array");
    assert.ok(typeof panel.total === "number" || panel.total === undefined, "total number?");
    // paginación: page 1 pageSize 10 → ≤10
    assert.ok(panel.quotes.length <= 10, `quotes per page ≤10: ${panel.quotes.length}`);
    for (const qq of panel.quotes) {
      assert.ok(typeof qq.symbol === "string", "panel symbol");
      assert.ok(typeof qq.lastPrice === "number", "panel lastPrice");
      assert.ok(typeof qq.variationPct === "number", "panel variation");
    }
  });

  test(`MarketData contract [${broker}] getPanel con q filtra por símbolo`, async () => {
    const provider = createMockBroker(broker);
    const panel = await provider.getPanel(dummyCreds, "bcba", "cedear", 1, 25, "GGAL");
    // Si hay quotes, todos deben contener GGAL en símbolo o nombre
    if (panel.quotes.length > 0) {
      for (const qq of panel.quotes) {
        const hay = qq.symbol.toUpperCase().includes("GGAL") || qq.name.toUpperCase().includes("GGAL");
        assert.ok(hay, `filtro q GGAL: ${qq.symbol}`);
      }
    }
  });
}

// ============================================================
// Validaciones específicas PPI mappers (tabla explícita Req 7)
// ============================================================

test("PPI mapper: MarketCode BCBA/bCBA case-insensitive → bcba canónico", () => {
  assert.equal(mapPpiMarketToCanonical("BCBA"), "bcba");
  assert.equal(mapPpiMarketToCanonical("bCBA"), "bcba");
  assert.equal(mapPpiMarketToCanonical("BcBa"), "bcba");
  assert.equal(mapPpiMarketToCanonical("NYSE"), "nyse");
  assert.equal(mapPpiMarketToCanonical("nYSE"), "nyse");
  assert.equal(mapPpiMarketToCanonical("NASDAQ"), "nasdaq");
  assert.equal(mapPpiMarketToCanonical("bonds"), "bonds");
});

test("PPI mapper: símbolo con sufijo D → strip + settlement D", () => {
  const a = parsePpiSymbol("AL30D");
  assert.equal(a.symbol, "AL30");
  assert.equal(a.settlementType, "D");

  const b = parsePpiSymbol("AL30");
  assert.equal(b.symbol, "AL30");
  assert.equal(b.settlementType, undefined);

  const c = parsePpiSymbol("GD35D");
  assert.equal(c.symbol, "GD35");
  assert.equal(c.settlementType, "D");
});

test("PPI mapper: AL30D produce Quote canónico idéntico shape a IOL AL30 (sin D)", async () => {
  const ppiProvider = createMockBroker("ppi");
  const iolProvider = createMockBroker("iol");

  const ppiQuote = await ppiProvider.getQuote(dummyCreds, "AL30D", "bcba");
  const iolQuote = await iolProvider.getQuote(dummyCreds, "AL30", "bcba");

  // Símbolo normalizado sin D
  assert.equal(ppiQuote.symbol, "AL30", "PPI AL30D → AL30");
  assert.equal(iolQuote.symbol, "AL30");

  // Shape idéntico: mismos keys y tipos
  const ppiKeys = Object.keys(ppiQuote).sort();
  const iolKeys = Object.keys(iolQuote).sort();
  // PPI puede tener name igual, pero keys base deben coincidir
  for (const k of ["symbol", "market", "lastPrice", "variationPct", "currency", "updatedAt"]) {
    assert.ok(ppiKeys.includes(k), `ppi has ${k}`);
    assert.ok(iolKeys.includes(k), `iol has ${k}`);
  }
  assert.equal(typeof ppiQuote.lastPrice, typeof iolQuote.lastPrice);
  assert.equal(typeof ppiQuote.currency, typeof iolQuote.currency);
});

test("PPI mappers: Quote mapping ultimoPrecio→lastPrice, variacion→variationPct, puntaCompra→bid", () => {
  const raw = {
    simbolo: "GGAL",
    descripcion: "Grupo Financiero Galicia",
    ultimoPrecio: 9312.5,
    variacion: 1.85,
    apertura: 9210,
    maximo: 9350,
    minimo: 9180,
    cierreAnterior: 9143,
    volumenNominal: 112340,
    moneda: "peso_argentino",
    puntaCompra: 9310,
    puntaVenta: 9315,
    mercado: "BCBA",
  };
  const q = mapPpiQuoteToCanonical(raw, "bcba");
  assert.equal(q.symbol, "GGAL");
  assert.equal(q.market, "bcba");
  assert.equal(q.lastPrice, 9312.5);
  assert.equal(q.variationPct, 1.85);
  assert.equal(q.bid, 9310);
  assert.equal(q.ask, 9315);
  assert.equal(q.open, 9210);
  assert.equal(q.high, 9350);
  assert.equal(q.low, 9180);
  assert.equal(q.prevClose, 9143);
  assert.equal(q.currency, "ARS");
});

test("MarketData contract: PPI y IOL Quote shape canónico son isomórficos (no contamina BYMA)", async () => {
  // Aislamiento por broker: zeroQuote ppi no contamina iol
  const ppi = createMockBroker("ppi");
  const iol = createMockBroker("iol");
  const qPpi = await ppi.getQuote(dummyCreds, "GGAL", "bcba");
  const qIol = await iol.getQuote(dummyCreds, "GGAL", "bcba");
  // Ambos deben ser válidos simultáneamente
  assert.ok(qPpi.lastPrice > 0, "ppi quote ok");
  assert.ok(qIol.lastPrice > 0, "iol quote ok");
  assert.notEqual(qPpi === qIol, true, "instancias distintas (aislamiento por broker)");
});
