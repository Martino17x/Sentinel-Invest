import { test } from "node:test";
import assert from "node:assert/strict";
import { macd, positionIn52w, rsi, sma, volumeRatio } from "../../src/services/market/indicators.js";

const rising = Array.from({ length: 40 }, (_, i) => 100 + i); // 40 barras subiendo
const falling = Array.from({ length: 40 }, (_, i) => 240 - i); // 40 barras bajando
const flat = Array.from({ length: 50 }, () => 100);

// ============================================================
// SMA
// ============================================================

test("sma: promedio de los últimos n valores", () => {
  assert.equal(sma([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3), 9); // (8+9+10)/3
  assert.equal(sma([5, 10], 2), 7.5);
});

test("sma: null con datos insuficientes", () => {
  assert.equal(sma([1, 2], 3), null);
  assert.equal(sma([], 1), null);
});

// ============================================================
// RSI (Wilder)
// ============================================================

test("rsi: serie monótona creciente → 100", () => {
  assert.equal(rsi(rising), 100);
});

test("rsi: serie monótona decreciente → 0", () => {
  assert.equal(rsi(falling), 0);
});

test("rsi: valor conocido Wilder (period=3) — [10,11,9,12,8,13,7,14] → 64.21", () => {
  const prices = [10, 11, 9, 12, 8, 13, 7, 14];
  // avgGain/avgLoss Wilder con seed SMA(3):
  //   avgGain₀=4/3, avgLoss₀=2/3 → ... → RS=811/452 → RSI=100-100/(1+811/452)≈64.21
  assert.ok(rsi(prices, 3) !== null);
  assert.ok(Math.abs((rsi(prices, 3) as number) - 64.2122) < 0.01);
});

test("rsi: null con menos de 2×periodo+2 barras", () => {
  assert.equal(rsi(Array.from({ length: 29 }, (_, i) => i + 1)), null);
  assert.equal(rsi([1, 2, 3]), null);
});

test("rsi: serie plana → 50 (ni ganancias ni pérdidas)", () => {
  assert.equal(rsi(flat), 50);
});

// ============================================================
// MACD (12/26/9)
// ============================================================

test("macd: serie constante → macd=signal=histograma=0", () => {
  const result = macd(flat);
  assert.ok(result);
  assert.ok(Math.abs(result.macd) < 1e-9);
  assert.ok(Math.abs(result.signal) < 1e-9);
  assert.ok(Math.abs(result.histogram) < 1e-9);
});

test("macd: uptrend → histograma positivo, downtrend → negativo", () => {
  // Convexo al alza (pendiente creciente) → MACD en expansión → hist > 0.
  // Cóncavo a la baja (pendiente cada vez más negativa) → hist < 0.
  // (Una rampa lineal da MACD constante → hist ≈ 0, correcto pero inútil para el assert.)
  const up = macd(Array.from({ length: 60 }, (_, i) => 100 * 1.02 ** i));
  const down = macd(Array.from({ length: 60 }, (_, i) => 1000 - (i * i) / 10));
  assert.ok(up && up.histogram > 0);
  assert.ok(down && down.histogram < 0);
});

test("macd: null con menos de slow+signal−1 barras (34)", () => {
  assert.equal(macd(Array.from({ length: 33 }, (_, i) => i + 1)), null);
  assert.ok(macd(Array.from({ length: 34 }, (_, i) => i + 1))); // con 34 barras vale la señal
});

test("macd: prevHistogram null con 34 barras, disponible con 35", () => {
  const atMin = macd(Array.from({ length: 34 }, (_, i) => i + 1));
  assert.ok(atMin);
  assert.equal(atMin.prevHistogram, null); // la señal EMA9 recién arranca en la última barra

  const full = macd(Array.from({ length: 35 }, (_, i) => i + 1));
  assert.ok(full);
  assert.ok(Number.isFinite(full.prevHistogram as number));
});

// ============================================================
// volumeRatio
// ============================================================

test("volumeRatio: últimos 5 días vs 20 previos", () => {
  const volumes = [...Array(20).fill(100), ...Array(5).fill(200)];
  assert.equal(volumeRatio(volumes), 2);
});

test("volumeRatio: null con menos de 25 barras", () => {
  assert.equal(volumeRatio(Array(24).fill(100)), null);
});

// ============================================================
// positionIn52w
// ============================================================

test("positionIn52w: posición lineal 0..1 con clamp", () => {
  assert.equal(positionIn52w(100, 50, 150), 0.5);
  assert.equal(positionIn52w(50, 50, 150), 0);
  assert.equal(positionIn52w(150, 50, 150), 1);
  assert.equal(positionIn52w(200, 50, 150), 1); // clamp
  assert.equal(positionIn52w(0, 50, 150), 0); // clamp
});

test("positionIn52w: null si el rango es inválido", () => {
  assert.equal(positionIn52w(100, 150, 50), null);
  assert.equal(positionIn52w(100, 50, 50), null);
  assert.equal(positionIn52w(100, NaN, 150), null);
});
