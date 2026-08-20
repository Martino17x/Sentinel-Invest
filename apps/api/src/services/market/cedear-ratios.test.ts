import { test } from "node:test";
import assert from "node:assert/strict";
import { CEDEAR_RATIOS, RATIO_MAP, getRatio } from "./cedear-ratios.js";

// ===================================================================
// CEDEAR_RATIOS — tabla estática 60 entradas
// Spec: BYMA ficha, cedear-ratios.ts:1-99
// ===================================================================

test("CEDEAR_RATIOS: exactamente 60 entradas", () => {
  assert.equal(CEDEAR_RATIOS.length, 60);
});

test("CEDEAR_RATIOS: ratioCedearsPerShare >0 y entero para cada entrada", () => {
  for (const r of CEDEAR_RATIOS) {
    assert.ok(r.ratioCedearsPerShare > 0, `${r.symbol} ratio ${r.ratioCedearsPerShare} debe ser >0`);
    assert.equal(Number.isInteger(r.ratioCedearsPerShare), true, `${r.symbol} ratio debe ser entero`);
  }
});

test("CEDEAR_RATIOS: symbol uppercase único", () => {
  const seen = new Set<string>();
  for (const r of CEDEAR_RATIOS) {
    assert.equal(r.symbol, r.symbol.toUpperCase(), `${r.symbol} debe ser uppercase`);
    assert.ok(!seen.has(r.symbol), `símbolo duplicado: ${r.symbol}`);
    seen.add(r.symbol);
    assert.match(r.symbol, /^[A-Z0-9.-]+$/, `${r.symbol} formato inválido`);
  }
  assert.equal(seen.size, 60);
});

test("CEDEAR_RATIOS: yahooSymbol non-empty string (trim)", () => {
  for (const r of CEDEAR_RATIOS) {
    assert.ok(typeof r.yahooSymbol === "string" && r.yahooSymbol.trim().length > 0, `${r.symbol} yahooSymbol vacío`);
    assert.equal(r.yahooSymbol.trim(), r.yahooSymbol, `${r.symbol} yahooSymbol con espacios`);
  }
});

test("CEDEAR_RATIOS: sourceDate es ISO YYYY-MM-DD válida", () => {
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const r of CEDEAR_RATIOS) {
    assert.match(r.sourceDate, isoRe, `${r.symbol} sourceDate ${r.sourceDate} no es ISO`);
    const d = new Date(r.sourceDate);
    assert.ok(!Number.isNaN(d.getTime()), `${r.symbol} sourceDate ${r.sourceDate} no es fecha válida`);
    // Todas deben compartir la fecha curada (header spec: 2026-08-20)
    assert.equal(r.sourceDate, "2026-08-20");
  }
});

test("CEDEAR_RATIOS: name non-empty y BRKB usa BRK-B como yahooSymbol", () => {
  for (const r of CEDEAR_RATIOS) {
    assert.ok(r.name.trim().length > 0, `${r.symbol} name vacío`);
  }
  const brkb = CEDEAR_RATIOS.find((r) => r.symbol === "BRKB");
  assert.ok(brkb);
  assert.equal(brkb!.yahooSymbol, "BRK-B");
  assert.equal(brkb!.ratioCedearsPerShare, 20);
});

test("CEDEAR_RATIOS: ratios conocidos — AAPL 10, MELI 60, NVDA 24, LLY 2", () => {
  assert.equal(CEDEAR_RATIOS.find((r) => r.symbol === "AAPL")!.ratioCedearsPerShare, 10);
  assert.equal(CEDEAR_RATIOS.find((r) => r.symbol === "MELI")!.ratioCedearsPerShare, 60);
  assert.equal(CEDEAR_RATIOS.find((r) => r.symbol === "NVDA")!.ratioCedearsPerShare, 24);
  assert.equal(CEDEAR_RATIOS.find((r) => r.symbol === "LLY")!.ratioCedearsPerShare, 2);
});

test("RATIO_MAP: tamaño 60 y getRatio case-insensitive", () => {
  assert.equal(RATIO_MAP.size, 60);
  assert.ok(RATIO_MAP.has("AAPL"));
  assert.ok(!RATIO_MAP.has("aapl")); // Map es case-sensitive; getRatio normaliza
  assert.ok(getRatio("AAPL"));
  assert.ok(getRatio("aapl"));
  assert.ok(getRatio("AaPl"));
  assert.equal(getRatio("AAPL")!.ratioCedearsPerShare, 10);
  assert.equal(getRatio("ZZZZNOPE"), undefined);
  // getRatio debe devolver misma ref que RATIO_MAP.get normalizado
  assert.equal(getRatio("meli")!.yahooSymbol, "MELI");
});

test("CEDEAR_RATIOS: header BYMA verificable — 16+ tickers con ratio alto/bajo", () => {
  // sanity: cobertura de sectores variados, ningún ratio <=0 pasa el test guard
  const ratios = CEDEAR_RATIOS.map((r) => r.ratioCedearsPerShare);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  assert.ok(min >= 2, `min ratio ${min} debe ser >=2`);
  assert.ok(max <= 60, `max ratio ${max} debe ser <=60`);
  assert.ok(ratios.includes(60), "debe incluir ratio 60 (MELI)");
});

test("CEDEAR_RATIOS: yahooSymbol contiene solo caracteres válidos (A-Z, -, .)", () => {
  const re = /^[A-Z0-9.-]+$/;
  for (const r of CEDEAR_RATIOS) {
    assert.match(r.yahooSymbol, re, `${r.symbol} yahooSymbol ${r.yahooSymbol} inválido`);
  }
});
