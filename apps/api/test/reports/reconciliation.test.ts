import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expectedCashDelta,
  reconcileDay,
  type CashMovementLike,
  type OperationLike,
  type SnapshotLike,
} from "../../src/services/reports/reconciliation.js";

// ============================================================
// RECONCILIACIÓN DE EFECTIVO — funciones puras (spec F3-B2/B3/B5,
// design D5/D6). deltaCash vs snapshot ANTERIOR; gaps atribuidos al
// rango; umbral > 100 (unidades de la moneda) O > 1% del cash.
// ============================================================

const op = (overrides: Partial<OperationLike>): OperationLike => ({
  type: "buy",
  status: "accepted",
  currency: "ARS",
  total: 0,
  commission: 0,
  date: "2026-08-14T14:00:00.000Z",
  ...overrides,
});

const mov = (overrides: Partial<CashMovementLike>): CashMovementLike => ({
  date: "2026-08-14",
  amount: 0,
  currency: "ARS",
  status: "confirmed",
  ...overrides,
});

const snap = (overrides: Partial<SnapshotLike>): SnapshotLike => ({
  date: "2026-08-14",
  cashArs: 0,
  cashUsd: 0,
  ...overrides,
});

// ============================================================
// expectedCashDelta
// ============================================================

test("expectedCashDelta: suma solo movimientos confirmed del rango y moneda", () => {
  const movements = [
    mov({ date: "2026-08-14", amount: 500_000 }),
    mov({ date: "2026-08-14", amount: 100_000, status: "pending" }),
    mov({ date: "2026-08-14", amount: 100_000, status: "rejected" }),
    mov({ date: "2026-08-13", amount: 1_000 }),
    mov({ date: "2026-08-14", amount: 50, currency: "USD" }),
  ];
  assert.equal(expectedCashDelta("ARS", "2026-08-14", "2026-08-14", [], movements), 500_000);
  assert.equal(expectedCashDelta("USD", "2026-08-14", "2026-08-14", [], movements), 50);
});

test("expectedCashDelta: ventas suman, compras restan, comisiones siempre restan", () => {
  const operations = [
    op({ type: "sell", total: 118_500, commission: 177.75 }),
    op({ type: "buy", total: 20_340, commission: 30.51 }),
  ];
  assert.equal(expectedCashDelta("ARS", "2026-08-14", "2026-08-14", operations, []), 118_500 - 20_340 - 177.75 - 30.51);
});

test("expectedCashDelta: suscripción FCI es compra-like, rescate es venta-like", () => {
  const operations = [
    op({ type: "subscription", total: 50_000, commission: 0 }),
    op({ type: "redemption", total: 12_000, commission: 0 }),
  ];
  assert.equal(expectedCashDelta("ARS", "2026-08-14", "2026-08-14", operations, []), 12_000 - 50_000);
});

test("expectedCashDelta: ignora ops no accepted, fuera de rango y de otra moneda", () => {
  const operations = [
    op({ type: "buy", total: 10_000, status: "pending" }),
    op({ type: "buy", total: 10_000, status: "rejected" }),
    op({ type: "buy", total: 10_000, date: "2026-08-13T14:00:00.000Z" }),
    op({ type: "buy", total: 10_000, currency: "USD" }),
    op({ type: "buy", total: 1_000 }),
  ];
  assert.equal(expectedCashDelta("ARS", "2026-08-14", "2026-08-14", operations, []), -1_000);
});

test("expectedCashDelta: rango [from,to] inclusivo con fechas límite", () => {
  const operations = [
    op({ type: "sell", total: 100, date: "2026-08-14T10:00:00.000Z" }),
    op({ type: "sell", total: 200, date: "2026-08-15T10:00:00.000Z" }),
    op({ type: "sell", total: 400, date: "2026-08-16T10:00:00.000Z" }),
  ];
  assert.equal(expectedCashDelta("ARS", "2026-08-14", "2026-08-15", operations, []), 300);
});

// ============================================================
// reconcileDay
// ============================================================

test("reconcileDay: depósito manual confirmado explica el delta → sin detected", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 1_000 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 1_500 }),
    operations: [],
    movements: [mov({ date: "2026-08-15", amount: 500 })],
  });
  assert.equal(result.deltaCash, 500);
  assert.equal(result.expected, 500);
  assert.equal(result.unexplained, 0);
  assert.equal(result.thresholdExceeded, false);
  assert.equal(result.movement, null);
});

test("reconcileDay: compra explicada (total + comisión) → sin detected", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 1_000 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 800 }),
    operations: [op({ type: "buy", total: 200, commission: 0, date: "2026-08-15T10:00:00.000Z" })],
    movements: [],
  });
  assert.equal(result.deltaCash, -200);
  assert.equal(result.expected, -200);
  assert.equal(result.unexplained, 0);
  assert.equal(result.movement, null);
});

test("reconcileDay: delta inexplicado ≥ umbral → detected deposit/pending con mensaje", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 1_000 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 2_600 }),
    operations: [],
    movements: [],
  });
  assert.equal(result.deltaCash, 1_600);
  assert.equal(result.expected, 0);
  assert.equal(result.unexplained, 1_600);
  assert.equal(result.thresholdExceeded, true);
  assert.ok(result.movement, "movimiento detectado");
  assert.equal(result.movement!.date, "2026-08-15");
  assert.equal(result.movement!.amount, 1_600);
  assert.equal(result.movement!.currency, "ARS");
  assert.equal(result.movement!.type, "deposit");
  assert.equal(result.movement!.source, "detected");
  assert.equal(result.movement!.status, "pending");
  assert.equal(result.movement!.suggestedType, "dividend", "ingreso sin operaciones → dividendo probable");
  assert.equal(result.movement!.message, "¿Fue un dividendo o cupón? +$1.600");
});

test("reconcileDay: delta negativo inexplicado → withdrawal con mensaje", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 10_000 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 2_000 }),
    operations: [],
    movements: [],
  });
  assert.ok(result.movement);
  assert.equal(result.movement!.type, "withdrawal");
  assert.equal(result.movement!.amount, -8_000);
  assert.equal(result.movement!.message, "¿Fue una extracción? -$8.000");
});

test("reconcileDay: bajo el umbral absoluto (≤ 100) y ≤ 1% → ignorado", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 10_000 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 10_080 }),
    operations: [],
    movements: [],
  });
  assert.equal(result.unexplained, 80);
  assert.equal(result.thresholdExceeded, false);
  assert.equal(result.movement, null);
});

test("reconcileDay: 1% del cash como umbral alternativo (delta > 1% aunque < 100)", () => {
  const result = reconcileDay({
    currency: "USD",
    prevSnapshot: snap({ date: "2026-08-14", cashUsd: 10 }),
    todaySnapshot: snap({ date: "2026-08-15", cashUsd: 15 }),
    operations: [],
    movements: [],
  });
  assert.ok(result.movement, "USD +5 = 50% del cash → supera el 1%");
  assert.equal(result.movement!.currency, "USD");
  assert.equal(result.movement!.amount, 5);
});

test("reconcileDay: por moneda — un detected USD no toca el ARS y viceversa", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 10_000, cashUsd: 10 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 10_000, cashUsd: 15 }),
    operations: [],
    movements: [],
  });
  assert.equal(result.deltaCash, 0, "cash ARS no se movió");
  assert.equal(result.movement, null, "el delta USD no genera detected ARS");
});

test("reconcileDay: gaps (fines de semana/feriados) → el delta se atribuye al rango completo", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 1_000 }), // viernes
    todaySnapshot: snap({ date: "2026-08-18", cashArs: 1_600 }), // lunes
    operations: [],
    movements: [mov({ date: "2026-08-17", amount: 400 })], // mov dentro del rango
  });
  assert.equal(result.deltaCash, 600);
  assert.equal(result.expected, 400);
  assert.equal(result.unexplained, 200);
  assert.equal(result.thresholdExceeded, true, "200 > 100 → detected");
  assert.equal(result.movement!.amount, 200);
});

test("reconcileDay: con operaciones en el rango → suggestedType adjustment", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 1_000 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 2_600 }),
    operations: [op({ type: "buy", total: 100, date: "2026-08-15T10:00:00.000Z" })],
    movements: [],
  });
  assert.ok(result.movement);
  assert.equal(result.movement!.suggestedType, "adjustment");
  assert.equal(result.movement!.message, "¿Fue un ajuste? +$1.700");
});

test("reconcileDay: umbrales custom (absoluteThreshold/pctThreshold)", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 100_000 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 100_500 }),
    operations: [],
    movements: [],
    absoluteThreshold: 1_000,
  });
  assert.equal(result.unexplained, 500);
  assert.equal(result.thresholdExceeded, false, "500 < 1000 custom y 500 < 1% de 100500 (=1005)");
});

test("reconcileDay: cash 0 con movimiento inexplicado → detected (1% de 0 = 0)", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 0 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: -50 }),
    operations: [],
    movements: [],
  });
  assert.ok(result.movement, "salir cash negativo sin operaciones → detected");
  assert.equal(result.movement!.type, "withdrawal");
});

test("reconcileDay: unexplained exactamente 0 nunca genera detected", () => {
  const result = reconcileDay({
    currency: "ARS",
    prevSnapshot: snap({ date: "2026-08-14", cashArs: 1_000 }),
    todaySnapshot: snap({ date: "2026-08-15", cashArs: 1_000 }),
    operations: [],
    movements: [],
  });
  assert.equal(result.unexplained, 0);
  assert.equal(result.thresholdExceeded, false);
  assert.equal(result.movement, null);
});