import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getConsensus, fetchConsensus, resetConsensusCache } from "../../src/services/analysis/consensus.js";

// Helpers — stub global fetch
function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

// Fixture canónico spec 0.4 / tasks A3-1
// order: Recommend.All, high, low, avg, buy, hold, sell, count, earnings_unix
function tvOkRowD(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
  const base = [0.7, 120.5, 90, 150, 8, 4, 1, 13, 1768000000] as unknown[];
  // overrides by index if needed — not used now
  if (overrides && Object.keys(overrides).length) {
    // allow e.g. {0: 0.2} to override Recommend.All
    for (const [k, v] of Object.entries(overrides)) {
      const idx = Number(k);
      if (!Number.isNaN(idx)) base[idx] = v as never;
    }
  }
  return base;
}

function tvOkResponse(tvSymbol: string, d: unknown[]): object {
  return { totalCount: 1, data: [{ s: tvSymbol, d }] };
}

function unixToIso(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

beforeEach(() => {
  resetConsensusCache();
});

afterEach(() => {
  resetConsensusCache();
});

// ============================================================

test("ok: GGAL bcba → status ok, data con 7 campos, cached false, source tradingview", async () => {
  const restore = stubFetch((url, init) => {
    assert.ok(url.includes("scanner.tradingview.com/global/scan"), `url debe ser global/scan: ${url}`);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert.ok(Array.isArray(body.columns), "columns array");
    assert.ok(body.columns.includes("Recommend.All"));
    assert.ok(body.columns.includes("earnings_release_next_date"));
    assert.deepEqual(body.symbols, { tickers: ["BCBA:GGAL"] });
    assert.deepEqual(body.range, [0, 1]);
    return Response.json(tvOkResponse("BCBA:GGAL", tvOkRowD()));
  });
  try {
    const res = await getConsensus("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.data);
    assert.equal(res.data!.source, "tradingview");
    assert.equal(res.data!.targetHigh, 120.5);
    assert.equal(res.data!.targetLow, 90);
    assert.equal(res.data!.targetAvg, 150);
    assert.equal(res.data!.recommendation, "buy"); // 0.7 >=0.5 → buy (STRONG_BUY)
    assert.deepEqual(res.data!.rating, { buys: 8, holds: 4, sells: 1 });
    assert.equal(res.data!.nextEarningsDate, unixToIso(1768000000));
    assert.equal(res.data!.currency, null);
    // data nunca undefined, siempre T|null
    assert.notEqual(res.data, undefined);
    assert.equal(res.error, undefined);
  } finally {
    restore();
  }
});

test("ok: AAPL nasdaq → tv NASDAQ:AAPL y ok (US)", async () => {
  const restore = stubFetch((url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert.deepEqual(body.symbols, { tickers: ["NASDAQ:AAPL"] });
    // devolver fixture distinto para AAPL
    const d = [0.2, 200, 180, 190, 10, 5, 2, 17, 1770000000] as unknown[];
    return Response.json(tvOkResponse("NASDAQ:AAPL", d));
  });
  try {
    const res = await getConsensus("AAPL", "nasdaq");
    assert.equal(res.status, "ok");
    assert.equal(res.source, "tradingview");
    assert.equal(res.data!.targetHigh, 200);
    assert.equal(res.data!.targetLow, 180);
    assert.equal(res.data!.targetAvg, 190);
    assert.equal(res.data!.recommendation, "overweight"); // 0.2 → overweight
    assert.deepEqual(res.data!.rating, { buys: 10, holds: 5, sells: 2 });
    assert.equal(res.data!.nextEarningsDate, unixToIso(1770000000));
  } finally {
    restore();
  }
});

test("ok: sin market GGAL → BCBA:GGAL (local) y sin market AAPL CEDEAR → NASDAQ:AAPL", async () => {
  const seen: string[] = [];
  const restore = stubFetch((_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    seen.push(body.symbols.tickers[0]);
    return Response.json(tvOkResponse(body.symbols.tickers[0], tvOkRowD()));
  });
  try {
    const r1 = await getConsensus("GGAL");
    assert.equal(r1.status, "ok");
    assert.equal(seen[0], "BCBA:GGAL");
    const r2 = await getConsensus("AAPL");
    assert.equal(r2.status, "ok");
    assert.equal(seen[1], "NASDAQ:AAPL");
  } finally {
    restore();
  }
});

test("alias fetchConsensus export existe y delega a getConsensus", async () => {
  const restore = stubFetch(() => Response.json(tvOkResponse("BCBA:GGAL", tvOkRowD())));
  try {
    assert.equal(typeof fetchConsensus, "function");
    const res = await fetchConsensus("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.ok(res.data);
  } finally {
    restore();
  }
});

test("AnalysisOpts object form {market, signal} → funciona igual", async () => {
  const restore = stubFetch((_, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert.deepEqual(body.symbols, { tickers: ["BCBA:GGAL"] });
    return Response.json(tvOkResponse("BCBA:GGAL", tvOkRowD()));
  });
  try {
    const res = await getConsensus("GGAL", { market: "bcba" });
    assert.equal(res.status, "ok");
  } finally {
    restore();
  }
});

test("vacío: scanner totalCount 0 / data [] → status down, data null, cached false, source tradingview", async () => {
  const restore = stubFetch(() => Response.json({ totalCount: 0, data: [] }));
  try {
    const res = await getConsensus("ZZZZ", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.error);
    assert.equal(res.data, null); // T|null nunca undefined
  } finally {
    restore();
  }
});

test("vacío: fila con todos null → down data null", async () => {
  const restore = stubFetch(() => Response.json(tvOkResponse("BCBA:ZZZZ", [null, null, null, null, null, null, null, null, null])));
  try {
    const res = await getConsensus("ZZZZ", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
  } finally {
    restore();
  }
});

test("429 → status rate_limited, data null, cached false, source tradingview", async () => {
  const restore = stubFetch(() => new Response("rate limit", { status: 429 }));
  try {
    const res = await getConsensus("GGAL", "bcba");
    assert.equal(res.status, "rate_limited");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.error);
  } finally {
    restore();
  }
});

test("red caída (fetch lanza) → down data null (nunca lanza)", async () => {
  const restore = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    const res = await getConsensus("GGAL", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
  } finally {
    restore();
  }
});

test("500 → down data null", async () => {
  const restore = stubFetch(() => new Response("server error", { status: 500 }));
  try {
    const res = await getConsensus("GGAL", "bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
  } finally {
    restore();
  }
});

test("cache hit: 2ª llamada mismo símbolo dentro TTL 60min → cached true sin segundo fetch", async () => {
  let calls = 0;
  const restore = stubFetch(() => {
    calls++;
    return Response.json(tvOkResponse("BCBA:GGAL", tvOkRowD()));
  });
  try {
    const first = await getConsensus("GGAL", "bcba");
    assert.equal(first.cached, false);
    assert.equal(first.status, "ok");
    assert.equal(calls, 1);
    const second = await getConsensus("GGAL", "bcba");
    assert.equal(second.status, "ok");
    assert.equal(second.cached, true);
    assert.deepEqual(second.data, first.data);
    assert.equal(calls, 1, "segunda llamada no debe hacer fetch");
  } finally {
    restore();
  }
});

test("cache key distingue tv symbol: BCBA:GGAL vs NASDAQ:AAPL no colisionan", async () => {
  const restore = stubFetch((_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const sym: string = body.symbols.tickers[0];
    if (sym === "BCBA:GGAL") return Response.json(tvOkResponse(sym, [0.7, 120.5, 90, 150, 8, 4, 1, 13, 1768000000]));
    if (sym === "NASDAQ:AAPL") return Response.json(tvOkResponse(sym, [0.2, 200, 180, 190, 10, 5, 2, 17, 1770000000]));
    return Response.json({ totalCount: 0, data: [] });
  });
  try {
    const ggal = await getConsensus("GGAL", "bcba");
    const aapl = await getConsensus("AAPL", "nasdaq");
    assert.equal(ggal.data!.targetHigh, 120.5);
    assert.equal(aapl.data!.targetHigh, 200);
    // segunda llamada GGAL → cache hit con valor original
    const ggal2 = await getConsensus("GGAL", "bcba");
    assert.equal(ggal2.cached, true);
    assert.equal(ggal2.data!.targetHigh, 120.5);
  } finally {
    restore();
  }
});

test("rating null cuando buys/holds/sells todos null, recommendation mapeado correcto", async () => {
  // Recommend.All 0.05 → hold, rating all null → null
  const d = [0.05, 100, 80, 90, null, null, null, 0, null] as unknown[];
  const restore = stubFetch(() => Response.json(tvOkResponse("BCBA:GGAL", d)));
  try {
    const res = await getConsensus("GGAL", "bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.data!.recommendation, "hold");
    assert.equal(res.data!.rating, null);
    assert.equal(res.data!.nextEarningsDate, null);
    assert.equal(res.data!.targetHigh, 100);
  } finally {
    restore();
  }
});

test("recommendation mapping: thresholds buy/overweight/hold/underweight/sell", async () => {
  const cases: Array<[number, string]> = [
    [0.9, "buy"],
    [0.3, "overweight"],
    [0.0, "hold"],
    [-0.2, "underweight"],
    [-0.8, "sell"],
  ];
  for (const [val, expected] of cases) {
    const d = [val, 100, 80, 90, 1, 1, 1, 3, 1768000000] as unknown[];
    const restore = stubFetch(() => Response.json(tvOkResponse("BCBA:GGAL", d)));
    try {
      // limpiar cache entre iteraciones para evitar hit
      resetConsensusCache();
      const res = await getConsensus("GGAL", "bcba");
      assert.equal(res.data!.recommendation, expected, `Recommend.All ${val} → ${expected}`);
    } finally {
      restore();
    }
  }
});

test("nextEarningsDate unix 0 → null, unix válido → ISO date YYYY-MM-DD", async () => {
  const dZero = [0.7, 100, 80, 90, 1, 1, 1, 3, 0] as unknown[];
  const restore1 = stubFetch(() => Response.json(tvOkResponse("BCBA:GGAL", dZero)));
  try {
    const res = await getConsensus("GGAL", "bcba");
    assert.equal(res.data!.nextEarningsDate, null);
  } finally {
    restore1();
  }
  resetConsensusCache();
  const dValid = [0.7, 100, 80, 90, 1, 1, 1, 3, 1768000000] as unknown[];
  const restore2 = stubFetch(() => Response.json(tvOkResponse("BCBA:GGAL", dValid)));
  try {
    const res = await getConsensus("GGAL", "bcba");
    assert.match(res.data!.nextEarningsDate!, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(res.data!.nextEarningsDate, unixToIso(1768000000));
  } finally {
    restore2();
  }
});
