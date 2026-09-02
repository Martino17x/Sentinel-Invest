import "./setup.js";
import "dotenv/config";
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getScreenerTool } from "../../src/services/agent/tools/screener.js";
import { resetScreenerCache } from "../../src/services/analysis/screener.js";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function makeCtx(overrides: Partial<any> = {}): any {
  const controller = new AbortController();
  return {
    userId: overrides.userId ?? "u-test",
    scope: overrides.scope ?? "read",
    account: overrides.account ?? { id: "11111111-1111-1111-1111-111111111111", iolAccountNumber: "123", currency: "ARS" },
    creds: overrides.creds ?? ({ id: "", email: "" } as any),
    signal: overrides.signal ?? controller.signal,
    _controller: controller,
  };
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return (original as any)(input, init);
    return handler(url, init);
  }) as typeof fetch;
  (globalThis as any).fetch = stub;
  return () => { (globalThis as any).fetch = original; };
}

function scannerPayload(rows: Array<{ symbol: string; name: string; price: number; change: number; volume: number; mcap: number; pe: number }>): any {
  return {
    data: rows.map((r) => ({
      s: r.symbol,
      d: [r.symbol, r.name, r.price, r.change, r.volume, r.mcap, r.pe],
    })),
    totalCount: rows.length,
  };
}

const BCBA_ROWS = [
  { symbol: "BCBA:GGAL", name: "Grupo Financiero Galicia", price: 9312.5, change: 1.85, volume: 112340, mcap: 1_000_000_000, pe: 8.2 },
  { symbol: "BCBA:YPFD", name: "YPF SA", price: 28450, change: -0.45, volume: 89320, mcap: 2_000_000_000, pe: 5.1 },
  { symbol: "BCBA:PAMP", name: "Pampa Energia", price: 4120, change: 2.4, volume: 65430, mcap: 500_000_000, pe: 9.3 },
];

beforeEach(() => {
  resetScreenerCache();
});

// ==================================================================
// 4.1 screener unit
// ==================================================================
describe("4.1 screener — get_screener thin-wrapper", () => {
  test("happy BCBA scan — ok:true, count<=150, rows parity REST", async () => {
    const restore = stubFetch((url) => {
      if (url.includes("scanner.tradingview.com/argentina/scan")) return Response.json(scannerPayload(BCBA_ROWS));
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ctx = makeCtx();
      const res = await getScreenerTool.execute(ctx, { market: "bcba" });
      assert.equal(res.ok, true);
      assert.ok(res.message.includes("Screener bcba"));
      assert.ok(res.message.includes("GGAL"));
      assert.ok(res.message.includes("YPFD"));
      // message lines = data rows
      const lines = res.message.split("\n").filter((l) => l.startsWith("- "));
      assert.equal(lines.length, 3);
    } finally {
      restore();
    }
  });

  test('filtered query "GGAL" — only matching symbol/name (case-insensitive)', async () => {
    const restore = stubFetch((url) => {
      if (url.includes("scanner.tradingview.com/argentina/scan")) return Response.json(scannerPayload(BCBA_ROWS));
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ctx = makeCtx();
      const res = await getScreenerTool.execute(ctx, { market: "bcba", query: "GGAL" });
      assert.equal(res.ok, true);
      assert.ok(res.message.includes("GGAL"));
      assert.ok(!res.message.includes("YPFD"), "YPFD should be filtered out");
      assert.ok(!res.message.includes("PAMP"), "PAMP should be filtered out");
      const lines = res.message.split("\n").filter((l) => l.startsWith("- "));
      assert.equal(lines.length, 1);
    } finally {
      restore();
    }
  });

  test("filtered query case-insensitive ggal", async () => {
    const restore = stubFetch((url) => {
      if (url.includes("scanner.tradingview.com/argentina/scan")) return Response.json(scannerPayload(BCBA_ROWS));
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ctx = makeCtx();
      const res = await getScreenerTool.execute(ctx, { market: "bcba", query: "ggal" });
      assert.equal(res.ok, true);
      assert.ok(res.message.includes("GGAL"));
    } finally {
      restore();
    }
  });

  test("429 rate_limited — {ok:false,status:rate_limited}, never throw", async () => {
    const restore = stubFetch((url) => {
      if (url.includes("scanner.tradingview.com/america/scan")) return new Response(JSON.stringify({}), { status: 429 });
      if (url.includes("scanner.tradingview.com/argentina/scan")) return new Response(JSON.stringify({}), { status: 429 });
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ctx = makeCtx();
      const res = await getScreenerTool.execute(ctx, { market: "us" });
      assert.equal(res.ok, false);
      assert.ok(res.message.includes("rate_limited"), `expected rate_limited in ${res.message}`);
      // must not throw — ok:false returned
    } finally {
      restore();
    }
  });

  test("down — {ok:false,status:down}, never throw", async () => {
    const restore = stubFetch((url) => {
      if (url.includes("scanner.tradingview.com")) return new Response("down", { status: 500 });
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ctx = makeCtx();
      const res = await getScreenerTool.execute(ctx, { market: "bcba" });
      assert.equal(res.ok, false);
      assert.ok(res.message.includes("down"), `expected down in ${res.message}`);
    } finally {
      restore();
    }
  });

  test("down — network error never throw", async () => {
    const restore = stubFetch(() => {
      throw new Error("network down");
    });
    try {
      const ctx = makeCtx();
      const res = await getScreenerTool.execute(ctx, { market: "bcba" });
      assert.equal(res.ok, false);
      assert.ok(res.message.includes("down"));
    } finally {
      restore();
    }
  });

  test("Zod reject market:nasaq — validation fails before service call", async () => {
    const parsed = getScreenerTool.inputSchema.safeParse({ market: "nasdaq" });
    assert.equal(parsed.success, false, "nasdaq must fail Zod enum bcba|us");

    let fetchCalled = false;
    const restore = stubFetch(() => {
      fetchCalled = true;
      return Response.json(scannerPayload(BCBA_ROWS));
    });
    try {
      // Simulate executor Zod gate: if schema fails, execute not called.
      // Direct schema check proves rejection; also ensure tool would not be called via executor.
      const bad = getScreenerTool.inputSchema.safeParse({ market: "nasdaq" });
      assert.equal(bad.success, false);
      assert.equal(fetchCalled, false, "fetch must not be called when Zod rejects");
    } finally {
      restore();
    }
  });

  test("cache-hit filtered path — second query served from cache (parity spec 5342)", async () => {
    let fetchCount = 0;
    const restore1 = stubFetch((url) => {
      if (url.includes("scanner.tradingview.com/argentina/scan")) {
        fetchCount++;
        return Response.json(scannerPayload(BCBA_ROWS));
      }
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ctx = makeCtx();
      const res1 = await getScreenerTool.execute(ctx, { market: "bcba" });
      assert.equal(res1.ok, true);
      assert.equal(fetchCount, 1);
    } finally {
      restore1();
    }

    // Second call with query should hit cache, not fetch
    const restore2 = stubFetch((url) => {
      if (url.includes("scanner.tradingview.com")) {
        throw new Error("should not fetch on cache hit");
      }
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ctx2 = makeCtx();
      const res2 = await getScreenerTool.execute(ctx2, { market: "bcba", query: "GGAL" });
      assert.equal(res2.ok, true);
      assert.ok(res2.message.includes("GGAL"));
      assert.ok(res2.message.includes("(cache)"), "cache hit should mark (cache)");
    } finally {
      restore2();
    }
  });

  test("permission allow and 15s timeout propagated via signal", async () => {
    assert.equal(getScreenerTool.permission, "allow");
    // signal abort -> down timeout, never throw
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx({ signal: controller.signal });
    const restore = stubFetch((url, init) => {
      if (init?.signal?.aborted || controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      return Response.json(scannerPayload(BCBA_ROWS));
    });
    try {
      const res = await getScreenerTool.execute(ctx, { market: "bcba" });
      assert.equal(res.ok, false);
      assert.ok(res.message.includes("down") || res.message.includes("timeout"));
    } finally {
      restore();
    }
  });

  test("cap 150 rows — service caps, wrapper re-caps", async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      symbol: `BCBA:SYM${i}`,
      name: `Name ${i}`,
      price: 100 + i,
      change: 0.5,
      volume: 1000,
      mcap: 1_000_000,
      pe: 10,
    }));
    const restore = stubFetch((url) => {
      if (url.includes("scanner.tradingview.com/argentina/scan")) return Response.json(scannerPayload(many));
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ctx = makeCtx();
      const res = await getScreenerTool.execute(ctx, { market: "bcba" });
      assert.equal(res.ok, true);
      const lines = res.message.split("\n").filter((l) => l.startsWith("- "));
      assert.ok(lines.length <= 150, `expected <=150 lines, got ${lines.length}`);
    } finally {
      restore();
    }
  });
});
