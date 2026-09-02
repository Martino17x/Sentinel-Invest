import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMonthCalendar,
  type SnapshotRow,
} from "../../src/services/reports/reportBuilder.js";

// ============================================================
// MONTH CALENDAR — buildMonthCalendar es puro (sin BD): arma el
// grid mensual con TODOS los días (null en los que no hay
// snapshot — nunca inventar, F2-R3), mapea movementCount, y
// computa bestDay/worstDay/monthReturn igual que el reporte
// mensual. Contrato GET /api/portfolio/calendar/:month.
// ============================================================

/** Snapshot mínimo válido para buildMonthCalendar (capturedAt + numerics string). */
function snap(
  dateKey: string,
  values: Partial<{ totalValue: number; dayChangePct: number; cashArs: number; cashUsd: number }> = {}
): SnapshotRow {
  const totalValue = values.totalValue ?? 1000;
  return {
    id: `snap-${dateKey}`,
    accountId: "account-1",
    capturedAt: new Date(`${dateKey}T03:00:00Z`),
    totalValue: String(totalValue),
    totalValueUsd: String(totalValue / 1200),
    cash: String(values.cashArs ?? 0),
    cashArs: String(values.cashArs ?? 0),
    cashUsd: String(values.cashUsd ?? 0),
    positionsValue: String(values.cashArs != null ? totalValue - (values.cashArs ?? 0) : totalValue),
    unrealizedGain: "0",
    dayChangePct: String(values.dayChangePct ?? 0),
    currency: "ARS",
    source: "real",
  } as unknown as SnapshotRow;
}

test("mes sin snapshots → todos los días con null, sin best/worst/monthReturn", () => {
  const cal = buildMonthCalendar("2026-01", []);

  assert.equal(cal.month, "2026-01");
  assert.equal(cal.days.length, 31);
  assert.equal(cal.days[0].date, "2026-01-01");
  assert.equal(cal.days[30].date, "2026-01-31");
  for (const day of cal.days) {
    assert.equal(day.totalValue, null);
    assert.equal(day.dayChangePct, null);
    assert.equal(day.source, null);
    assert.equal(day.cashArs, null);
    assert.equal(day.cashUsd, null);
    assert.equal(day.movementCount, 0);
  }
  assert.equal(cal.bestDay, null);
  assert.equal(cal.worstDay, null);
  assert.equal(cal.monthReturn, null);
});

test("febrero bisiesto → 29 días; común → 28", () => {
  assert.equal(buildMonthCalendar("2028-02", []).days.length, 29);
  assert.equal(buildMonthCalendar("2026-02", []).days.length, 28);
});

test("días con snapshot poblados, resto null (honesto)", () => {
  const cal = buildMonthCalendar("2026-01", [
    snap("2026-01-02", { totalValue: 1000, dayChangePct: 1.5, cashArs: 100, cashUsd: 50 }),
    snap("2026-01-10", { totalValue: 1100, dayChangePct: -0.5, cashArs: 200, cashUsd: 0 }),
    snap("2026-01-20", { totalValue: 1050, dayChangePct: 0, cashArs: 0, cashUsd: 10 }),
  ]);

  const day2 = cal.days.find((d) => d.date === "2026-01-02")!;
  assert.deepEqual(day2.totalValue, 1000);
  assert.deepEqual(day2.dayChangePct, 1.5);
  assert.equal(day2.source, "real");
  assert.deepEqual(day2.cashArs, 100);
  assert.deepEqual(day2.cashUsd, 50);

  // Día intermedio sin snapshot: null, jamás un valor inventado
  const day3 = cal.days.find((d) => d.date === "2026-01-03")!;
  assert.equal(day3.totalValue, null);
  assert.equal(day3.dayChangePct, null);
  assert.equal(day3.source, null);

  const day31 = cal.days.find((d) => d.date === "2026-01-31")!;
  assert.equal(day31.totalValue, null);
});

test("dayChangePct proviene del snapshot almacenado (no recomputado)", () => {
  const cal = buildMonthCalendar("2026-03", [
    snap("2026-03-01", { totalValue: 1000, dayChangePct: 3.33 }),
    snap("2026-03-02", { totalValue: 1033.3, dayChangePct: -1.11 }),
  ]);

  const day1 = cal.days.find((d) => d.date === "2026-03-01")!;
  const day2 = cal.days.find((d) => d.date === "2026-03-02")!;
  assert.deepEqual(day1.dayChangePct, 3.33);
  assert.deepEqual(day2.dayChangePct, -1.11);
});

test("movementCount por día desde el Map (0 por defecto)", () => {
  const cal = buildMonthCalendar(
    "2026-01",
    [snap("2026-01-05", { totalValue: 1000 })],
    new Map([
      ["2026-01-05", 2],
      ["2026-01-17", 1],
    ])
  );

  assert.equal(cal.days.find((d) => d.date === "2026-01-05")!.movementCount, 2);
  assert.equal(cal.days.find((d) => d.date === "2026-01-17")!.movementCount, 1);
  assert.equal(cal.days.find((d) => d.date === "2026-01-18")!.movementCount, 0);
});

test("bestDay/worstDay por variación día a día entre snapshots del mes", () => {
  const cal = buildMonthCalendar("2026-01", [
    snap("2026-01-02", { totalValue: 100 }),
    snap("2026-01-10", { totalValue: 110 }), // +10%
    snap("2026-01-20", { totalValue: 104.5 }), // -5%
  ]);

  assert.deepEqual(cal.bestDay, { date: "2026-01-10", pct: 10 });
  assert.deepEqual(cal.worstDay, { date: "2026-01-20", pct: -5 });
});

test("monthReturn = primer → último snapshot; null con 1 solo snapshot", () => {
  const two = buildMonthCalendar("2026-01", [
    snap("2026-01-02", { totalValue: 100 }),
    snap("2026-01-31", { totalValue: 125 }),
  ]);
  assert.deepEqual(two.monthReturn, 25);

  const one = buildMonthCalendar("2026-01", [snap("2026-01-10", { totalValue: 100 })]);
  assert.equal(one.monthReturn, null);
});

test("source 'reconstructed' se preserva (backfill etiquetado)", () => {
  const s = snap("2026-01-02", { totalValue: 100 });
  s.source = "reconstructed";
  const cal = buildMonthCalendar("2026-01", [s]);
  assert.equal(cal.days.find((d) => d.date === "2026-01-02")!.source, "reconstructed");
});