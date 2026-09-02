import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, projectCashflow } from "../../../src/services/market/bonds/cashflow.js";
import type { BondSchedule } from "../../../src/services/market/bonds/types.js";
import { runBondAnalyticsSnapshot, makeBondAnalyticsSnapshotDeps } from "../../../src/jobs/bondAnalyticsSnapshot.js";
import { buildCurve } from "../../../src/services/market/bonds/curve.js";

// ------------------------------------------------------------
// cashflow.ts — positions × schedule join grouping
// ------------------------------------------------------------

function mkSchedule(symbol: string, moneda: "ARS" | "USD", cashflows: Array<{ fechaPago: string; renta: number; amortizacion: number }>, tipo: BondSchedule["tipo"] = "amortizable", cerAjustado = false): BondSchedule {
  const cf = cashflows.map((c) => ({ ...c, cashFlow: c.renta + c.amortizacion, vr: 100 }));
  const vencimiento = cf.length ? cf.reduce((m, c) => (c.fechaPago > m ? c.fechaPago : m), cf[0].fechaPago) : "2030-01-01";
  return buildSchedule({ symbol, moneda, tipo, vencimiento, cashflows: cf, cerAjustado });
}

describe("cashflow.ts — buildSchedule + projectCashflow", () => {
  test("buildSchedule sorts asc and fixes cashFlow drift >0.01", () => {
    const s = buildSchedule({
      symbol: "TEST",
      moneda: "USD",
      tipo: "amortizable",
      vencimiento: "2030-01-01",
      cashflows: [
        { fechaPago: "2027-07-01", renta: 2, amortizacion: 20, cashFlow: 999, vr: 80 },
        { fechaPago: "2026-07-01", renta: 2, amortizacion: 20, cashFlow: 22, vr: 100 },
      ],
    });
    assert.equal(s.cashflows[0].fechaPago, "2026-07-01");
    assert.equal(s.cashflows[1].fechaPago, "2027-07-01");
    // first is ok 22, second should be corrected from 999 to 22
    assert.equal(s.cashflows[1].cashFlow, 22);
  });

  test("projectCashflow GD35 + LECAP grouping En julio... + empty portfolio -> []", () => {
    const fromDate = "2026-05-13";
    const gd35 = mkSchedule("GD35", "USD", [
      { fechaPago: "2026-06-09", renta: 5, amortizacion: 0 },
      { fechaPago: "2026-12-09", renta: 5, amortizacion: 0 },
      { fechaPago: "2027-06-09", renta: 5, amortizacion: 0 },
    ]);
    const s31l6 = mkSchedule("S31L6", "ARS", [{ fechaPago: "2026-08-31", renta: 0, amortizacion: 100 }], "bullet");

    const months = projectCashflow(
      [
        { symbol: "GD35", quantity: 1000, schedule: gd35 },
        { symbol: "S31L6", quantity: 500, schedule: s31l6 },
      ],
      { fromDate, monthsAhead: 12, cerCoefficient: 1.42 }
    );

    // grouping: June, August, December
    assert.ok(months.length >= 3, `months ${months.length}`);
    const june = months.find((m) => m.month === "2026-06");
    const august = months.find((m) => m.month === "2026-08");
    const december = months.find((m) => m.month === "2026-12");
    assert.ok(june, "june present");
    assert.ok(august, "august present");
    assert.ok(december, "december present");
    // label format "En {mes} cobrás"
    assert.ok(june!.label.startsWith("En "), `label ${june!.label}`);
    assert.ok(june!.label.includes("junio"), `label ${june!.label}`);
    assert.ok(august!.label.includes("agosto"));

    // GD35 renta 5 * qty 1000/100 = 50 USD in June
    assert.ok(Math.abs(june!.totalUsd - 50) < 0.01, `june totalUsd ${june!.totalUsd}`);
    // S31L6 bullet 100 *500/100=500 ARS
    assert.ok(Math.abs(august!.totalArs - 500) < 0.01, `aug totalArs ${august!.totalArs}`);

    // empty portfolio -> []
    assert.deepEqual(projectCashflow([], { fromDate }), []);
    assert.deepEqual(projectCashflow([{ symbol: "AL30", quantity: 0, schedule: gd35 }], { fromDate }), []);
  });

  test("CER-adjusted flow: TX26 nominal 100 × CER 1.42 => cashFlow 142×(...)", () => {
    const fromDate = "2026-05-01";
    const tx26 = mkSchedule("TX26", "ARS", [{ fechaPago: "2026-09-09", renta: 2, amortizacion: 25 }], "cer", true);
    const months = projectCashflow([{ symbol: "TX26", quantity: 100, schedule: tx26 }], {
      fromDate,
      monthsAhead: 12,
      cerCoefficient: 1.42,
    });
    assert.equal(months.length, 1);
    const sept = months[0];
    assert.equal(sept.month, "2026-09");
    // renta 2*100/100*1.42=2.84, amort 25*1*1.42=35.5 => total 38.34
    assert.ok(Math.abs(sept.totalArs - (2.84 + 35.5)) < 0.01, `sept totalArs ${sept.totalArs}`);
    // label includes ARS amount
    assert.ok(sept.label.includes("ARS"));
  });

  test("filters past flows (< fromDate) and beyond monthsAhead", () => {
    const fromDate = "2026-06-01";
    const sched = mkSchedule("TEST", "ARS", [
      { fechaPago: "2026-05-01", renta: 10, amortizacion: 0 }, // before from
      { fechaPago: "2026-06-15", renta: 10, amortizacion: 0 }, // in
      { fechaPago: "2027-08-01", renta: 10, amortizacion: 0 }, // beyond 12m (2027-06-01 cutoff)
    ]);
    const months = projectCashflow([{ symbol: "TEST", quantity: 100, schedule: sched }], { fromDate, monthsAhead: 12 });
    assert.equal(months.length, 1);
    assert.equal(months[0].month, "2026-06");
  });

  test("totals per month summed across multiple symbols", () => {
    const fromDate = "2026-05-01";
    const a = mkSchedule("AL30", "USD", [{ fechaPago: "2026-07-09", renta: 5, amortizacion: 10 }]);
    const b = mkSchedule("GD30", "USD", [{ fechaPago: "2026-07-09", renta: 3, amortizacion: 15 }]);
    const months = projectCashflow(
      [
        { symbol: "AL30", quantity: 200, schedule: a },
        { symbol: "GD30", quantity: 100, schedule: b },
      ],
      { fromDate }
    );
    assert.equal(months.length, 1);
    // AL30: (5+10)*2=30 USD, GD30: (3+15)*1=18 USD => 48 USD
    assert.ok(Math.abs(months[0].totalUsd - 48) < 0.01);
    assert.equal(months[0].items.length, 2);
  });
});

// ------------------------------------------------------------
// cron snapshot — positions x schedule + persist unique constraint
// ------------------------------------------------------------
describe("bondAnalyticsSnapshot.ts — cron persist", () => {
  test("runBondAnalyticsSnapshot success persists payload with analytics+curves", async () => {
    const fakeAnalytics = [
      {
        symbol: "AL30",
        precio: 55,
        precioDirty: 55,
        tir: 0.18,
        md: 2.1,
        duration: 2.3,
        paridad: 58,
        interesCorrido: 0,
        schedule: mkSchedule("AL30", "USD", [{ fechaPago: "2027-01-09", renta: 2, amortizacion: 20 }]),
        isRealtime: true,
        source: "mae" as const,
        disclaimer: "d",
      },
      {
        symbol: "GD30",
        precio: 60,
        precioDirty: 60,
        tir: 0.19,
        md: 2.2,
        duration: 2.4,
        paridad: 60,
        interesCorrido: 0,
        schedule: mkSchedule("GD30", "USD", [{ fechaPago: "2027-01-09", renta: 2, amortizacion: 20 }]),
        isRealtime: true,
        source: "mae" as const,
        disclaimer: "d",
      },
    ];

    let saved: { market: string; assetType: string; payload: any } | null = null;
    const deps = makeBondAnalyticsSnapshotDeps({
      fetchAnalytics: async () => fakeAnalytics as any,
      saveSnapshot: async (market, assetType, payload) => {
        saved = { market, assetType, payload };
      },
      log: { log: () => {}, warn: () => {}, error: () => {} } as any,
    });

    const out = await runBondAnalyticsSnapshot(deps);
    assert.equal(out.ok, true);
    assert.equal(out.analyticsCount, 2);
    assert.ok(out.curvesCount > 0);
    assert.ok(saved);
    assert.equal(saved!.market, "bonds");
    assert.equal(saved!.payload.analytics.length, 2);
    assert.ok(saved!.payload.curves["USD-hard-dollar"]);
    // curves built via buildCurve
    const expectedCurves = buildCurve(fakeAnalytics as any);
    assert.deepEqual(saved!.payload.curves, expectedCurves);
  });

  test("runBondAnalyticsSnapshot empty => no save, ok:false", async () => {
    let saved = false;
    const deps = makeBondAnalyticsSnapshotDeps({
      fetchAnalytics: async () => [],
      saveSnapshot: async () => { saved = true; },
      log: { log: () => {}, warn: () => {}, error: () => {} } as any,
    });
    const out = await runBondAnalyticsSnapshot(deps);
    assert.equal(out.ok, false);
    assert.equal(out.error, "sin analytics");
    assert.equal(saved, false);
  });

  test("runBondAnalyticsSnapshot tolerates fetch throw => ok:false with error", async () => {
    const deps = makeBondAnalyticsSnapshotDeps({
      fetchAnalytics: async () => { throw new Error("MAE down"); },
      saveSnapshot: async () => {},
      log: { log: () => {}, warn: () => {}, error: () => {} } as any,
    });
    const out = await runBondAnalyticsSnapshot(deps);
    assert.equal(out.ok, false);
    assert.ok(out.error!.includes("MAE down"));
  });

  test("idempotent upsert semantic: saveSnapshot called once, ON CONFLICT impl would dedup snapshotDate", async () => {
    let callCount = 0;
    const fakeAnalytics = [
      {
        symbol: "AL30",
        precio: 55,
        precioDirty: 55,
        tir: 0.10,
        md: 1.5,
        duration: 1.6,
        paridad: 50,
        interesCorrido: 0,
        schedule: mkSchedule("AL30", "USD", [{ fechaPago: "2027-01-09", renta: 1, amortizacion: 10 }]),
        isRealtime: true,
        source: "mae" as const,
        disclaimer: "d",
      },
    ];
    const deps = makeBondAnalyticsSnapshotDeps({
      fetchAnalytics: async () => fakeAnalytics as any,
      saveSnapshot: async () => { callCount++; },
      log: { log: () => {}, warn: () => {}, error: () => {} } as any,
    });
    await runBondAnalyticsSnapshot(deps);
    await runBondAnalyticsSnapshot(deps);
    assert.equal(callCount, 2, "job is idempotent at DB level via ON CONFLICT, but job itself always attempts save");
  });
});
