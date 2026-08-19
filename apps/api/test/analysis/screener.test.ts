import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getScreener, fetchScreener, resetScreenerCache } from "../../src/services/analysis/screener.js";

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function scannerResponse(rows: unknown[][]): object {
  return {
    totalCount: rows.length,
    data: rows.map((d) => ({ d })),
  };
}

// 7-col fixture: name, description, close, change, volume, market_cap_basic, pe
function screenerRow7(symbol: string, name: string, price: number, change: number, volume: number, marketCap: number, pe: number | null): unknown[] {
  return [symbol, name, price, change, volume, marketCap, pe];
}

beforeEach(() => {
  resetScreenerCache();
});

afterEach(() => {
  resetScreenerCache();
});

// ============================================================

test("ok: bcba → argentina/scan, rows mapeados 7 cols, cached false, source tradingview", async () => {
  const restore = stubFetch((url, init) => {
    assert.ok(url.includes("scanner.tradingview.com/argentina/scan"), `esperaba argentina/scan: ${url}`);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body ?? "{}"));
    assert.ok(Array.isArray(body.columns), "columns array");
    assert.ok(body.columns.includes("name"));
    assert.ok(body.columns.includes("close"));
    assert.ok(body.columns.includes("market_cap_basic"));
    assert.deepEqual(body.range, [0, 150]);
    return Response.json(
      scannerResponse([
        screenerRow7("BCBA:GGAL", "Grupo Financiero Galicia", 45.2, 1.5, 1_000_000, 5_000_000_000, 12.3),
        screenerRow7("BCBA:YPFD", "YPF SA", 120.5, -0.8, 2_000_000, 8_000_000_000, null),
      ]),
    );
  });
  try {
    const res = await getScreener("bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.data);
    assert.equal(res.data!.length, 2);
    const row = res.data![0];
    assert.equal(row.symbol, "BCBA:GGAL");
    assert.equal(row.name, "Grupo Financiero Galicia");
    assert.equal(row.market, "bcba");
    assert.equal(row.price, 45.2);
    assert.equal(row.changePct, 1.5);
    assert.equal(row.volume, 1_000_000);
    assert.equal(row.marketCap, 5_000_000_000);
    assert.equal(row.pe, 12.3);
    assert.equal(res.data![1].pe, null);
    assert.equal(res.data![1].changePct, -0.8);
  } finally {
    restore();
  }
});

test("ok: us → america/scan", async () => {
  const restore = stubFetch((url, _init) => {
    assert.ok(url.includes("scanner.tradingview.com/america/scan"), `esperaba america/scan: ${url}`);
    return Response.json(scannerResponse([screenerRow7("NASDAQ:AAPL", "Apple Inc", 200, 2.1, 5_000_000, 3_000_000_000_000, 28.5)]));
  });
  try {
    const res = await getScreener("us");
    assert.equal(res.status, "ok");
    assert.equal(res.data![0].symbol, "NASDAQ:AAPL");
    assert.equal(res.data![0].market, "us");
    assert.equal(res.data![0].name, "Apple Inc");
  } finally {
    restore();
  }
});

test("alias fetchScreener export existe", async () => {
  assert.equal(typeof fetchScreener, "function");
  const restore = stubFetch(() => Response.json(scannerResponse([screenerRow7("BCBA:GGAL", "GGAL", 10, 0, 100, 1_000, 5)])));
  try {
    const res = await fetchScreener("bcba");
    assert.equal(res.status, "ok");
  } finally {
    restore();
  }
});

test("vacío: data [] → down data null", async () => {
  const restore = stubFetch(() => Response.json({ totalCount: 0, data: [] }));
  try {
    const res = await getScreener("bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
    assert.ok(res.error);
  } finally {
    restore();
  }
});

test("429 → rate_limited data null", async () => {
  const restore = stubFetch(() => new Response("rate", { status: 429 }));
  try {
    const res = await getScreener("bcba");
    assert.equal(res.status, "rate_limited");
    assert.equal(res.data, null);
    assert.equal(res.cached, false);
    assert.equal(res.source, "tradingview");
  } finally {
    restore();
  }
});

test("500 → down data null", async () => {
  const restore = stubFetch(() => new Response("err", { status: 500 }));
  try {
    const res = await getScreener("bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
  } finally {
    restore();
  }
});

test("red caída (fetch lanza) → down (nunca lanza)", async () => {
  const restore = stubFetch(() => {
    throw new Error("ECONNREFUSED");
  });
  try {
    const res = await getScreener("bcba");
    assert.equal(res.status, "down");
    assert.equal(res.data, null);
  } finally {
    restore();
  }
});

test("cache hit: 2ª llamada mismo market dentro TTL 15min → cached true", async () => {
  let calls = 0;
  const restore = stubFetch(() => {
    calls++;
    return Response.json(scannerResponse([screenerRow7("BCBA:GGAL", "GGAL", 10, 1, 1000, 1_000_000, 10)]));
  });
  try {
    const first = await getScreener("bcba");
    assert.equal(first.cached, false);
    assert.equal(calls, 1);
    const second = await getScreener("bcba");
    assert.equal(second.status, "ok");
    assert.equal(second.cached, true);
    assert.deepEqual(second.data, first.data);
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

test("cache key distingue bcba vs us no colisionan", async () => {
  const restore = stubFetch((url) => {
    if (url.includes("/argentina/scan")) return Response.json(scannerResponse([screenerRow7("BCBA:GGAL", "GGAL", 10, 1, 100, 1000, 5)]));
    if (url.includes("/america/scan")) return Response.json(scannerResponse([screenerRow7("NASDAQ:AAPL", "AAPL", 200, 2, 5000, 3000000, 20)]));
    return Response.json({ totalCount: 0, data: [] });
  });
  try {
    const bcba = await getScreener("bcba");
    const us = await getScreener("us");
    assert.equal(bcba.data![0].symbol, "BCBA:GGAL");
    assert.equal(us.data![0].symbol, "NASDAQ:AAPL");
    const bcba2 = await getScreener("bcba");
    assert.equal(bcba2.cached, true);
    assert.equal(bcba2.data![0].symbol, "BCBA:GGAL");
  } finally {
    restore();
  }
});

test("search client-side: query filtra por symbol/name case-insensitive", async () => {
  const restore = stubFetch(() =>
    Response.json(
      scannerResponse([
        screenerRow7("BCBA:GGAL", "Grupo Financiero Galicia", 45, 1, 1000, 5000, 10),
        screenerRow7("BCBA:YPFD", "YPF Sociedad Anonima", 120, 2, 2000, 8000, 12),
        screenerRow7("BCBA:PAMP", "Pampa Energia", 30, -1, 1500, 3000, 8),
      ]),
    ),
  );
  try {
    // sin query → 3
    const all = await getScreener("bcba");
    assert.equal(all.data!.length, 3);
    // con query "ggal" → 1 (cache hit + filtro)
    const filtered = await getScreener("bcba", "ggal");
    assert.equal(filtered.status, "ok");
    assert.equal(filtered.cached, true, "filtrado debe venir de cache");
    assert.equal(filtered.data!.length, 1);
    assert.equal(filtered.data![0].symbol, "BCBA:GGAL");
    // query "ypf" case-insensitive por name
    const ypf = await getScreener("bcba", "YPF");
    assert.equal(ypf.data!.length, 1);
    assert.equal(ypf.data![0].symbol, "BCBA:YPFD");
    // query sin match → 0
    const none = await getScreener("bcba", "ZZZZ");
    assert.equal(none.data!.length, 0);
  } finally {
    restore();
  }
});

test("6-col payload (sin description) → name null fallback funciona", async () => {
  // Simular servidor que devuelve 6 cols: name,close,change,volume,market_cap_basic,pe
  const restore = stubFetch(() =>
    Response.json({
      totalCount: 1,
      data: [{ d: ["BCBA:GGAL", 45.2, 1.5, 1_000_000, 5_000_000_000, 12.3] }],
    }),
  );
  try {
    const res = await getScreener("bcba");
    assert.equal(res.status, "ok");
    assert.equal(res.data![0].symbol, "BCBA:GGAL");
    assert.equal(res.data![0].name, null);
    assert.equal(res.data![0].price, 45.2);
  } finally {
    restore();
  }
});
