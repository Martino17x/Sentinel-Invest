import { test } from "node:test";
import assert from "node:assert/strict";
import { calcCcl, calcPromedio, calcMedianCcl, calcSpread } from "../../src/services/market/ccl.js";

// ===================================================================
// calcCcl — CCL = cedearArs * ratio / underlyingUsd
// Spec: apps/api/src/services/market/ccl.ts:25-35
// ===================================================================

test("calcCcl: AAPL 32100*10/230 ≈ 1395.65 ±0.01", () => {
  const ccl = calcCcl(32_100, 230, 10);
  assert.ok(ccl !== null);
  assert.ok(Math.abs(ccl! - 1395.6521739130435) < 0.01, `AAPL ccl ${ccl} fuera de tolerancia`);
  // también ±0.01 respecto de 1395.65 redondeado
  assert.ok(Math.abs(ccl! - 1395.65) < 0.02);
});

test("calcCcl: GGAL 4820*10/36 ≈ 1338.88 ±0.01", () => {
  const ccl = calcCcl(4820, 36, 10);
  assert.ok(ccl !== null);
  assert.ok(Math.abs(ccl! - 1338.8888888888888) < 0.01);
});

test("calcCcl: underlyingUsd === 0 → null", () => {
  assert.equal(calcCcl(1000, 0, 10), null);
});

test("calcCcl: ratio <= 0 → null (0 y negativo)", () => {
  assert.equal(calcCcl(1000, 100, 0), null);
  assert.equal(calcCcl(1000, 100, -5), null);
});

test("calcCcl: inputs no finitos → null (NaN, Infinity, -Infinity)", () => {
  assert.equal(calcCcl(NaN, 100, 10), null);
  assert.equal(calcCcl(1000, Infinity, 10), null);
  assert.equal(calcCcl(1000, 100, Infinity), null);
  assert.equal(calcCcl(Infinity, 100, 10), null);
});

test("calcCcl: cedearArs 0 → 0 (precio 0 no es null, solo no se usa en radar)", () => {
  assert.equal(calcCcl(0, 100, 10), 0);
});

// ===================================================================
// calcPromedio / calcMedianCcl — mediana de CCLs válidos
// ===================================================================

test("calcPromedio: lista vacía → null", () => {
  assert.equal(calcPromedio([]), null);
  assert.equal(calcMedianCcl([]), null);
});

test("calcPromedio: filtra no-finitos (NaN/Infinity) antes de mediana", () => {
  assert.equal(calcPromedio([NaN, Infinity, 100, 200]), 150);
});

test("calcPromedio: impar → elemento central ordenado", () => {
  // [100,200,300] → 200 ; desordenado también
  assert.equal(calcPromedio([300, 100, 200]), 200);
  assert.equal(calcPromedio([1395.65, 1338.88, 1500]), 1395.65);
});

test("calcPromedio: par → promedio de los dos centrales", () => {
  assert.equal(calcPromedio([100, 200]), 150);
  assert.equal(calcPromedio([200, 100, 300, 400]), 250);
  // caso real: AAPL 1395.65 + GGAL 1338.88 → mediana par = (1338.88+1395.65)/2 ≈1367.26
  const median2 = calcPromedio([1395.65, 1338.88]);
  assert.ok(Math.abs(median2! - 1367.265) < 0.01);
});

test("calcPromedio: single → ese valor", () => {
  assert.equal(calcPromedio([42]), 42);
});

test("calcMedianCcl alias idéntico a calcPromedio", () => {
  assert.equal(calcMedianCcl, calcPromedio);
  const a = [1, 2, 3];
  assert.equal(calcMedianCcl(a), calcPromedio(a));
});

// ===================================================================
// calcSpread — (ccl - promedio)/promedio*100
// ===================================================================

test("calcSpread: positivo — por encima del promedio", () => {
  // ccl 1395.65 vs promedio 1367.26 → +2.07%
  const spread = calcSpread(1395.65, 1367.265);
  assert.ok(spread !== null);
  assert.ok(spread! > 0, `spread ${spread} debería ser positivo`);
  assert.ok(Math.abs(spread! - 2.07) < 0.05);
});

test("calcSpread: negativo — por debajo del promedio", () => {
  const spread = calcSpread(1338.88, 1367.265);
  assert.ok(spread! < 0);
  assert.ok(Math.abs(spread! - -2.07) < 0.05);
});

test("calcSpread: cero cuando ccl === promedio", () => {
  assert.equal(calcSpread(1000, 1000), 0);
});

test("calcSpread: promedio 0 → null (división por cero)", () => {
  assert.equal(calcSpread(1000, 0), null);
});

test("calcSpread: inputs no finitos → null", () => {
  assert.equal(calcSpread(NaN, 1000), null);
  assert.equal(calcSpread(1000, NaN), null);
  assert.equal(calcSpread(Infinity, 1000), null);
  assert.equal(calcSpread(1000, Infinity), null);
});

test("calcSpread: porcentaje simétrico verificado", () => {
  // 110 vs 100 → +10%
  assert.equal(calcSpread(110, 100), 10);
  // 90 vs 100 → -10%
  assert.equal(calcSpread(90, 100), -10);
  // 150 vs 100 → +50%
  assert.equal(calcSpread(150, 100), 50);
});

