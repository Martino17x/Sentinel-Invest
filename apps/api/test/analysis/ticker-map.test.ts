import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCedear,
  mapMarketToYahoo,
  resolveAnalysisSymbol,
} from "../../src/services/market/ticker-map.js";

test("bcba → sufijo .BA", () => {
  assert.equal(mapMarketToYahoo("GGAL", "bcba"), "GGAL.BA");
});

test("sin market: acción local → .BA", () => {
  assert.equal(mapMarketToYahoo("GGAL"), "GGAL.BA");
});

test("sin market: CEDEAR → subyacente pelado (AAPL → AAPL)", () => {
  assert.equal(mapMarketToYahoo("AAPL"), "AAPL");
  assert.equal(isCedear("AAPL"), true);
  assert.equal(isCedear("GGAL"), false);
});

test("market explícito sobreescribe la resolución CEDEAR", () => {
  assert.equal(mapMarketToYahoo("AAPL", "bcba"), "AAPL.BA");
  assert.equal(mapMarketToYahoo("GGAL", "nyse"), "GGAL");
});

test("nyse y nasdaq → símbolo pelado", () => {
  assert.equal(mapMarketToYahoo("MSFT", "nyse"), "MSFT");
  assert.equal(mapMarketToYahoo("MSFT", "nasdaq"), "MSFT");
});

test("enum inválido → rechazo (Error)", () => {
  assert.throws(() => mapMarketToYahoo("GGAL", "bonds" as never));
});

test("resolveAnalysisSymbol: nombre desde catálogo INSTRUMENT_NAMES", () => {
  assert.deepEqual(resolveAnalysisSymbol("GGAL"), {
    yahooSymbol: "GGAL.BA",
    targetName: "Grupo Financiero Galicia",
  });
  assert.deepEqual(resolveAnalysisSymbol("AAPL"), {
    yahooSymbol: "AAPL",
    targetName: "Apple Inc. CEDEAR",
  });
  assert.deepEqual(resolveAnalysisSymbol("MSFT", "nyse"), {
    yahooSymbol: "MSFT",
    targetName: "Microsoft Corp. CEDEAR",
  });
  assert.deepEqual(resolveAnalysisSymbol("ZZZZNOPE"), {
    yahooSymbol: "ZZZZNOPE.BA",
    targetName: null,
  });
});
