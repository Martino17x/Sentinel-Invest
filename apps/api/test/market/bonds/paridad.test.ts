import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calcCuadroTecnico,
  calcAccruedInterest,
  calcAccruedFromFicha,
  calcParidad,
  _helpers,
} from "../../../src/services/market/bonds/paridad.js";

// ------------------------------------------------------------
// 5.1 Unit paridad — calcCuadroTecnico + calcAccruedInterest
// ------------------------------------------------------------
describe("paridad.ts — calcCuadroTecnico null accrued → paridad null, vt=vr", () => {
  test("accrued null → paridad null, vt=vr, isParidadCalculable false", () => {
    const r = calcCuadroTecnico({ dirtyPrice: 95, vr: 100, accrued: null });
    assert.equal(r.vt, 100);
    assert.equal(r.paridad, null);
    assert.equal(r.isCalculable, false);
    assert.equal(r.isParidadCalculable, false);
  });

  test("accrued undefined → same guard as null", () => {
    const r = calcCuadroTecnico({ dirtyPrice: 95, vr: 100 });
    assert.equal(r.vt, 100);
    assert.equal(r.paridad, null);
    assert.equal(r.isCalculable, false);
  });

  test("accrued NaN → not finite → paridad null", () => {
    const r = calcCuadroTecnico({ dirtyPrice: 95, vr: 100, accrued: NaN });
    assert.equal(r.paridad, null);
    assert.equal(r.isCalculable, false);
  });

  test("accrued 0 → vt=vr, paridad calculable (vt>0)", () => {
    // 0 is finite, hasAccrued true, vt=vr+0=100, paridad=95/100*100=95
    const r = calcCuadroTecnico({ dirtyPrice: 95, vr: 100, accrued: 0 });
    assert.equal(r.vt, 100);
    assert.equal(r.paridad, 95);
    assert.equal(r.isCalculable, true);
    assert.equal(r.isParidadCalculable, true);
  });

  test("accrued 3% → vt=103, paridad = dirty/vt*100", () => {
    const r = calcCuadroTecnico({ dirtyPrice: 95, vr: 100, accrued: 3 });
    assert.equal(r.vt, 103);
    const expected = (95 / 103) * 100;
    assert.ok(Math.abs(r.paridad! - expected) < 1e-9, `paridad ${r.paridad} vs ${expected}`);
    assert.equal(r.isParidadCalculable, true);
  });

  test("vr 80 + accrued 2.5 → vt 82.5, paridad = 58.2/82.5*100", () => {
    const r = calcCuadroTecnico({ dirtyPrice: 58.2, vr: 80, accrued: 2.5 });
    assert.equal(r.vt, 82.5);
    assert.ok(Math.abs(r.paridad! - (58.2 / 82.5) * 100) < 1e-9);
  });

  test("vt <=0 → paridad null even with accrued", () => {
    const r = calcCuadroTecnico({ dirtyPrice: 50, vr: 0, accrued: 0 });
    assert.equal(r.vt, 0);
    assert.equal(r.paridad, null);
    assert.equal(r.isCalculable, false);
  });

  test("dirty NaN or vr NaN → vt handling", () => {
    const r = calcCuadroTecnico({ dirtyPrice: NaN, vr: 100, accrued: 2 });
    // calcParidad(NaN, 102) → null, but vt still 102
    assert.equal(r.vt, 102);
    assert.equal(r.paridad, null);
    const r2 = calcCuadroTecnico({ dirtyPrice: 95, vr: NaN, accrued: null });
    assert.equal(r2.vt, null);
    assert.equal(r2.paridad, null);
  });
});

describe("paridad.ts — calcAccruedInterest 30/360 vs Actual/365", () => {
  test("30/360 30 days → 100*0.04*30/360 = 0.333...", () => {
    const v = calcAccruedInterest({
      annualCouponRate: 0.04,
      valorResidual: 100,
      lastCouponDate: "2026-01-01",
      settlement: "2026-01-31",
      dayCount: "30/360",
    });
    assert.ok(Math.abs(v - (100 * 0.04 * 30) / 360) < 1e-9, `30/360 got ${v}`);
  });

  test("Actual/365 30 days → 100*0.04*30/365 = 0.328...", () => {
    const v = calcAccruedInterest({
      annualCouponRate: 0.04,
      valorResidual: 100,
      lastCouponDate: "2026-01-01",
      settlement: "2026-01-31",
      dayCount: "Actual/365",
    });
    assert.ok(Math.abs(v - (100 * 0.04 * 30) / 365) < 1e-9);
  });

  test("Actual/365 < 30/360 for same period (30 days)", () => {
    const a30 = calcAccruedInterest({
      annualCouponRate: 0.05,
      lastCouponDate: "2026-03-01",
      settlement: "2026-03-31",
      dayCount: "30/360",
    });
    const a365 = calcAccruedInterest({
      annualCouponRate: 0.05,
      lastCouponDate: "2026-03-01",
      settlement: "2026-03-31",
      dayCount: "Actual/365",
    });
    // 30 days both cases → 0.0416 vs 0.0410, 30/360 slightly higher
    assert.ok(a365 < a30, `Actual ${a365} should be < 30/360 ${a30}`);
  });

  test("31-day month: 30/360 clamps to 30, Actual counts 31", () => {
    // Jan 01 → Feb 01: Actual =31 days, 30/360 =30 days
    const v30 = calcAccruedInterest({
      annualCouponRate: 0.12,
      lastCouponDate: "2026-01-01",
      settlement: "2026-02-01",
      dayCount: "30/360",
    });
    const vAct = calcAccruedInterest({
      annualCouponRate: 0.12,
      lastCouponDate: "2026-01-01",
      settlement: "2026-02-01",
      dayCount: "Actual/365",
    });
    const exp30 = 100 * 0.12 * 30 / 360;
    const expAct = 100 * 0.12 * 31 / 365;
    assert.ok(Math.abs(v30 - exp30) < 1e-9);
    assert.ok(Math.abs(vAct - expAct) < 1e-9);
  });

  test("helper daysActual vs days30_360 direct", () => {
    assert.equal(_helpers.daysActual("2026-01-01", "2026-01-31"), 30);
    assert.equal(_helpers.days30_360("2026-01-01", "2026-01-31"), 30);
    assert.equal(_helpers.daysActual("2026-01-01", "2026-02-01"), 31);
    assert.equal(_helpers.days30_360("2026-01-01", "2026-02-01"), 30);
    // Jan 31 → Feb 28 edge: 30/360 d1=31→30, d2=28 → diff
    assert.ok(_helpers.days30_360("2026-01-31", "2026-02-28") === 28, `${_helpers.days30_360("2026-01-31", "2026-02-28")}`);
  });

  test("calcAccruedFromFicha null couponRate or null lastCouponDate → null", () => {
    assert.equal(calcAccruedFromFicha({ couponRate: null, lastCouponDate: "2026-01-01", settlement: "2026-02-01" }), null);
    assert.equal(calcAccruedFromFicha({ couponRate: 0.04, lastCouponDate: null, settlement: "2026-02-01" }), null);
    assert.equal(calcAccruedFromFicha({ couponRate: 0, lastCouponDate: "2026-01-01", settlement: "2026-02-01" }), null);
  });

  test("calcAccruedFromFicha AL30 style 0.5% semestral 30/360 produces accrued", () => {
    const v = calcAccruedFromFicha({
      couponRate: 0.005,
      lastCouponDate: "2026-01-09",
      settlement: "2026-02-09",
      vr: 100,
      dayCount: "30/360",
      frequency: 2,
    });
    assert.ok(v != null && v > 0, `accrued ${v}`);
    // 30 days 0.5% annual: 100*0.005*30/360=0.0416
    assert.ok(Math.abs(v! - 0.041666) < 0.001);
  });

  test("calcParidad direct guards", () => {
    assert.equal(calcParidad(50, 0), null);
    assert.equal(calcParidad(NaN, 100), null);
    assert.equal(calcParidad(50, NaN), null);
    assert.ok(Math.abs(calcParidad(58.2, 100)! - 58.2) < 1e-9);
  });
});
