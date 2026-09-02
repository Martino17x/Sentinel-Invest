import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreProfile, getBucket, QUESTION_WEIGHTS } from "../../../src/services/investorProfile/scoring.js";

test("QUESTION_WEIGHTS 25/30/25/20", () => {
  assert.equal(QUESTION_WEIGHTS.horizon, 0.25);
  assert.equal(QUESTION_WEIGHTS.loss, 0.30);
  assert.equal(QUESTION_WEIGHTS.expIngreso, 0.25);
  assert.equal(QUESTION_WEIGHTS.objetivo, 0.2);
});

test("max → agresivo", () => {
  const r = scoreProfile(Array(12).fill(4));
  assert.equal(r.score, 100);
  assert.equal(r.bucket, "agresivo");
});

test("min → conservador", () => {
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

test("clamp", () => {
  assert.equal(scoreProfile(Array(12).fill(99)).score, 100);
  assert.equal(scoreProfile(Array(12).fill(-10)).score, 0);
});

test("breakdown snapshot", () => {
  const r = scoreProfile([4, 4, 4, 0, 0, 0, 2, 2, 2, 4, 4, 4]);
  assert.deepEqual(r.breakdown, { horizon: 100, loss: 0, expIngreso: 50, objetivo: 100 });
});
