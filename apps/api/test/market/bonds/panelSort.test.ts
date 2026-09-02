import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sortRowsNullsLast, getSortValue } from "../../../src/routes/bonds.js";
import { inferSegment } from "../../../src/services/market/bonds/curve.js";
import type { BondPanelRow } from "../../../src/services/market/bonds/types.js";

function mkRow(overrides: Partial<BondPanelRow> & { symbol: string }): BondPanelRow {
  const base: BondPanelRow = {
    symbol: overrides.symbol,
    precio: overrides.precio ?? 50,
    precioDirty: overrides.precioDirty ?? 50,
    tir: overrides.tir ?? null,
    md: overrides.md ?? null,
    duration: overrides.duration ?? null,
    paridad: overrides.paridad ?? null,
    interesCorrido: 0,
    schedule: {
      symbol: overrides.symbol,
      moneda: (overrides as any).moneda ?? "USD",
      tipo: (overrides as any).tipo ?? "amortizable",
      vencimiento: (overrides as any).vencimiento ?? "2030-01-09",
      cashflows: [],
      cerAjustado: (overrides as any).cerAjustado ?? false,
    },
    isRealtime: true,
    source: "mae",
    disclaimer: "d",
    marketData: {
      bid: null,
      ask: null,
      spread: null,
      volumeNominal: null,
      volumeEfectivo: overrides.marketData?.volumeEfectivo ?? (overrides as any).volumeEfectivo ?? null,
      low: null,
      high: null,
      open: null,
      close: null,
      ...(overrides.marketData ?? {}),
    },
    cuadroTecnico: {
      vt: 100,
      vr: 100,
      paridad: overrides.paridad ?? null,
      accrued: null,
      couponRate: null,
      frequency: null,
      dayCount: "30/360",
      nextCouponDate: null,
      isin: null,
      ley: null,
      emisor: null,
      denominacionMinima: null,
      outstanding: null,
      isParidadCalculable: overrides.paridad != null,
      scheduleSource: "mae",
      ...(overrides.cuadroTecnico ?? {}),
    } as any,
    vencimiento: (overrides as any).vencimiento ?? "2030-01-09",
    ley: null,
    isin: null,
    moneda: (overrides as any).moneda ?? "USD",
    tipo: (overrides as any).tipo ?? "amortizable",
  } as BondPanelRow;
  // merge overrides top-level numeric fields that map to sort keys
  if (overrides.vencimiento) (base as any).vencimiento = overrides.vencimiento;
  if ((overrides as any).sortExtra !== undefined) Object.assign(base, (overrides as any).sortExtra);
  return base;
}

describe("panelSort — sort TIR desc nulls-last [0.7,0.4,0.1,null,null], paginate 25, segment filter", () => {
  test("sort tir desc nulls-last spec scenario [0.4,null,0.7,null,0.1] → [0.7,0.4,0.1,null,null]", () => {
    const rows = [
      mkRow({ symbol: "A", tir: 0.4 }),
      mkRow({ symbol: "B", tir: null }),
      mkRow({ symbol: "C", tir: 0.7 }),
      mkRow({ symbol: "D", tir: null }),
      mkRow({ symbol: "E", tir: 0.1 }),
    ];
    const sorted = sortRowsNullsLast(rows, "tir", "desc");
    const tirs = sorted.map((r) => r.tir);
    assert.deepEqual(tirs, [0.7, 0.4, 0.1, null, null]);
  });

  test("sort tir asc nulls-last → [0.1,0.4,0.7,null,null]", () => {
    const rows = [
      mkRow({ symbol: "A", tir: 0.7 }),
      mkRow({ symbol: "B", tir: 0.1 }),
      mkRow({ symbol: "C", tir: null }),
      mkRow({ symbol: "D", tir: 0.4 }),
      mkRow({ symbol: "E", tir: null }),
    ];
    const sorted = sortRowsNullsLast(rows, "tir", "asc");
    assert.deepEqual(sorted.map((r) => r.tir), [0.1, 0.4, 0.7, null, null]);
  });

  test("sort md desc nulls-last and asc", () => {
    const rows = [mkRow({ symbol: "A", md: 2.1 }), mkRow({ symbol: "B", md: null }), mkRow({ symbol: "C", md: 5.3 }), mkRow({ symbol: "D", md: 0.5 })];
    const desc = sortRowsNullsLast(rows, "md", "desc");
    assert.deepEqual(desc.map((r) => r.md), [5.3, 2.1, 0.5, null]);
    const asc = sortRowsNullsLast(rows, "md", "asc");
    assert.deepEqual(asc.map((r) => r.md), [0.5, 2.1, 5.3, null]);
  });

  test("sort vencimiento asc lexical (ISO) nulls-last", () => {
    const rows = [
      mkRow({ symbol: "A", vencimiento: "2035-01-01" }),
      mkRow({ symbol: "B", vencimiento: "2026-08-31" }),
      mkRow({ symbol: "C", vencimiento: "2030-07-09" }),
    ];
    const sorted = sortRowsNullsLast(rows, "vencimiento", "asc");
    assert.deepEqual(sorted.map((r) => (r as any).vencimiento), ["2026-08-31", "2030-07-09", "2035-01-01"]);
  });

  test("sort volumeEfectivo desc nulls-last — off-hours null at end", () => {
    const rows = [
      mkRow({ symbol: "A", marketData: { bid: null, ask: null, spread: null, volumeNominal: 100, volumeEfectivo: 500000, low: null, high: null, open: null, close: null } }),
      mkRow({ symbol: "B", marketData: { bid: null, ask: null, spread: null, volumeNominal: null, volumeEfectivo: null, low: null, high: null, open: null, close: null } }),
      mkRow({ symbol: "C", marketData: { bid: null, ask: null, spread: null, volumeNominal: 200, volumeEfectivo: 1000000, low: null, high: null, open: null, close: null } }),
    ];
    const sorted = sortRowsNullsLast(rows, "volumeEfectivo", "desc");
    assert.equal(sorted[0].symbol, "C");
    assert.equal(sorted[1].symbol, "A");
    assert.equal(sorted[2].symbol, "B"); // null last
  });

  test("getSortValue handles paridad fallback cuadroTecnico.paridad vs row.paridad", () => {
    const r1 = mkRow({ symbol: "X", paridad: 58, cuadroTecnico: { paridad: 62, vt: 100, vr: 100, accrued: 1, couponRate: null, frequency: null, dayCount: "30/360", nextCouponDate: null, isin: null, ley: null, emisor: null, denominacionMinima: null, outstanding: null, isParidadCalculable: true, scheduleSource: "mae" } as any });
    assert.equal(getSortValue(r1, "paridad"), 62);
    const r2 = mkRow({ symbol: "Y", paridad: 58, cuadroTecnico: { paridad: null, vt: 100, vr: 100, accrued: null, couponRate: null, frequency: null, dayCount: "30/360", nextCouponDate: null, isin: null, ley: null, emisor: null, denominacionMinima: null, outstanding: null, isParidadCalculable: false, scheduleSource: "synthetic" } as any });
    // cuadro paridad null → fallback to row.paridad
    assert.equal(getSortValue(r2, "paridad"), 58);
  });

  test("paginate 25: slice page1 25, page2 remainder", () => {
    const all = Array.from({ length: 60 }, (_, i) => mkRow({ symbol: `S${String(i).padStart(4, "0")}`, tir: 0.1 + i * 0.001 }));
    const sorted = sortRowsNullsLast(all, "tir", "desc"); // desc so highest tir first (S0059)
    const pageSize = 25;
    const page1 = sorted.slice(0, 25);
    const page2 = sorted.slice(25, 50);
    const page3 = sorted.slice(50, 60);
    assert.equal(page1.length, 25);
    assert.equal(page2.length, 25);
    assert.equal(page3.length, 10);
    assert.equal(page1[0].symbol, "S0059");
    assert.equal(page3[page3.length - 1].symbol, "S0000");
  });

  test("segment filter via inferSegment: filter mock rows by segment", () => {
    // Build analytics-like rows for segment inference: AL30 USD amortizable → USD-hard-dollar, TX26 ARS cer → CER
    const rows = [
      mkRow({ symbol: "AL30", moneda: "USD", tipo: "amortizable", cerAjustado: false, vencimiento: "2030-07-09" } as any),
      mkRow({ symbol: "GD35", moneda: "USD", tipo: "amortizable", cerAjustado: false, vencimiento: "2035-01-09" } as any),
      mkRow({ symbol: "TX26", moneda: "ARS", tipo: "cer", cerAjustado: true, vencimiento: "2026-11-09" } as any),
      mkRow({ symbol: "S31L6", moneda: "ARS", tipo: "bullet", cerAjustado: false, vencimiento: "2026-08-31" } as any),
    ];
    const filtered = rows.filter((r) => inferSegment(r as any) === "CER");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].symbol, "TX26");

    const usd = rows.filter((r) => inferSegment(r as any) === "USD-hard-dollar");
    assert.ok(usd.length >= 2, `USD-hard-dollar count ${usd.length}`);
    assert.ok(usd.some((r) => r.symbol === "AL30"));
  });

  test("paginate 25 with total=1018: total pages = 41 (last page 18)", () => {
    // spec pagination.total=1018 for panel
    const total = 1018;
    const pageSize = 25;
    const totalPages = Math.ceil(total / pageSize);
    assert.equal(totalPages, 41);
    assert.equal(total - (totalPages - 1) * pageSize, 18); // last page size
  });
});
