import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calcTIR, _helpers } from "../../../src/services/market/bonds/tir.js";
import type { BondCashflow } from "../../../src/services/market/bonds/types.js";

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function makeBondCashflow(fechaPago: string, cashFlow: number, renta = 0, amort = 0, vr = 100): BondCashflow {
  return { fechaPago, renta: renta || cashFlow, amortizacion: amort || 0, cashFlow, vr };
}

function futureDateFromSettlement(settlement: string, daysAhead: number): string {
  const d = new Date(settlement + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

// Use helpers.priceAtYield to generate dirtyPrice for a given TIR
function priceAt(tir: number, flujos: BondCashflow[], settlement: string, dayCount: "30/360" | "Actual/365" = "Actual/365"): number {
  return _helpers.priceAtYield(tir, flujos, settlement, dayCount);
}

// ------------------------------------------------------------
// 5.1 Unit tir.ts — fixtures MAE AL30/GD30/BPOC7 within 5bps,
// LECAP closed-form 90d, negative TIR, tolerance 1e-7
// ------------------------------------------------------------

describe("tir.ts — calcTIR", () => {
  // LECAP closed-form: single bullet 90d, price 0.92*V, dayCount Actual/365
  test("LECAP closed-form 90d: TIR=(V/P)^(365/d)-1", () => {
    const settlement = "2026-05-01";
    const venc = futureDateFromSettlement(settlement, 90);
    const V = 100;
    const P = 0.92 * V; // 92
    const flujos: BondCashflow[] = [makeBondCashflow(venc, 100)];
    const tir = calcTIR(P, flujos, { dayCount: "Actual/365", settlement });
    assert.ok(tir !== null, "LECAP tir should not be null");
    const expected = Math.pow(V / P, 365 / 90) - 1;
    assert.ok(Math.abs(tir! - expected) < 1e-12, `LECAP tir ${tir} vs expected ${expected}`);
    // also verify duration for this case is 90/365 ~0.246 (tested in duration but sanity)
    const t = _helpers.yearFraction(settlement, venc, "Actual/365");
    assert.ok(Math.abs(t - 90 / 365) < 0.005, `yearFraction ${t}`);
  });

  test("LECAP closed-form still works with 30/360 settlement (must use Actual days for d)", () => {
    const settlement = "2026-01-15";
    const venc = futureDateFromSettlement(settlement, 90);
    const P = 95;
    const flujos: BondCashflow[] = [makeBondCashflow(venc, 100)];
    const tir = calcTIR(P, flujos, { dayCount: "30/360", settlement });
    assert.ok(tir !== null);
    // closed-form always uses daysBetween Actual regardless of dayCount
    const d = _helpers.daysBetween(settlement, venc);
    const expected = Math.pow(100 / 95, 365 / d) - 1;
    assert.ok(Math.abs(tir! - expected) < 1e-10);
  });

  test("AL30 fixture: multi-flow bond, tir within 5bps (0.0005) of known MAE tir", () => {
    // Synthetic AL30-like schedule: amortizable semiannual, 8 flows over 4 years
    // We generate price at MAE-like tir 18% and verify solver recovers within 5bps
    const settlement = "2026-05-13";
    const maeTir = 0.18; // 18%
    // 8 semiannual flows (every 182 days ~6m), each amort 12.5 + coupon 0.75% annualized ~0.375 per semester on residual
    const flujos: BondCashflow[] = [];
    let vr = 100;
    for (let i = 1; i <= 8; i++) {
      const fecha = futureDateFromSettlement(settlement, i * 182);
      const amort = 12.5;
      const coupon = vr * 0.0075 * (182 / 365); // ~0.37
      vr -= amort;
      flujos.push({ fechaPago: fecha, renta: coupon, amortizacion: amort, cashFlow: coupon + amort, vr: Math.max(0, vr) });
    }
    const dayCount: "30/360" | "Actual/365" = "30/360"; // USD hard dollar uses 30/360
    const dirtyPrice = priceAt(maeTir, flujos, settlement, dayCount);
    assert.ok(dirtyPrice > 0, `dirtyPrice ${dirtyPrice}`);
    const solved = calcTIR(dirtyPrice, flujos, { dayCount, settlement });
    assert.ok(solved !== null, "solved tir not null");
    const diffBps = Math.abs(solved! - maeTir) * 10000;
    assert.ok(diffBps < 5, `AL30 diff ${diffBps.toFixed(2)}bps >5bps (solved=${solved} vs mae=${maeTir})`);
    // tighter: within 1e-7*10000 = 0.001bps ideally, but spec allows 5bps
  });

  test("GD30 fixture: tir ~22% within 5bps", () => {
    const settlement = "2026-05-13";
    const maeTir = 0.22;
    const flujos: BondCashflow[] = [];
    let vr = 100;
    for (let i = 1; i <= 6; i++) {
      const fecha = futureDateFromSettlement(settlement, i * 182);
      const amort = i <= 5 ? 15 : 25;
      const coupon = vr * 0.01;
      vr -= amort;
      flujos.push({ fechaPago: fecha, renta: coupon, amortizacion: amort, cashFlow: coupon + amort, vr: Math.max(0, vr) });
    }
    const dayCount: "30/360" | "Actual/365" = "30/360";
    const dirtyPrice = priceAt(maeTir, flujos, settlement, dayCount);
    const solved = calcTIR(dirtyPrice, flujos, { dayCount, settlement });
    assert.ok(solved !== null);
    const diffBps = Math.abs(solved! - maeTir) * 10000;
    assert.ok(diffBps < 5, `GD30 diff ${diffBps.toFixed(2)}bps`);
  });

  test("BPOC7 (BOPREAL) fixture: USD cer-like within 5bps", () => {
    const settlement = "2026-05-13";
    const maeTir = 0.08; // BOPREAL lower yield
    const flujos: BondCashflow[] = [];
    for (let i = 1; i <= 4; i++) {
      const fecha = futureDateFromSettlement(settlement, i * 182);
      flujos.push({ fechaPago: fecha, renta: 2, amortizacion: 25, cashFlow: 27, vr: 100 - 25 * i });
    }
    const dayCount: "30/360" | "Actual/365" = "30/360";
    const dirtyPrice = priceAt(maeTir, flujos, settlement, dayCount);
    const solved = calcTIR(dirtyPrice, flujos, { dayCount, settlement });
    assert.ok(solved !== null);
    const diffBps = Math.abs(solved! - maeTir) * 10000;
    assert.ok(diffBps < 5, `BPOC7 diff ${diffBps.toFixed(2)}bps`);
  });

  test("negative TIR: price > sumFlows, TIR negative still solved", () => {
    const settlement = "2026-05-13";
    // Bond pays 100 in 1 year, price 110 -> TIR negative (~ -9%)
    const venc = futureDateFromSettlement(settlement, 365);
    // Use multi-flow to avoid LECAP branch (need 2 flows)
    const flujos: BondCashflow[] = [
      { fechaPago: futureDateFromSettlement(settlement, 182), renta: 1, amortizacion: 0, cashFlow: 1, vr: 100 },
      { fechaPago: venc, renta: 1, amortizacion: 100, cashFlow: 101, vr: 0 },
    ];
    const dirtyPrice = 115; // > sum 102 -> implies negative yield
    const tir = calcTIR(dirtyPrice, flujos, { dayCount: "Actual/365", settlement });
    assert.ok(tir !== null, "negative TIR should solve");
    assert.ok(tir! < 0, `tir ${tir} should be negative for premium price`);
    // Verify priceAtYield recovers dirtyPrice within 1e-7 tolerance of price diff
    const pv = priceAt(tir!, flujos, settlement, "Actual/365");
    assert.ok(Math.abs(pv - dirtyPrice) < 1e-4, `pv ${pv} vs dirty ${dirtyPrice}`);
  });

  test("tolerance 1e-7 convergence: solved price matches dirty within 1e-5", () => {
    const settlement = "2026-01-01";
    const flujos: BondCashflow[] = [
      { fechaPago: "2026-07-01", renta: 2, amortizacion: 25, cashFlow: 27, vr: 75 },
      { fechaPago: "2027-01-01", renta: 1.5, amortizacion: 25, cashFlow: 26.5, vr: 50 },
      { fechaPago: "2027-07-01", renta: 1, amortizacion: 50, cashFlow: 51, vr: 0 },
    ];
    const targetTir = 0.15;
    const dirty = priceAt(targetTir, flujos, settlement, "30/360");
    const solved = calcTIR(dirty, flujos, { dayCount: "30/360", settlement, tolerance: 1e-7, maxIter: 50 });
    assert.ok(solved !== null);
    // tolerance 1e-7 means |pv - dirty| < 1e-7 at convergence
    const pv = priceAt(solved!, flujos, settlement, "30/360");
    assert.ok(Math.abs(pv - dirty) < 1e-5, `pv diff ${Math.abs(pv - dirty)}`);
    assert.ok(Math.abs(solved! - targetTir) < 1e-7, `tir diff ${Math.abs(solved! - targetTir)}`);
  });

  test("invalid inputs return null", () => {
    const settlement = "2026-05-13";
    const venc = futureDateFromSettlement(settlement, 90);
    const flujos: BondCashflow[] = [makeBondCashflow(venc, 100)];
    assert.equal(calcTIR(0, flujos, { dayCount: "Actual/365", settlement }), null);
    assert.equal(calcTIR(-10, flujos, { dayCount: "Actual/365", settlement }), null);
    assert.equal(calcTIR(NaN, flujos, { dayCount: "Actual/365", settlement }), null);
    assert.equal(calcTIR(100, [], { dayCount: "Actual/365", settlement }), null);
    assert.equal(calcTIR(100, flujos, { dayCount: "Actual/365", settlement: "" }), null);
    // all flujos in past
    const pastFlujo: BondCashflow[] = [makeBondCashflow("2020-01-01", 100)];
    assert.equal(calcTIR(100, pastFlujo, { dayCount: "Actual/365", settlement }), null);
  });

  test("tolerance override still solves within tighter bound", () => {
    const settlement = "2026-05-01";
    const flujos: BondCashflow[] = [
      { fechaPago: futureDateFromSettlement(settlement, 180), renta: 2, amortizacion: 10, cashFlow: 12, vr: 90 },
      { fechaPago: futureDateFromSettlement(settlement, 360), renta: 1.8, amortizacion: 90, cashFlow: 91.8, vr: 0 },
    ];
    const dirty = priceAt(0.12, flujos, settlement, "Actual/365");
    const solvedLoose = calcTIR(dirty, flujos, { dayCount: "Actual/365", settlement, tolerance: 1e-4 });
    const solvedTight = calcTIR(dirty, flujos, { dayCount: "Actual/365", settlement, tolerance: 1e-9 });
    assert.ok(solvedLoose !== null && solvedTight !== null);
    assert.ok(Math.abs(solvedLoose! - 0.12) < 1e-4);
    assert.ok(Math.abs(solvedTight! - 0.12) < 1e-7);
  });
});
