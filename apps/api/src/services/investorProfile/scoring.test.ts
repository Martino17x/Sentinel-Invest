import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreProfile, getBucket, QUESTION_WEIGHTS } from "./scoring.js";

// Pesos documentados 25/30/25/20
test("QUESTION_WEIGHTS suma 1 y valores correctos", () => {
  assert.equal(QUESTION_WEIGHTS.horizon, 0.25);
  assert.equal(QUESTION_WEIGHTS.loss, 0.30);
  assert.equal(QUESTION_WEIGHTS.expIngreso, 0.25);
  assert.equal(QUESTION_WEIGHTS.objetivo, 0.2);
  const sum = Object.values(QUESTION_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("max (4×12) → agresivo >70", () => {
  const r = scoreProfile(Array(12).fill(4));
  assert.equal(r.score, 100);
  assert.equal(r.bucket, "agresivo");
  assert.equal(r.risk_tolerance, "agresivo");
});

test("min (0×12) → conservador <40", () => {
  const r = scoreProfile(Array(12).fill(0));
  assert.equal(r.score, 0);
  assert.equal(r.bucket, "conservador");
});

test("boundaries 39/40/70/71", () => {
  assert.equal(getBucket(39), "conservador");
  assert.equal(getBucket(40), "moderado");
  assert.equal(getBucket(70), "moderado");
  assert.equal(getBucket(71), "agresivo");
});

test("clamp: valores >4 y negativos no rompen 0-100", () => {
  const rHigh = scoreProfile(Array(12).fill(99));
  assert.equal(rHigh.score, 100);
  const rLow = scoreProfile(Array(12).fill(-5));
  assert.equal(rLow.score, 0);
});

test("breakdown 0-100 por grupo", () => {
  const r = scoreProfile([4, 4, 4, 0, 0, 0, 2, 2, 2, 4, 4, 4]);
  assert.equal(r.breakdown.horizon, 100);
  assert.equal(r.breakdown.loss, 0);
  assert.equal(r.breakdown.expIngreso, 50);
  assert.equal(r.breakdown.objetivo, 100);
});

test("investorProfileScoring alias expone risk_score y horizon", () => {
  const r = scoreProfile([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
  assert.ok(r.risk_score >= 0 && r.risk_score <= 100);
  assert.ok(["corto", "medio", "largo"].includes(r.horizon));
  assert.ok(r.loss_tolerance_pct >= 5 && r.loss_tolerance_pct <= 40);
});
