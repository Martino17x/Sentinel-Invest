import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { calcMacaulayDuration, calcModifiedDuration, calcDurations } from "../../../src/services/market/bonds/duration.js";
import {
  calcParidad,
  calcAccruedInterest,
  calcDirtyPrice,
  calcCleanPrice,
  calcValorTecnico,
  calcParidadConAccrued,
} from "../../../src/services/market/bonds/paridad.js";
import { getCER, getUVA, resetCerCacheForTests, _internal } from "../../../src/services/market/bonds/cer.js";
import type { BondCashflow } from "../../../src/services/market/bonds/types.js";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function futureDate(settlement: string, days: number): string {
  const d = new Date(settlement + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  const stub = (async (input: any, init?: RequestInit) => handler(String(input), init)) as typeof fetch;
  globalThis.fetch = stub;
  return () => {
    globalThis.fetch = original;
  };
}

// ------------------------------------------------------------
// duration.ts
// ------------------------------------------------------------
describe("duration.ts — MD formula + LECAP maturity", () => {
  test("MD = Mac / (1 + TIR/m) with m=1 and m=2", () => {
    const m1 = calcModifiedDuration(2.0, 0.10, 1);
    assert.ok(m1 !== null);
    assert.ok(Math.abs(m1! - 2.0 / 1.10) < 1e-10);

    const m2 = calcModifiedDuration(2.0, 0.10, 2);
    assert.ok(m2 !== null);
    assert.ok(Math.abs(m2! - 2.0 / 1.05) < 1e-10);
  });

  test("calcModifiedDuration null guards", () => {
    assert.equal(calcModifiedDuration(null, 0.1), null);
    assert.equal(calcModifiedDuration(2, null), null);
    assert.equal(calcModifiedDuration(NaN, 0.1), null);
    assert.equal(calcModifiedDuration(2, 0.1, 0), null);
    assert.equal(calcModifiedDuration(2, -1, 1), null); // denom 0 when tir=-1, m=1
  });

  test("Macaulay LECAP single flow = maturity (Actual/365)", () => {
    const settlement = "2026-05-01";
    const venc = futureDate(settlement, 90);
    const flujos: BondCashflow[] = [{ fechaPago: venc, renta: 0, amortizacion: 100, cashFlow: 100, vr: 0 }];
    const tir = 0.25;
    const mac = calcMacaulayDuration(tir, flujos, { settlement, dayCount: "Actual/365" });
    assert.ok(mac !== null);
    // ~90/365 ≈0.2465
    assert.ok(Math.abs(mac! - 90 / 365) < 0.01, `mac ${mac}`);
    const md = calcModifiedDuration(mac, tir, 1);
    assert.ok(md !== null);
    assert.ok(Math.abs(md! - mac! / (1 + tir)) < 1e-10);
  });

  test("Macaulay multi-flow weighted average", () => {
    const settlement = "2026-01-01";
    const flujos: BondCashflow[] = [
      { fechaPago: "2027-01-01", renta: 5, amortizacion: 0, cashFlow: 5, vr: 100 },
      { fechaPago: "2028-01-01", renta: 5, amortizacion: 100, cashFlow: 105, vr: 0 },
    ];
    const tir = 0.05;
    const mac = calcMacaulayDuration(tir, flujos, { settlement, dayCount: "Actual/365" });
    assert.ok(mac !== null);
    // manual: pv1=5/1.05, pv2=105/1.05^2, weighted ~1.95
    const pv1 = 5 / Math.pow(1.05, 1);
    const pv2 = 105 / Math.pow(1.05, 2);
    const expected = (1 * pv1 + 2 * pv2) / (pv1 + pv2);
    assert.ok(Math.abs(mac! - expected) < 1e-10);
  });

  test("calcDurations helper returns both", () => {
    const settlement = "2026-05-01";
    const venc = futureDate(settlement, 180);
    const flujos: BondCashflow[] = [{ fechaPago: venc, renta: 0, amortizacion: 100, cashFlow: 100, vr: 0 }];
    const { duration, modifiedDuration } = calcDurations(0.20, flujos, { settlement, dayCount: "Actual/365", periodsPerYear: 1 });
    assert.ok(duration !== null && modifiedDuration !== null);
    assert.ok(Math.abs(modifiedDuration! - duration! / 1.2) < 1e-10);
  });

  test("Macaulay returns null for tir null or no future flows", () => {
    assert.equal(calcMacaulayDuration(null, [], { settlement: "2026-05-01" }), null);
    assert.equal(calcMacaulayDuration(NaN, [], { settlement: "2026-05-01" }), null);
    const past: BondCashflow[] = [{ fechaPago: "2020-01-01", renta: 0, amortizacion: 100, cashFlow: 100, vr: 0 }];
    assert.equal(calcMacaulayDuration(0.05, past, { settlement: "2026-05-01" }), null);
  });
});

// ------------------------------------------------------------
// paridad.ts
// ------------------------------------------------------------
describe("paridad.ts — VR+accrued + dirty/clean", () => {
  test("paridad = dirty / valorTecnico *100", () => {
    assert.equal(calcParidad(58.2, 100)!.toFixed(2), "58.20");
    assert.equal(calcParidad(102.5, 102.5)!.toFixed(2), "100.00");
    assert.ok(Math.abs(calcParidad(50, 80)! - 62.5) < 1e-9);
  });

  test("paridad null when valorTecnico <=0 or invalid", () => {
    assert.equal(calcParidad(50, 0), null);
    assert.equal(calcParidad(50, -10), null);
    assert.equal(calcParidad(NaN, 100), null);
    assert.equal(calcParidad(50, NaN), null);
  });

  test("calcAccruedInterest 30/360 vs Actual/365", () => {
    // VR 100, coupon 4% annual, 30 days accrued
    // 30/360: 100*0.04*30/360 = 0.333...
    // Actual/365: 100*0.04*30/365 = 0.328...
    const opts30 = {
      annualCouponRate: 0.04,
      valorResidual: 100,
      lastCouponDate: "2026-01-01",
      settlement: "2026-01-31",
      dayCount: "30/360" as const,
    };
    const accrued30 = calcAccruedInterest(opts30);
    assert.ok(Math.abs(accrued30 - 0.3333333333) < 1e-9, `30/360 ${accrued30}`);

    const optsAct = { ...opts30, dayCount: "Actual/365" as const };
    const accruedAct = calcAccruedInterest(optsAct);
    // Actual days Jan1->Jan31 =30
    assert.ok(Math.abs(accruedAct - 100 * 0.04 * 30 / 365) < 1e-9, `Actual ${accruedAct}`);
    assert.ok(accruedAct < accrued30, "Actual/365 <30/360 for same days");
  });

  test("calcAccruedInterest zero coupon or non-finite returns 0", () => {
    assert.equal(calcAccruedInterest({ annualCouponRate: 0, lastCouponDate: "2026-01-01", settlement: "2026-02-01", dayCount: "Actual/365" }), 0);
    assert.equal(calcAccruedInterest({ annualCouponRate: NaN, valorResidual: 100, lastCouponDate: "2026-01-01", settlement: "2026-02-01", dayCount: "Actual/365" } as any), 0);
  });

  test("dirty = clean + accrued, clean = dirty - accrued", () => {
    const clean = 102.5;
    const accrued = 2.5;
    assert.equal(calcDirtyPrice(clean, accrued), 105);
    assert.equal(calcCleanPrice(105, accrued), 102.5);
    // non-finite fallback returns input
    assert.equal(calcDirtyPrice(NaN as any, 2), NaN as any); // stays NaN => returns cleanPrice itself? impl returns cleanPrice
  });

  test("valorTecnico = VR + accrued", () => {
    assert.equal(calcValorTecnico(100, 2.5), 102.5);
    assert.equal(calcParidadConAccrued(105, 100, 2.5)!.toFixed(2), calcParidad(105, 102.5)!.toFixed(2));
  });
});

// ------------------------------------------------------------
// cer.ts — cache key fechaValor, stale fallback
// ------------------------------------------------------------
describe("cer.ts — SwrCache key fechaValor + stale", () => {
  beforeEach(() => resetCerCacheForTests());
  afterEach(() => resetCerCacheForTests());

  test("cache key is fechaValor: second call within TTL is cached:true without fetch", async () => {
    let fetchCalls = 0;
    const restore = stubFetch((url) => {
      if (url.includes("bcra.gob.ar")) {
        fetchCalls++;
        // BCRA shape: { results: [{ detalle: [{ fecha, valor }] }] }
        return Response.json({
          results: [{ detalle: [{ fecha: "2026-05-13T00:00:00", valor: 1234.56 }] }],
        });
      }
      // INDEC fallback not needed
      return Response.json({ data: [] });
    });
    try {
      const first = await getCER("2026-05-13");
      assert.equal(first.valor, 1234.56);
      assert.equal(first.cached, false);
      assert.equal(first.source, "bcra.gob.ar");
      assert.equal(fetchCalls, 1);

      const second = await getCER("2026-05-13");
      assert.equal(second.valor, 1234.56);
      assert.equal(second.cached, true);
      assert.equal(fetchCalls, 1, "second hit should not fetch");
    } finally {
      restore();
    }
  });

  test("different fechaValor keys are independent", async () => {
    let calls: string[] = [];
    const restore = stubFetch((url) => {
      if (url.includes("bcra.gob.ar")) {
        const m = url.match(/Desde=([^&]+)/);
        const fecha = m ? m[1] : "unknown";
        calls.push(fecha);
        const valor = fecha === "2026-05-13" ? 100 : 200;
        return Response.json({ results: [{ detalle: [{ fecha: `${fecha}T00:00:00`, valor }] }] });
      }
      return Response.json({ data: [] });
    });
    try {
      const a = await getCER("2026-05-13");
      const b = await getCER("2026-05-14");
      assert.equal(a.valor, 100);
      assert.equal(b.valor, 200);
      assert.ok(calls.includes("2026-05-13") && calls.includes("2026-05-14"));
      // re-hit first still cached
      const a2 = await getCER("2026-05-13");
      assert.equal(a2.cached, true);
      assert.equal(calls.length, 2);
    } finally {
      restore();
    }
  });

  test("stale fallback: when BCRA fails and cache has stale, returns stale:true", async () => {
    // First populate cache with success
    let shouldFail = false;
    const restore = stubFetch((url) => {
      if (url.includes("bcra.gob.ar")) {
        if (shouldFail) return new Response("server error", { status: 500 });
        return Response.json({ results: [{ detalle: [{ fecha: "2026-05-13T00:00:00", valor: 999 }] }] });
      }
      if (url.includes("apis.datos.gob.ar")) return Response.json({ data: [] });
      return new Response("not stubbed", { status: 500 });
    });
    try {
      const ok = await getCER("2026-05-13");
      assert.equal(ok.valor, 999);
      // expire the entry manually (TTL 60s) by poking expiresAt
      const entry = _internal.cerCache.getEntry("2026-05-13");
      assert.ok(entry);
      // force stale by setting expiresAt in past
      (entry as any).expiresAt = Date.now() - 1000;
      shouldFail = true;
      // stale-serve: should return stale:true without throwing (via stale revalidate path)
      const stale = await getCER("2026-05-13");
      assert.equal(stale.stale, true);
      assert.equal(stale.cached, true);
      assert.equal(stale.valor, 999);
    } finally {
      restore();
    }
  });

  test("BCRA down triggers INDEC fallback attempt (if INDEC returns, uses it)", async () => {
    // BCRA returns non-ok, INDEC returns data
    const restore = stubFetch((url) => {
      if (url.includes("bcra.gob.ar")) return new Response("err", { status: 500 });
      if (url.includes("apis.datos.gob.ar")) {
        return Response.json({ data: [["2026-05-13", 777.77]] });
      }
      return new Response("not stubbed", { status: 500 });
    });
    try {
      resetCerCacheForTests();
      const q = await getCER("2026-05-13");
      assert.equal(q.valor, 777.77);
      assert.ok(q.source.includes("fallback"));
    } finally {
      restore();
    }
  });

  test("getUVA uses independent cache and same stale behavior", async () => {
    let cerCalls = 0, uvaCalls = 0;
    const restore = stubFetch((url) => {
      if (url.includes("bcra.gob.ar")) {
        if (url.includes(`/${_internal.BCRA_CER_ID}?`) || url.includes(`/30?`)) {
          cerCalls++;
          return Response.json({ results: [{ detalle: [{ fecha: "2026-05-13T00:00:00", valor: 111 }] }] });
        }
        if (url.includes(`/${_internal.BCRA_UVA_ID}?`) || url.includes(`/31?`)) {
          uvaCalls++;
          return Response.json({ results: [{ detalle: [{ fecha: "2026-05-13T00:00:00", valor: 222 }] }] });
        }
      }
      return Response.json({ data: [] });
    });
    try {
      const cer = await getCER("2026-05-13");
      const uva = await getUVA("2026-05-13");
      assert.equal(cer.valor, 111);
      assert.equal(uva.valor, 222);
      assert.equal(cerCalls, 1);
      assert.equal(uvaCalls, 1);
      // second hits cached
      await getCER("2026-05-13");
      await getUVA("2026-05-13");
      assert.equal(cerCalls, 1);
      assert.equal(uvaCalls, 1);
    } finally {
      restore();
    }
  });
});
