import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreSignal, SIGNAL_WEIGHTS, type SignalInput } from "../../src/services/market/signal.js";

function base(): SignalInput {
  return {
    price: 100,
    sma50: 90,
    sma200: 80,
    rsi: 40,
    macd: { macd: 1, signal: 0.5, histogram: 0.5, prevHistogram: 0.3 },
    volumeRatio: 1.2,
    position52w: 0.8,
  };
}

test("fixture alcista → score ≥ 60 (bullish)", () => {
  const result = scoreSignal(base());
  assert.ok(result);
  // trend 100 (arriba de ambas SMA + golden) · macd 75 · rsi 75 · week52 80 · volume 100
  // 0.3*100 + 0.25*75 + 0.2*75 + 0.15*80 + 0.1*100 = 85.75
  assert.ok(Math.abs(result.score - 85.75) < 0.01);
  assert.equal(result.verdict, "bullish");
  assert.equal(result.breakdown.length, 5);
  for (const f of result.breakdown) {
    assert.equal(f.weight, SIGNAL_WEIGHTS[f.id]); // pesos originales en el breakdown
  }
});

test("fixture bajista → score ≤ 40 (bearish)", () => {
  const input = base();
  input.price = 80;
  input.sma50 = 90;
  input.sma200 = 100;
  input.rsi = 60;
  input.macd = { macd: -1, signal: -0.5, histogram: -0.5, prevHistogram: -0.3 };
  input.volumeRatio = 0.5;
  input.position52w = 0.2;

  const result = scoreSignal(input);
  assert.ok(result);
  // trend 0 (abajo de ambas SMA + death) · macd 25 · rsi 25 · week52 20 · volume 50
  // 0 + 6.25 + 5 + 3 + 5 = 19.25
  assert.ok(Math.abs(result.score - 19.25) < 0.01);
  assert.equal(result.verdict, "bearish");
});

test("fixture neutral → 40 < score < 60", () => {
  const input = base();
  input.price = 100;
  input.sma50 = 100;
  input.sma200 = 100; // sin golden ni death (iguales)
  input.rsi = 50;
  input.position52w = 0.5;

  const result = scoreSignal(input);
  assert.ok(result);
  // trend: 0.5*50 + 0.3*50 + 0.2*0 = 40 · macd 75 · rsi 50 · week52 50 · volume 100
  // 12 + 18.75 + 10 + 7.5 + 10 = 58.25
  assert.ok(Math.abs(result.score - 58.25) < 0.01);
  assert.equal(result.verdict, "neutral");
});

test("RSI > 70 → 0 (sobrecompra), < 30 → 100 (sobreventa), lineal entre 30 y 70", () => {
  const overbought = base();
  overbought.rsi = 75;
  const obFactor = scoreSignal(overbought)?.breakdown.find((f) => f.id === "rsi");
  assert.equal(obFactor?.score, 0);

  const oversold = base();
  oversold.rsi = 25;
  const osFactor = scoreSignal(oversold)?.breakdown.find((f) => f.id === "rsi");
  assert.equal(osFactor?.score, 100);

  const mid = base();
  mid.rsi = 50;
  const midFactor = scoreSignal(mid)?.breakdown.find((f) => f.id === "rsi");
  assert.equal(midFactor?.score, 50);
});

test("cruces MACD: hist pasa de negativo a positivo → 100; de positivo a negativo → 0", () => {
  const bullishCross = base();
  bullishCross.macd = { macd: 1, signal: 0.5, histogram: 0.5, prevHistogram: -0.2 };
  const up = scoreSignal(bullishCross)?.breakdown.find((f) => f.id === "macd");
  assert.equal(up?.score, 100); // dirección 50 + cruce 50

  const bearishCross = base();
  bearishCross.macd = { macd: -1, signal: -0.5, histogram: -0.5, prevHistogram: 0.2 };
  const down = scoreSignal(bearishCross)?.breakdown.find((f) => f.id === "macd");
  assert.equal(down?.score, 0); // dirección 0 + cruce 0
});

test("factor null → se omite y los pesos se renormaizan (score sigue 0..100)", () => {
  const input = base();
  input.sma50 = null;
  input.sma200 = null; // trend solo por golden cross? no: ambos null → trend null
  input.rsi = null;
  input.volumeRatio = null;
  input.position52w = null;

  const result = scoreSignal(input);
  assert.ok(result);
  // solo macd (peso .25) → renorm a 1 → score = 75
  assert.ok(Math.abs(result.score - 75) < 0.01);
  assert.equal(result.breakdown.length, 1);
  assert.equal(result.breakdown[0].weight, SIGNAL_WEIGHTS.macd); // peso original, no renorm

  const two = base();
  two.sma200 = null; // trend: solo vsSMA50 (50% renorm dentro del factor)
  two.rsi = null;
  two.volumeRatio = null;
  two.position52w = null;
  const result2 = scoreSignal(two);
  assert.ok(result2);
  // trend: 100 (solo vsSMA50) · macd 75 → renorm .3/.55 · score = (30 + 18.75)/0.55 ≈ 88.64
  assert.ok(Math.abs(result2.score - 88.636) < 0.1);
});

test("sin ningún factor → null", () => {
  assert.equal(scoreSignal({ price: null, sma50: null, sma200: null, rsi: null, macd: null, volumeRatio: null, position52w: null }), null);
});

test("SMA20 no participa de la señal (solo display)", () => {
  const with20 = base();
  with20.sma50 = null;
  with20.sma200 = null;
  const result = scoreSignal(with20);
  assert.ok(result);
  assert.ok(!result.breakdown.some((f) => f.id === "sma20"));
});
