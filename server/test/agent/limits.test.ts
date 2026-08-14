import { test } from "node:test";
import assert from "node:assert/strict";
import { createMcpRateLimiter } from "../../src/mcp/limits.js";

test("rate limit: bucket general 30/min — la 31ra falla con retryAfter", () => {
  const limiter = createMcpRateLimiter();
  const now = 1_000_000;
  for (let i = 0; i < 30; i++) {
    assert.equal(limiter.check("key-a", false, now).allowed, true, `request ${i + 1}`);
  }
  const verdict = limiter.check("key-a", false, now);
  assert.equal(verdict.allowed, false);
  assert.ok(verdict.retryAfterSeconds >= 1);
});

test("rate limit: keys independientes (aislamiento por key)", () => {
  const limiter = createMcpRateLimiter({ generalPerMinute: 2 });
  const now = 2_000_000;
  assert.equal(limiter.check("key-a", false, now).allowed, true);
  assert.equal(limiter.check("key-a", false, now).allowed, true);
  assert.equal(limiter.check("key-a", false, now).allowed, false);
  assert.equal(limiter.check("key-b", false, now).allowed, true, "otra key no se contamina");
});

test("rate limit: bucket de trading 5/min ADICIONAL al general", () => {
  const limiter = createMcpRateLimiter({ generalPerMinute: 10, tradePerMinute: 5 });
  const now = 3_000_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(limiter.check("key-t", true, now).allowed, true, `trade ${i + 1}`);
  }
  // El 6to tools/call trade falla aunque el bucket general siga lleno
  const tradeVerdict = limiter.check("key-t", true, now);
  assert.equal(tradeVerdict.allowed, false);
  assert.ok(tradeVerdict.retryAfterSeconds >= 1);
  // Las llamadas read siguen pasando por el bucket general
  assert.equal(limiter.check("key-t", false, now).allowed, true);
});

test("rate limit: refill con el tiempo (1 token por ventana)", () => {
  const limiter = createMcpRateLimiter({ generalPerMinute: 2 }); // 1 token cada 30s
  const now = 4_000_000;
  assert.equal(limiter.check("key-r", false, now).allowed, true);
  assert.equal(limiter.check("key-r", false, now).allowed, true);
  assert.equal(limiter.check("key-r", false, now).allowed, false, "bucket vacío");
  // 30 segundos después → se regeneró 1 token
  assert.equal(limiter.check("key-r", false, now + 30_000).allowed, true);
  assert.equal(limiter.check("key-r", false, now + 30_100).allowed, false);
});

test("rate limit: reset drena todos los buckets", () => {
  const limiter = createMcpRateLimiter({ generalPerMinute: 1 });
  assert.equal(limiter.check("key-x", false, 5_000_000).allowed, true);
  assert.equal(limiter.check("key-x", false, 5_000_000).allowed, false);
  limiter.reset();
  assert.equal(limiter.check("key-x", false, 5_000_000).allowed, true);
});
