import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAnalysisSymbols } from "../../src/services/analysis/symbol.js";

// BCBA explicit
test("bcba → yahoo .BA y tv BCBA:", () => {
  const r = resolveAnalysisSymbols("GGAL", "bcba");
  assert.equal(r.yahoo, "GGAL.BA");
  assert.equal(r.tv, "BCBA:GGAL");
  assert.equal(r.base, "GGAL");
  assert.equal(r.local, "GGAL");
  assert.equal(r.market, "bcba");
});

// US markets
test("nyse → yahoo pelado y tv NYSE:", () => {
  const r = resolveAnalysisSymbols("AAPL", "nyse");
  assert.equal(r.yahoo, "AAPL");
  assert.equal(r.tv, "NYSE:AAPL");
  assert.equal(r.base, "AAPL");
  assert.equal(r.market, "us");
});

test("nasdaq → yahoo pelado y tv NASDAQ:", () => {
  const r = resolveAnalysisSymbols("MSFT", "nasdaq");
  assert.equal(r.yahoo, "MSFT");
  assert.equal(r.tv, "NASDAQ:MSFT");
  assert.equal(r.base, "MSFT");
  assert.equal(r.market, "us");
});

// Sin market: local → BCBA
test("sin market: acción local GGAL → .BA / BCBA:", () => {
  const r = resolveAnalysisSymbols("GGAL");
  assert.equal(r.yahoo, "GGAL.BA");
  assert.equal(r.tv, "BCBA:GGAL");
  assert.equal(r.base, "GGAL");
  assert.equal(r.market, "bcba");
});

// Sin market: CEDEAR → subyacente pelado / NASDAQ:
test("sin market: CEDEAR AAPL → subyacente pelado y NASDAQ:", () => {
  const r = resolveAnalysisSymbols("AAPL");
  assert.equal(r.yahoo, "AAPL");
  assert.equal(r.tv, "NASDAQ:AAPL");
  assert.equal(r.base, "AAPL");
  assert.equal(r.swsBase, "AAPL");
  assert.equal(r.market, "us");
});

test("sin market: CEDEAR MELI → NASDAQ:", () => {
  const r = resolveAnalysisSymbols("MELI");
  assert.equal(r.yahoo, "MELI");
  assert.equal(r.tv, "NASDAQ:MELI");
});

test("sin market: CEDEAR GOOGL → NASDAQ:", () => {
  const r = resolveAnalysisSymbols("GOOGL");
  assert.equal(r.yahoo, "GOOGL");
  assert.equal(r.tv, "NASDAQ:GOOGL");
});

// Market explícito sobreescribe CEDEAR
test("market explícito bcba sobre CEDEAR → fuerza .BA / BCBA:", () => {
  const r = resolveAnalysisSymbols("AAPL", "bcba");
  assert.equal(r.yahoo, "AAPL.BA");
  assert.equal(r.tv, "BCBA:AAPL");
});

test("market explícito pesado: GGAL nyse → fuerza pelado / NYSE:", () => {
  const r = resolveAnalysisSymbols("GGAL", "nyse");
  assert.equal(r.yahoo, "GGAL");
  assert.equal(r.tv, "NYSE:GGAL");
});

// Handling .BA suffix
test("input con .BA suffix se normaliza (GGAL.BA + bcba)", () => {
  const r = resolveAnalysisSymbols("GGAL.BA", "bcba");
  assert.equal(r.yahoo, "GGAL.BA");
  assert.equal(r.tv, "BCBA:GGAL");
  assert.equal(r.base, "GGAL");
});

test("input con .BA sin market (GGAL.BA) → normaliza base", () => {
  const r = resolveAnalysisSymbols("GGAL.BA");
  assert.equal(r.base, "GGAL");
  assert.equal(r.yahoo, "GGAL.BA");
  assert.equal(r.tv, "BCBA:GGAL");
});

// Handling BCBA: prefix
test("input con BCBA: prefix se normaliza", () => {
  const r = resolveAnalysisSymbols("BCBA:GGAL", "bcba");
  assert.equal(r.base, "GGAL");
  assert.equal(r.yahoo, "GGAL.BA");
  assert.equal(r.tv, "BCBA:GGAL");
  assert.equal(r.local, "BCBA:GGAL");
});

test("input con NASDAQ: prefix sin market (NASDAQ:AAPL) → base AAPL CEDEAR logic", () => {
  const r = resolveAnalysisSymbols("NASDAQ:AAPL");
  assert.equal(r.base, "AAPL");
  // AAPL es CEDEAR, sin market → NASDAQ:AAPL
  assert.equal(r.tv, "NASDAQ:AAPL");
  assert.equal(r.yahoo, "AAPL");
});

// Gotcha: BCBA:GGAL vs NASDAQ:GGAL no intercambiables (local distingue)
test("gotcha: BCBA:GGAL y NASDAQ:GGAL no intercambiables por local", () => {
  const a = resolveAnalysisSymbols("BCBA:GGAL");
  const b = resolveAnalysisSymbols("NASDAQ:GGAL");
  assert.equal(a.local, "BCBA:GGAL");
  assert.equal(b.local, "NASDAQ:GGAL");
  // ambos normalizan base GGAL pero local preserva prefijo original
  assert.equal(a.base, "GGAL");
  assert.equal(b.base, "GGAL");
});

// Market inválido → throw
test("market inválido → Error", () => {
  assert.throws(() => resolveAnalysisSymbols("GGAL", "bonds" as never), /Mercado inválido/);
  assert.throws(() => resolveAnalysisSymbols("GGAL", "us" as never), /Mercado inválido/);
});

// Input object form {symbol, market}
test("input object {symbol, market} → igual que firma (symbol, market)", () => {
  const r1 = resolveAnalysisSymbols({ symbol: "GGAL", market: "bcba" });
  assert.equal(r1.yahoo, "GGAL.BA");
  assert.equal(r1.tv, "BCBA:GGAL");
  const r2 = resolveAnalysisSymbols({ symbol: "AAPL" });
  assert.equal(r2.yahoo, "AAPL");
  assert.equal(r2.tv, "NASDAQ:AAPL");
});

// Case insensitive
test("case insensitive: ggal → GGAL", () => {
  const r = resolveAnalysisSymbols("ggal", "bcba");
  assert.equal(r.base, "GGAL");
  assert.equal(r.yahoo, "GGAL.BA");
});
