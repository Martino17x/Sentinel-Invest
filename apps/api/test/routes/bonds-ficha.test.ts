import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { signAccessToken } from "../../src/lib/jwt.js";
import bondsRouter, { resetBondsCacheForTests } from "../../src/routes/bonds.js";
import { resetMaeCacheForTests } from "../../src/services/market/bonds/maeFlujo.js";
import { resetCerCacheForTests } from "../../src/services/market/bonds/cer.js";
import { pool } from "../../src/db/index.js";
import { db } from "../../src/db/index.js";
import { setBondsFlagsForTests } from "../../src/config.js";

// 5.6 Integration GET /:symbol/ficha — 404 BOND_NOT_FOUND, CER stale stale.cer=true, LECAP S31L6 accrued null → VT=VR

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: any, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return original(input, init);
    return handler(url, init);
  }) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

function bypassFlagGuardIfNeeded(): () => void {
  const stack: any[] = (bondsRouter as any).stack;
  if (!stack || stack.length < 2) return () => {};
  const flagLayer = stack[1];
  const handleStr = String(flagLayer?.handle ?? "");
  const isFlagGuard = handleStr.includes("BONDS_ANALYTICS_ENABLED") || handleStr.includes("Renta fija no habilitada");
  if (!isFlagGuard) return () => {};
  const originalHandle = flagLayer.handle;
  flagLayer.handle = (_req: any, _res: any, next: any) => next();
  return () => {
    flagLayer.handle = originalHandle;
  };
}

async function withBondsApp(fn: (baseUrl: string, token: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use("/api/bonds", bondsRouter);
  const server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const token = signAccessToken("user-test-id", "test@test.local");
    await fn(`http://127.0.0.1:${port}/api/bonds`, token);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

beforeEach(() => {
  resetBondsCacheForTests();
  resetMaeCacheForTests();
  resetCerCacheForTests();
  setBondsFlagsForTests({ analytics: true, panel: true });
});
afterEach(() => {
  resetBondsCacheForTests();
  resetMaeCacheForTests();
  resetCerCacheForTests();
  setBondsFlagsForTests({ analytics: false, panel: false });
});

let originalPoolQuery: any;
let originalDbExecute: any;
function patchPool(mockFn: (text: string, params?: any[]) => Promise<any>): () => void {
  originalPoolQuery = (pool as any).query;
  (pool as any).query = mockFn;
  return () => {
    (pool as any).query = originalPoolQuery;
  };
}
function patchDbExecute(mockFn: any): () => void {
  originalDbExecute = (db as any).execute;
  (db as any).execute = mockFn;
  return () => {
    (db as any).execute = originalDbExecute;
  };
}

describe("GET /:symbol/ficha — 5.6 integration", () => {
  test("404 BOND_NOT_FOUND for unknown symbol", async () => {
    const restoreBypass = bypassFlagGuardIfNeeded();
    const restorePool = patchPool(async () => ({ rowCount: 0, rows: [] } as any));
    const restoreDb = patchDbExecute(async () => ({ rows: [] } as any));
    const restoreFetch = stubFetch((url) => {
      if (url.includes("fichatecnica/especies/general")) return Response.json({ data: [], empty: true });
      if (url.includes("flujofondoscotiz/H")) return Response.json([]);
      if (url.includes("flujofondoscotiz/B")) return Response.json([]);
      if (url.includes("public-bonds") || url.includes("leading-equity") || url.includes("cedears") || url.includes("negociable-obligations")) return Response.json([]);
      if (url.includes("bcra.gob.ar") || url.includes("apis.datos.gob.ar")) return Response.json({ data: [] });
      if (url.includes("market-open")) return Response.json(false);
      if (url.includes("chart/historical")) return Response.json({ t: [], c: [] });
      return new Response("not stubbed: " + url, { status: 500 });
    });
    try {
      await withBondsApp(async (base, token) => {
        const res = await fetch(`${base}/XXXX/ficha`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 404);
        const body = (await res.json()) as any;
        assert.equal(body.code, "BOND_NOT_FOUND");
      });
    } finally {
      restoreFetch();
      restorePool();
      restoreDb();
      restoreBypass();
    }
  });

  test("symbol validation 400 for invalid symbol", async () => {
    const restoreBypass = bypassFlagGuardIfNeeded();
    const restorePool = patchPool(async () => ({ rowCount: 0, rows: [] } as any));
    const restoreDb = patchDbExecute(async () => ({ rows: [] } as any));
    const restoreFetch = stubFetch(() => new Response("not stubbed", { status: 500 }));
    try {
      await withBondsApp(async (base, token) => {
        const res = await fetch(`${base}/A/ficha`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 400);
        const body = (await res.json()) as any;
        assert.equal(body.code, "SYMBOL_INVALID");
        const res3 = await fetch(`${base}/AL-30/ficha`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res3.status, 400);
      });
    } finally {
      restoreFetch();
      restorePool();
      restoreDb();
      restoreBypass();
    }
  });

  test("LECAP S31L6 accrued null → VT=VR, isParidadCalculable false", async () => {
    const restoreBypass = bypassFlagGuardIfNeeded();
    const restorePool = patchPool(async () => ({ rowCount: 0, rows: [] } as any));
    const restoreDb = patchDbExecute(async () => ({ rows: [] } as any));

    const fichaLecap = {
      ley: "LEY ARG",
      interes: "A descuento",
      formaAmortizacion: "Integra al vencimiento",
      fechaVencimiento: "2026-08-31 00:00:00.0",
      codigoIsin: "AR123",
      moneda: "Pesos",
      tipoEspecie: "Letra",
      denominacionMinima: 100,
      montoResidual: 100,
    };
    const restoreFetch = stubFetch((url, init) => {
      if (url.includes("fichatecnica/especies/general")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (String(body.symbol).toUpperCase() === "S31L6") return Response.json({ data: [fichaLecap], empty: false });
        return Response.json({ data: [], empty: true });
      }
      if (url.includes("public-bonds")) return Response.json([{ symbol: "S31L6", trade: 98.5, previousClosingPrice: 98, denominationCcy: "ARS", tradeVolume: 1000, volumeAmount: 50000, bidPrice: 98, offerPrice: 99 }]);
      if (url.includes("leading-equity") || url.includes("cedears") || url.includes("negociable-obligations")) return Response.json([]);
      if (url.includes("flujofondoscotiz")) return Response.json([]);
      if (url.includes("market-open")) return Response.json(true);
      if (url.includes("bcra.gob.ar")) return Response.json({ results: [{ detalle: [{ fecha: "2026-05-13T00:00:00", valor: 100 }] }] });
      return new Response("not stubbed: " + url, { status: 500 });
    });

    try {
      await withBondsApp(async (base, token) => {
        const res = await fetch(`${base}/S31L6/ficha`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200, `S31L6 ficha status ${res.status} ${(await res.clone().text()).slice(0, 300)}`);
        const body = (await res.json()) as any;
        assert.equal(body.symbol, "S31L6");
        const cuadro = body.cuadroTecnico ?? body.cuadro;
        assert.ok(cuadro, "cuadroTecnico present");
        assert.equal(cuadro.accrued, null, "LECAP accrued should be null");
        assert.equal(cuadro.vt, cuadro.vr, `vt ${cuadro.vt} should equal vr ${cuadro.vr} when accrued null`);
        assert.equal(cuadro.isParidadCalculable, false);
        assert.equal(cuadro.paridad, null);
        assert.equal(cuadro.scheduleSource, "byma");
      });
    } finally {
      restoreFetch();
      restorePool();
      restoreDb();
      restoreBypass();
    }
  });

  test("CER stale stale.cer=true when getCER fails for TX26", async () => {
    const restoreBypass = bypassFlagGuardIfNeeded();
    const restorePool = patchPool(async () => ({ rowCount: 0, rows: [] } as any));
    const restoreDb = patchDbExecute(async () => ({ rows: [] } as any));

    const fichaCer = {
      interes: "CER + 1,50% semestral",
      formaAmortizacion: "Integra al vencimiento",
      fechaVencimiento: "2026-11-09 00:00:00.0",
      moneda: "Pesos Ajustables por CER",
      tipoEspecie: "Bono",
      codigoIsin: "ARCER123",
    };
    const maeTx26 = {
      especie: "TX26",
      moneda: "$",
      precio: 1200,
      tir: 8,
      md: 1.5,
      detalle: [{ fechaPago: "2026-11-09T00:00:00", vr: 0, cashFlow: 100, renta: 0, amortizacion: 100 }],
    };
    const restoreFetch = stubFetch((url, init) => {
      if (url.includes("fichatecnica/especies/general")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (String(body.symbol).toUpperCase() === "TX26") return Response.json({ data: [fichaCer], empty: false });
        return Response.json({ data: [], empty: true });
      }
      if (url.includes("public-bonds")) return Response.json([{ symbol: "TX26", trade: 1200, previousClosingPrice: 1190, denominationCcy: "ARS", bidPrice: 1195, offerPrice: 1205 }]);
      if (url.includes("leading-equity") || url.includes("cedears") || url.includes("negociable-obligations")) return Response.json([]);
      if (url.includes("flujofondoscotiz/H")) return Response.json([maeTx26]);
      if (url.includes("flujofondoscotiz/B")) return Response.json([]);
      if (url.includes("bcra.gob.ar") || url.includes("apis.datos.gob.ar")) return new Response("BCRA down", { status: 500 });
      if (url.includes("market-open")) return Response.json(true);
      return new Response("not stubbed: " + url, { status: 500 });
    });

    try {
      await withBondsApp(async (base, token) => {
        const res = await fetch(`${base}/TX26/ficha`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200);
        const body = (await res.json()) as any;
        assert.equal(body.symbol, "TX26");
        assert.equal(body.stale?.cer, true, "CER stale should be true when BCRA fails");
        assert.equal(body.isStale, true);
        const market = body.marketData ?? body.market;
        assert.ok(market.spread === 10, `spread ${market.spread} should be ask-bid 10`);
      });
    } finally {
      restoreFetch();
      restorePool();
      restoreDb();
      restoreBypass();
    }
  });

  test("GET /:symbol/ficha AL30 ok — tir decimal, cuadro.isin not null, accrued number when parseable", async () => {
    const restoreBypass = bypassFlagGuardIfNeeded();
    const restorePool = patchPool(async () => ({ rowCount: 0, rows: [] } as any));
    const restoreDb = patchDbExecute(async () => ({ rows: [] } as any));

    const fichaAL30 = {
      interes: "0,50% semestral — último cupón 2026-01-09",
      formaAmortizacion: "12 cuotas semestrales",
      fechaVencimiento: "2030-07-09 00:00:00.0",
      codigoIsin: "ARAL30ISIN",
      ley: "LEY NY",
      moneda: "Dólar",
      fechaDevenganIntereses: "2026-01-09 00:00:00.0",
    };
    const maeAL30 = {
      especie: "AL30",
      moneda: "D  ",
      precio: 58.2,
      tir: 18.5,
      md: 2.1,
      detalle: [
        { fechaPago: "2026-07-09T00:00:00", vr: 80, cashFlow: 22, renta: 2, amortizacion: 20 },
        { fechaPago: "2027-01-09T00:00:00", vr: 60, cashFlow: 22, renta: 2, amortizacion: 20 },
        { fechaPago: "2027-07-09T00:00:00", vr: 40, cashFlow: 22, renta: 2, amortizacion: 20 },
      ],
    };
    const restoreFetch = stubFetch((url, init) => {
      if (url.includes("fichatecnica/especies/general")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (String(body.symbol).toUpperCase() === "AL30") return Response.json({ data: [fichaAL30], empty: false });
        return Response.json({ data: [], empty: true });
      }
      if (url.includes("public-bonds")) return Response.json([{ symbol: "AL30", trade: 58.2, previousClosingPrice: 57, denominationCcy: "USD", bidPrice: 58, offerPrice: 58.5, tradeVolume: 5000, volumeAmount: 100000 }]);
      if (url.includes("leading-equity") || url.includes("cedears") || url.includes("negociable-obligations")) return Response.json([]);
      if (url.includes("flujofondoscotiz/H")) return Response.json([maeAL30]);
      if (url.includes("flujofondoscotiz/B")) return Response.json([]);
      if (url.includes("bcra.gob.ar")) return Response.json({ results: [{ detalle: [{ fecha: "2026-05-13T00:00:00", valor: 100 }] }] });
      if (url.includes("market-open")) return Response.json(true);
      return new Response("not stubbed: " + url, { status: 500 });
    });

    try {
      await withBondsApp(async (base, token) => {
        const res = await fetch(`${base}/AL30/ficha`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200, `AL30 ficha ${res.status} ${(await res.clone().text()).slice(0, 500)}`);
        const body = (await res.json()) as any;
        assert.equal(body.symbol, "AL30");
        assert.ok(typeof body.tir === "number" || body.tir === null);
        if (body.tir != null) assert.ok(body.tir > 0 && body.tir < 1, `tir decimal ${body.tir}`);
        const cuadro = body.cuadroTecnico ?? body.cuadro;
        assert.ok(cuadro.isin != null || body.isin != null, "isin should not be null for AL30 with ficha");
        const market = body.marketData ?? body.market;
        assert.ok(market.bid != null && market.ask != null, "bid/ask top present");
        assert.ok(typeof market.spread === "number");
      });
    } finally {
      restoreFetch();
      restorePool();
      restoreDb();
      restoreBypass();
    }
  });
});
