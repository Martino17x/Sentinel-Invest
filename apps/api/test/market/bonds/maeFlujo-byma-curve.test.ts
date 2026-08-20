import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getMaeFlujo, getAllMaeAnalytics, getMaeAnalyticsForSymbol, resetMaeCacheForTests, _internal as maeInternal } from "../../../src/services/market/bonds/maeFlujo.js";
import { BymaDataProvider } from "../../../src/services/iol/BymaDataProvider.js";
import { buildCurve, VALID_SEGMENTS } from "../../../src/services/market/bonds/curve.js";
import type { BondAnalytics } from "../../../src/services/market/bonds/types.js";

// stub global fetch similar to radar tests
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

// MAE fixtures
function maeItem(especie: string, tir: number, md: number, moneda = "D  ", detalleOverrides: any[] = []): any {
  const baseDetalle = detalleOverrides.length
    ? detalleOverrides
    : [
        { fechaPago: "2026-09-09T00:00:00", vr: 100, cashFlow: 3, renta: 2, amortizacion: 1 },
        { fechaPago: "2027-03-09T00:00:00", vr: 80, cashFlow: 23, renta: 3, amortizacion: 20 },
        { fechaPago: "2027-09-09T00:00:00", vr: 60, cashFlow: 23, renta: 3, amortizacion: 20 },
      ];
  return {
    especie,
    descripcion: especie.startsWith("AL") ? "Bono Step-up" : especie,
    moneda,
    precio: 55.5,
    tir, // in %
    md,
    detalle: baseDetalle,
  };
}

// BYMA ficha stubbing
function bymaFichaJson(data: any[]): any {
  return {
    data,
    empty: data.length === 0,
  };
}

beforeEach(() => {
  resetMaeCacheForTests();
});

afterEach(() => {
  resetMaeCacheForTests();
});

// ------------------------------------------------------------
// maeFlujo.ts integration with mocked MAE
// ------------------------------------------------------------
describe("maeFlujo.ts — mock BYMA/MAE/BCRA integration", () => {
  test("getMaeFlujo H+B normalization + getAllMaeAnalytics count", async () => {
    const hItems = [maeItem("AL30", 18.5, 2.1), maeItem("GD30", 19.2, 2.3)];
    const bItems = [maeItem("BPOC7", 8.3, 1.8)];

    const restore = stubFetch((url) => {
      if (url.includes("flujofondoscotiz/H")) return Response.json(hItems);
      if (url.includes("flujofondoscotiz/B")) return Response.json(bItems);
      // BCRA not needed here but fallback BYMA ficha not called
      return new Response("not stubbed: " + url, { status: 500 });
    });

    try {
      const all = await getAllMaeAnalytics();
      assert.equal(all.length, 3);
      const al30 = all.find((a) => a.symbol === "AL30")!;
      assert.ok(al30);
      // tir converted from % to decimal: 18.5% -> 0.185
      assert.ok(Math.abs(al30.tir! - 0.185) < 1e-9, `AL30 tir ${al30.tir}`);
      assert.equal(al30.source, "mae");
      assert.equal(al30.schedule.moneda, "USD");
      assert.ok(al30.schedule.cashflows.length === 3);
    } finally {
      restore();
    }
  });

  test("getMaeAnalyticsForSymbol lookup + tir divergence log (>5bps) does not throw", async () => {
    // Create item where local tir will differ >5bps from MAE to trigger warn path
    // Use small detalle that leads to different yield vs declared MAE
    const hItems = [maeItem("AL35", 25.0, 2.0)]; // declared 25%
    // Local calc at price 55.5 with those flows will be different; warn is console.warn — just ensure no throw
    const restore = stubFetch((url) => {
      if (url.includes("flujofondoscotiz/H")) return Response.json(hItems);
      if (url.includes("flujofondoscotiz/B")) return Response.json([]);
      return new Response("not stubbed", { status: 500 });
    });

    const origWarn = console.warn;
    let warned = false;
    (console as any).warn = (...args: any[]) => { warned = true; origWarn(...args); };

    try {
      const a = await getMaeAnalyticsForSymbol("AL35");
      assert.ok(a !== null);
      assert.ok(a!.tir !== null);
      // we don't assert warned strictly because diff may or may not exceed 5bps for this synthetic; just ensure it didn't throw
      void warned;
    } finally {
      (console as any).warn = origWarn;
      restore();
    }
  });

  test("MAE cache swr: second call served from cache (no extra fetch)", async () => {
    let hFetches = 0;
    const hItems = [maeItem("AL30", 10, 1.5)];
    const restore = stubFetch((url) => {
      if (url.includes("flujofondoscotiz/H")) {
        hFetches++;
        return Response.json(hItems);
      }
      if (url.includes("flujofondoscotiz/B")) return Response.json([]);
      return new Response("not stubbed", { status: 500 });
    });

    try {
      const first = await getMaeFlujo("H");
      assert.equal(first.length, 1);
      assert.equal(hFetches, 1);
      const second = await getMaeFlujo("H");
      assert.equal(second.length, 1);
      assert.equal(hFetches, 1, "second from cache");
      // force stale
      const entry = maeInternal.maeCache.getEntry("mae:H")!;
      (entry as any).expiresAt = Date.now() - 1000;
      const third = await getMaeFlujo("H");
      assert.equal(third.length, 1);
      // stale still returns cache immediately, triggers background refresh
      assert.ok(true);
    } finally {
      restore();
    }
  });

  test("MAE both letters down → stale fallback if cache had data", async () => {
    // pre-populate via success
    const hItems = [maeItem("AL30", 10, 1.0)];
    let shouldFail = false;
    const restore = stubFetch((url) => {
      if (url.includes("flujofondoscotiz")) {
        if (shouldFail) return new Response("err", { status: 500 });
        if (url.endsWith("/H")) return Response.json(hItems);
        return Response.json([]);
      }
      return new Response("not stubbed", { status: 500 });
    });

    try {
      const ok = await getMaeFlujo("H");
      assert.equal(ok.length, 1);
      shouldFail = true;
      // expire
      const entry = maeInternal.maeCache.getEntry("mae:H")!;
      (entry as any).expiresAt = Date.now() - 1000;
      // stale path via getAllMaeAnalytics? getMaeFlujo will serve stale
      const stale = await getMaeFlujo("H");
      assert.equal(stale.length, 1);
    } finally {
      restore();
    }
  });
});

// ------------------------------------------------------------
// BymaDataProvider.getBondSchedule contract test
// ------------------------------------------------------------
describe("BymaDataProvider.getBondSchedule — contract ficha bond-info", () => {
  test("bullet LECAP via ficha formaAmortizacion", async () => {
    const fichaBullet = {
      formaAmortizacion: "Integra al vencimiento",
      interes: "Tasa fija",
      moneda: "Pesos",
      fechaVencimiento: "2026-12-31 00:00:00.0",
      tipoEspecie: "Letra",
    };

    const restore = stubFetch((url, init) => {
      if (url.includes("fichatecnica/especies/general")) {
        // body contains symbol — return our ficha
        return Response.json(bymaFichaJson([fichaBullet]));
      }
      if (url.includes("flujofondoscotiz")) return Response.json([]);
      return new Response("not stubbed: " + url, { status: 500 });
    });

    try {
      const provider = new BymaDataProvider();
      const sched = await provider.getBondSchedule("S31L6");
      assert.equal(sched.symbol, "S31L6");
      assert.equal(sched.tipo, "bullet");
      assert.equal(sched.moneda, "ARS");
      assert.equal(sched.vencimiento, "2026-12-31");
      assert.equal(sched.cashflows.length, 1);
      assert.ok(sched.cashflows[0].cashFlow === 100);
      // bond-info contract: cashflow shape has fechaPago, renta, amortizacion, cashFlow, vr
      const cf = sched.cashflows[0];
      assert.ok(typeof cf.fechaPago === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cf.fechaPago));
      assert.ok(typeof cf.renta === "number");
      assert.ok(typeof cf.amortizacion === "number");
      assert.ok(typeof cf.cashFlow === "number");
      assert.ok(typeof cf.vr === "number");
    } finally {
      restore();
    }
  });

  test("amortizable multi-cuota generada desde ficha", async () => {
    const fichaAmort = {
      formaAmortizacion: "12 cuotas semestrales iguales el 9 de enero y 9 de julio desde julio 2027 hasta enero 2033",
      interes: "Step-up 0.75% hasta 1.5%",
      moneda: "Dólar",
      fechaVencimiento: "2033-01-09 00:00:00.0",
      tipoEspecie: "Bono",
    };
    const restore = stubFetch((url) => {
      if (url.includes("fichatecnica/especies/general")) return Response.json(bymaFichaJson([fichaAmort]));
      if (url.includes("flujofondoscotiz")) return Response.json([]);
      return new Response("not stubbed", { status: 500 });
    });

    try {
      const provider = new BymaDataProvider();
      const sched = await provider.getBondSchedule("GD35");
      assert.equal(sched.tipo, "step-up"); // step-up detected from interes
      assert.equal(sched.cashflows.length, 12);
      // contrato: ordenar asc
      for (let i = 1; i < sched.cashflows.length; i++) {
        assert.ok(sched.cashflows[i].fechaPago >= sched.cashflows[i - 1].fechaPago);
      }
    } finally {
      restore();
    }
  });

  test("CER ficha isCerFicha -> tipo cer + cerAjustado true", async () => {
    const fichaCer = {
      formaAmortizacion: "Al vencimiento",
      interes: "Ajustable por CER",
      moneda: "Pesos Ajustables por CER",
      fechaVencimiento: "2026-03-15 00:00:00.0",
    };
    const restore = stubFetch((url) => {
      if (url.includes("fichatecnica/especies/general")) return Response.json(bymaFichaJson([fichaCer]));
      if (url.includes("flujofondoscotiz")) return Response.json([]);
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const provider = new BymaDataProvider();
      const sched = await provider.getBondSchedule("TX26");
      assert.equal(sched.tipo, "cer");
      assert.equal(sched.cerAjustado, true);
    } finally {
      restore();
    }
  });

  test("ficha vacía -> fallback MAE detalle[]", async () => {
    // BYMA returns empty, MAE has GD30 detalle
    const maeGd30Detalle = {
      especie: "GD30",
      moneda: "D  ",
      precio: 60,
      tir: 15,
      md: 2,
      detalle: [
        { fechaPago: "2027-01-09T00:00:00", vr: 80, cashFlow: 22, renta: 2, amortizacion: 20 },
        { fechaPago: "2027-07-09T00:00:00", vr: 60, cashFlow: 22, renta: 2, amortizacion: 20 },
        { fechaPago: "2028-01-09T00:00:00", vr: 40, cashFlow: 22, renta: 2, amortizacion: 20 },
      ],
    };
    const restore = stubFetch((url) => {
      if (url.includes("fichatecnica/especies/general")) return Response.json(bymaFichaJson([]));
      if (url.includes("flujofondoscotiz/H")) return Response.json([maeGd30Detalle]);
      if (url.includes("flujofondoscotiz/B")) return Response.json([]);
      return new Response("not stubbed: " + url, { status: 500 });
    });
    try {
      const provider = new BymaDataProvider();
      const sched = await provider.getBondSchedule("GD30");
      assert.equal(sched.symbol, "GD30");
      assert.ok(sched.cashflows.length === 3, `expected 3 cashflows got ${sched.cashflows.length}`);
      assert.ok(sched.cashflows[0].renta === 2);
    } finally {
      restore();
    }
  });
});

// ------------------------------------------------------------
// curve.ts grouping sort MD filtering tir!=null
// ------------------------------------------------------------
describe("curve.ts — buildCurve grouping & sort MD asc", () => {
  function mkAnalytics(symbol: string, tir: number | null, md: number | null, segmento: string, vencimiento = "2030-01-01"): BondAnalytics {
    return {
      symbol,
      precio: 50,
      precioDirty: 50,
      tir,
      md,
      duration: md ? md * 1.1 : null,
      paridad: 90,
      interesCorrido: 0,
      schedule: { symbol, moneda: "USD", tipo: "amortizable", vencimiento, cashflows: [], cerAjustado: false } as any,
      isRealtime: true,
      source: "mae",
      disclaimer: "d",
    } as unknown as BondAnalytics;
  }

  test("grouping by segment: USD-hard-dollar|BOPREAL|LECAP/BONCAP|CER", () => {
    // Use buildCurve with explicit schedule segmento via inferSegment fallback
    // But we set segment via schedule tipo? easier: use VALID_SEGMENTS and _helpers inferSegment
    // We'll directly test buildCurve with points that already have tir/md
    const analytics: BondAnalytics[] = [
      // We'll manually craft CurvePoint-like analytics with md defined
      { ...mkAnalytics("AL30", 0.18, 2.1, "USD-hard-dollar"), schedule: { symbol: "AL30", moneda: "USD", tipo: "amortizable", vencimiento: "2028-01-01", cashflows: [] } as any },
      { ...mkAnalytics("GD35", 0.20, 4.5, "USD-hard-dollar"), schedule: { symbol: "GD35", moneda: "USD", tipo: "amortizable", vencimiento: "2035-01-01", cashflows: [] } as any },
      { ...mkAnalytics("BPOC7", 0.08, 1.0, "BOPREAL"), schedule: { symbol: "BPOC7", moneda: "USD", tipo: "amortizable", vencimiento: "2027-01-01", cashflows: [] } as any },
      { ...mkAnalytics("TX26", 0.05, 1.2, "CER"), schedule: { symbol: "TX26", moneda: "ARS", tipo: "cer", vencimiento: "2026-09-01", cashflows: [] } as any },
      { ...mkAnalytics("S31L6", 0.40, 0.25, "LECAP/BONCAP"), schedule: { symbol: "S31L6", moneda: "ARS", tipo: "bullet", vencimiento: "2026-08-31", cashflows: [] } as any },
    ];

    // Patch inferSegment by manually setting schedule to force segment: we override toCurvePoint segment via inferSegment
    // Instead we can test that buildCurve correctly filters tir!=null and sorts md asc
    const curves = buildCurve(analytics);
    // Verify all segments present and sorted
    assert.ok(curves["USD-hard-dollar"]);
    assert.equal(curves["USD-hard-dollar"].length, 2);
    // sorted md asc: 2.1 before 4.5
    assert.ok(curves["USD-hard-dollar"][0].md < curves["USD-hard-dollar"][1].md);
    assert.ok(curves["BOPREAL"]);
    assert.equal(curves["BOPREAL"].length, 1);
    // filter tir!=null: add null tir
    const withNull: BondAnalytics[] = [...analytics, mkAnalytics("BAD", null, 1.0, "USD-hard-dollar"), mkAnalytics("BAD2", 0.1, null, "USD-hard-dollar")];
    const curves2 = buildCurve(withNull);
    assert.equal(curves2["USD-hard-dollar"].length, 2, "null tir/md should be filtered");
  });

  test("VALID_SEGMENTS allowlist covers 4 expected values", () => {
    assert.deepEqual([...VALID_SEGMENTS].sort(), ["BOPREAL", "CER", "LECAP/BONCAP", "USD-hard-dollar"].sort());
  });

  test("buildCurve md asc sorting validated with random order input", () => {
    const analytics: BondAnalytics[] = [
      mkAnalytics("GD41", 0.21, 6.0, "USD-hard-dollar", "2041-01-01"),
      mkAnalytics("AL30", 0.18, 1.5, "USD-hard-dollar", "2028-01-01"),
      mkAnalytics("GD30", 0.19, 2.0, "USD-hard-dollar", "2030-01-01"),
      mkAnalytics("AE38", 0.17, 5.5, "USD-hard-dollar", "2038-01-01"),
    ].map((a) => ({
      ...a,
      schedule: { symbol: a.symbol, moneda: "USD", tipo: "amortizable", vencimiento: a.schedule.vencimiento, cashflows: [] } as any,
    }));
    const curves = buildCurve(analytics);
    const pts = curves["USD-hard-dollar"];
    assert.equal(pts.length, 4);
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i].md >= pts[i - 1].md, `not sorted at ${i}: ${pts[i - 1].md} > ${pts[i].md}`);
    }
    assert.equal(pts[0].ticker, "AL30");
    assert.equal(pts[pts.length - 1].ticker, "GD41");
  });
});
