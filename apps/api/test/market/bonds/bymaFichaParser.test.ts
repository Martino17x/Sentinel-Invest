import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseInteresToCouponRate, parseFormaAmortizacion } from "../../../src/services/iol/BymaDataProvider.js";

// 5.2 Unit bymaFichaParser — 6 BYMA fixtures
describe("parseInteresToCouponRate — 6 BYMA fixtures", () => {
  test("AL30: 0,50% semestral → rate 0.005, frequency 2, 30/360", () => {
    const r = parseInteresToCouponRate("0,50% semestral");
    assert.ok(r, "should parse AL30");
    assert.ok(Math.abs(r!.rate - 0.005) < 1e-9);
    assert.equal(r!.frequency, 2);
    assert.equal(r!.dayCount, "30/360");
  });

  test("AL30 alt: Cupón 0,5% semestral 30/360", () => {
    const r = parseInteresToCouponRate("Cupón 0,5% semestral 30/360");
    assert.ok(r);
    assert.ok(Math.abs(r!.rate - 0.005) < 1e-9);
    assert.equal(r!.frequency, 2);
  });

  test("GD35: 1,00% step-up semestral", () => {
    const r = parseInteresToCouponRate("1,00% step-up semestral");
    assert.ok(r);
    assert.ok(Math.abs(r!.rate - 0.01) < 1e-9);
    assert.equal(r!.frequency, 2);
  });

  test("TX26: CER + 1,50% → CER dayCount Actual/365", () => {
    const r = parseInteresToCouponRate("CER + 1,50%");
    assert.ok(r, "TX26 CER+ should parse");
    assert.ok(Math.abs(r!.rate - 0.015) < 1e-9);
    assert.equal(r!.dayCount, "Actual/365");
    assert.equal(r!.frequency, 2); // default semestral
  });

  test("T2X5: CER + 4,00% with explicit date", () => {
    const r = parseInteresToCouponRate("CER + 4,00% semestral — último cupón 2025-08-13");
    assert.ok(r);
    assert.ok(Math.abs(r!.rate - 0.04) < 1e-9);
    assert.equal(r!.dayCount, "Actual/365");
    // lastCouponDate extracted if present
    if (r!.lastCouponDate) assert.equal(r!.lastCouponDate, "2025-08-13");
  });

  test("S31L6: A descuento → null (LECAP)", () => {
    assert.equal(parseInteresToCouponRate("A descuento"), null);
    assert.equal(parseInteresToCouponRate("a descuento capitalizable"), null);
    assert.equal(parseInteresToCouponRate("Cero cupón"), null);
  });

  test("BPOA7: — dash → null", () => {
    assert.equal(parseInteresToCouponRate("—"), null);
    assert.equal(parseInteresToCouponRate("-"), null);
    assert.equal(parseInteresToCouponRate(""), null);
    assert.equal(parseInteresToCouponRate(null), null);
  });

  test("trimestral frequency 4 and anual frequency 1", () => {
    const tri = parseInteresToCouponRate("2,00% trimestral");
    assert.ok(tri);
    assert.equal(tri!.frequency, 4);
    const anual = parseInteresToCouponRate("5,00% anual");
    assert.ok(anual);
    assert.equal(anual!.frequency, 1);
  });

  test("percent with dot separator 1.50%", () => {
    const r = parseInteresToCouponRate("1.50% semestral");
    assert.ok(r);
    assert.ok(Math.abs(r!.rate - 0.015) < 1e-9);
  });

  test("only CER without % → null", () => {
    assert.equal(parseInteresToCouponRate("Ajustable por CER"), null);
    assert.equal(parseInteresToCouponRate("CER"), null);
  });
});

describe("parseFormaAmortizacion — bullet vs N cuotas semestrales", () => {
  test("bullet: Integra al vencimiento", () => {
    const r = parseFormaAmortizacion("Integra al vencimiento");
    assert.equal(r.tipo, "bullet");
    assert.equal(r.cuotas, 1);
  });

  test("bullet: pago único", () => {
    const r = parseFormaAmortizacion("Pago único al vencimiento");
    assert.equal(r.tipo, "bullet");
  });

  test("bullet: dash —", () => {
    const r = parseFormaAmortizacion("—");
    assert.equal(r.tipo, "bullet");
  });

  test("LECAP Letra -> bullet", () => {
    const r = parseFormaAmortizacion("Letra a descuento");
    assert.equal(r.tipo, "bullet");
    assert.equal(r.cuotas, 1);
  });

  test("12 cuotas semestrales", () => {
    const r = parseFormaAmortizacion("12 cuotas semestrales iguales el 9 de enero y 9 de julio desde julio 2027 hasta enero 2033");
    assert.equal(r.tipo, "amortizable");
    assert.equal(r.cuotas, 12);
    assert.equal(r.frequency, 2);
  });

  test("6 cuotas trimestrales", () => {
    const r = parseFormaAmortizacion("6 cuotas trimestrales");
    assert.equal(r.tipo, "amortizable");
    assert.equal(r.cuotas, 6);
    assert.equal(r.frequency, 4);
  });

  test("generic cuotas without number → amortizable null cuotas", () => {
    const r = parseFormaAmortizacion("Amortización en cuotas");
    assert.equal(r.tipo, "amortizable");
  });

  test("empty string → bullet fallback", () => {
    const r = parseFormaAmortizacion("");
    assert.equal(r.tipo, "bullet");
    assert.equal(r.cuotas, 1);
  });

  test("raw preserved", () => {
    const raw = "12 cuotas semestrales";
    const r = parseFormaAmortizacion(raw);
    assert.equal(r.raw, raw);
  });
});
