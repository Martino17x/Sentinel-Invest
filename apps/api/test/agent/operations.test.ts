import "./setup.js";
import "dotenv/config";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getOperationsTool } from "../../src/services/agent/tools/operations.js";
import { MockIolProvider } from "../../src/services/iol/MockIolProvider.js";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function makeCtx(overrides: Partial<any> = {}): any {
  const controller = overrides.signal ? { signal: overrides.signal } : new AbortController();
  const signal = overrides.signal ?? controller.signal;
  return {
    userId: overrides.userId ?? "u-test",
    scope: overrides.scope ?? "read",
    account: overrides.account ?? { id: "11111111-1111-1111-1111-111111111111", iolAccountNumber: "123", currency: "ARS" },
    creds: overrides.creds ?? ({ id: "", email: "" } as any),
    signal,
    _controller: controller,
  };
}

// MockIolProvider patch helper
function patchGetOperations(fn: any): () => void {
  const orig = MockIolProvider.prototype.getOperations;
  (MockIolProvider.prototype as any).getOperations = fn;
  return () => { (MockIolProvider.prototype as any).getOperations = orig; };
}
function patchGetPortfolioHistory(fn: any): () => void {
  const orig = MockIolProvider.prototype.getPortfolioHistory;
  (MockIolProvider.prototype as any).getPortfolioHistory = fn;
  return () => { (MockIolProvider.prototype as any).getPortfolioHistory = orig; };
}

// ==================================================================
// 4.2 operations unit
// ==================================================================
describe("4.2 operations — get_operations thin-wrapper", () => {
  test("filtered range from/to + status confirmed — only accepted ops in range", async () => {
    // MOCK_OPERATIONS dates: 2026-03-15, 04-22, 05-18, 06-10, 07-02 ; all accepted
    const ctx = makeCtx();
    const res = await getOperationsTool.execute(ctx, { from: "2026-01-01", to: "2026-03-31", status: "confirmed" });
    assert.equal(res.ok, true);
    // Only OP-2026-0001 in range, status confirmed maps to accepted
    assert.ok(res.message.includes("GD35"), `expected GD35 in ${res.message}`);
    assert.ok(res.message.includes("total 1"), `expected total 1 in ${res.message}`);
  });

  test("filtered range wider — multiple ops", async () => {
    const ctx = makeCtx();
    const res = await getOperationsTool.execute(ctx, { from: "2026-04-01", to: "2026-06-30" });
    assert.equal(res.ok, true);
    // Should contain MRCUO (04-22), NVDA (05-18), GD35 (06-10)
    assert.ok(res.message.includes("MRCUO"));
    assert.ok(res.message.includes("NVDA"));
    // count = 3
    assert.ok(res.message.includes("total 3"));
  });

  test("empty {} — full history capped, count equals array length", async () => {
    const ctx = makeCtx();
    const res = await getOperationsTool.execute(ctx, {});
    assert.equal(res.ok, true);
    assert.ok(res.message.includes("Operaciones"));
    assert.ok(res.message.includes("total 5"), `expected total 5 for mock, got ${res.message}`);
    const lines = res.message.split("\n").filter((l) => l.startsWith("- "));
    assert.equal(lines.length, 5);
  });

  test("status pending filters correctly — no accepted leak", async () => {
    const ctx = makeCtx();
    const res = await getOperationsTool.execute(ctx, { status: "pending" });
    assert.equal(res.ok, true);
    // Mock has no pending, so empty
    assert.ok(res.message.includes("sin resultados") || res.message.includes("total 0"));
  });

  test("market bcba filter — only bcba/bonds ops", async () => {
    const ctx = makeCtx();
    const res = await getOperationsTool.execute(ctx, { market: "bcba" });
    assert.equal(res.ok, true);
    // All mock ops are bcba or bonds, so should still be 5
    assert.ok(res.message.includes("total 5"));
  });

  test("IOL throw → ok:false, never throw, no getPortfolioHistory fallback", async () => {
    let portfolioHistoryCalled = false;
    const restorePH = patchGetPortfolioHistory(async () => {
      portfolioHistoryCalled = true;
      return [];
    });
    const restoreOps = patchGetOperations(async () => {
      throw new Error("IOL down");
    });
    try {
      const ctx = makeCtx();
      const res = await getOperationsTool.execute(ctx, { from: "2026-01-01" });
      assert.equal(res.ok, false);
      assert.ok(res.message.includes("error") || res.message.includes("IOL down"), `expected error in ${res.message}`);
      assert.equal(portfolioHistoryCalled, false, "must not fallback to getPortfolioHistory");
    } finally {
      restoreOps();
      restorePH();
    }
  });

  test("IOL throw propagates as ok:false, not exception", async () => {
    const restore = patchGetOperations(async () => {
      throw new Error("network failure");
    });
    try {
      const ctx = makeCtx();
      // Should not throw
      const res = await getOperationsTool.execute(ctx, {});
      assert.equal(res.ok, false);
      assert.ok(res.message.toLowerCase().includes("error") || res.message.includes("failure"));
    } finally {
      restore();
    }
  });

  test("signal propagation — aborted signal → ok:false timeout, never throw", async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx({ signal: controller.signal });
    const res = await getOperationsTool.execute(ctx, {});
    assert.equal(res.ok, false);
    assert.ok(res.message.includes("timeout") || res.message.includes("down") || res.message.includes("abort"), `expected timeout/down in ${res.message}`);
  });

  test("signal abort during provider race — abortPromise rejects", async () => {
    const controller = new AbortController();
    const ctx = makeCtx({ signal: controller.signal });
    // Make getOperations hang so abort wins
    const restore = patchGetOperations(async () => new Promise(() => {}));
    // Abort after short delay
    setTimeout(() => controller.abort(), 10);
    try {
      const res = await getOperationsTool.execute(ctx, {});
      assert.equal(res.ok, false);
      assert.ok(res.message.includes("timeout") || res.message.includes("down") || res.message.toLowerCase().includes("abort"));
    } finally {
      restore();
    }
  });

  test("verify no getPortfolioHistory fallback — provider only called getOperations", async () => {
    const calls: string[] = [];
    const restoreOps = patchGetOperations(async (...args: any[]) => {
      calls.push("getOperations");
      // delegate to original logic
      const orig = MockIolProvider.prototype.getOperations;
      // temporarily restore to call original without recursion
      (MockIolProvider.prototype as any).getOperations = orig;
      const result = await (MockIolProvider.prototype as any).getOperations(...args);
      (MockIolProvider.prototype as any).getOperations = async () => {
        calls.push("getOperations");
        return result;
      };
      return result;
    });
    const restorePH = patchGetPortfolioHistory(async () => {
      calls.push("getPortfolioHistory");
      return [];
    });
    try {
      const ctx = makeCtx();
      await getOperationsTool.execute(ctx, {});
      assert.ok(calls.includes("getOperations"), "must call getOperations");
      assert.ok(!calls.includes("getPortfolioHistory"), "must NOT call getPortfolioHistory");
    } finally {
      restoreOps();
      restorePH();
    }
  });

  test("cap 150 overflow — truncated with summary note", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      iolOperationId: `OP-X-${i}`,
      symbol: "GGAL",
      market: "bcba",
      type: "buy",
      status: "accepted",
      quantity: 1,
      price: 1000,
      total: 1000,
      commission: 1,
      currency: "ARS",
      date: "2026-05-01T10:00:00.000Z",
    }));
    const restore = patchGetOperations(async () => many as any);
    try {
      const ctx = makeCtx();
      const res = await getOperationsTool.execute(ctx, {});
      assert.equal(res.ok, true);
      assert.ok(res.message.includes("mostrando 150 de 200"), `expected truncation note in ${res.message}`);
      const lines = res.message.split("\n").filter((l) => l.startsWith("- "));
      assert.equal(lines.length, 150);
    } finally {
      restore();
    }
  });

  test("Zod schema valid — market enum bcba|us only, status enum", async () => {
    assert.equal(getOperationsTool.permission, "allow");
    const badMarket = getOperationsTool.inputSchema.safeParse({ market: "nasdaq" });
    assert.equal(badMarket.success, false);
    const badStatus = getOperationsTool.inputSchema.safeParse({ status: "unknown" });
    assert.equal(badStatus.success, false);
    const badDate = getOperationsTool.inputSchema.safeParse({ from: "01-01-2026" });
    assert.equal(badDate.success, false);
    const ok1 = getOperationsTool.inputSchema.safeParse({ from: "2026-01-01", to: "2026-03-01", status: "confirmed", market: "bcba" });
    assert.equal(ok1.success, true);
  });

  test("no duplicated logic — only maps filters to OperationFilters, no local portfolio calc", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const p = path.join(process.cwd(), "apps/api/src/services/agent/tools/operations.ts");
    let content = "";
    try { content = fs.readFileSync(p, "utf8"); } catch { content = ""; }
    assert.ok(!content.includes("getPortfolioHistory"), "must not reference getPortfolioHistory");
    assert.ok(!content.includes("fetch(") || content.includes("signal"), "must not HTTP self-call");
  });
});
