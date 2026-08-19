import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseArNumber,
  parseArDate,
  decodeEntities,
  parseIolMovements,
  computeMovementHash,
} from "../../src/services/reports/iolMovementsParser.js";

const fixturePath = fileURLToPath(
  new URL("../../test/fixtures/movimientos-historicos.html", import.meta.url)
);
const FIXTURE = readFileSync(fixturePath, "utf-8");

// ============================================================
// Helpers de parseo
// ============================================================

test("parseArNumber: formato AR con coma decimal y punto de miles", () => {
  assert.equal(parseArNumber("1.250,50"), 1250.5);
  assert.equal(parseArNumber("-14.352,26"), -14352.26);
  assert.equal(parseArNumber("0,00"), 0);
  assert.equal(parseArNumber("500.000,00"), 500000);
  assert.equal(parseArNumber("25,30"), 25.3);
  assert.equal(parseArNumber(""), 0);
  assert.equal(parseArNumber("-"), 0);
});

test("parseArDate: dd/mm/yy → YYYY-MM-DD (siglo 2000)", () => {
  assert.equal(parseArDate("18/08/26"), "2026-08-18");
  assert.equal(parseArDate("01/01/99"), "2099-01-01");
  assert.equal(parseArDate(""), null);
  assert.equal(parseArDate("no-es-fecha"), null);
});

test("decodeEntities: entidades numéricas y comunes", () => {
  assert.equal(decodeEntities("Extracci&#243;n"), "Extracción");
  assert.equal(decodeEntities("Cr&#233;dito"), "Crédito");
  assert.equal(decodeEntities("a&nbsp;b"), "a b");
});

// ============================================================
// parseIolMovements — archivo real (malformado)
// ============================================================

test("parseIolMovements: ignora el preámbulo malformado y parsea la tabla", () => {
  const result = parseIolMovements(FIXTURE);
  assert.equal(result.errors.length, 0, "sin errores de archivo");
  assert.equal(result.summary.total, 7, "7 filas de datos");
  // 6 cash + 1 trade (Venta) excluido
  assert.equal(result.summary.valid, 6);
  assert.equal(result.summary.invalid, 1);
});

test("parseIolMovements: extracción negativa NETO (ARS, Liquid. contable)", () => {
  const result = parseIolMovements(FIXTURE);
  const first = result.movements[0];
  assert.equal(first.nroMov, "74468136");
  assert.equal(first.tipoMov, "Extracción de Fondos - Transferencia Electrónica - Ninguno");
  assert.equal(first.liquidDate, "2026-08-18");
  assert.equal(first.monto, -14352.26);
  assert.equal(first.currency, "ARS");
  assert.equal(first.tipo, "withdrawal");
  assert.equal(first.source, "imported");
  assert.equal(first.status, "pending");
  assert.equal(first.valid, true);
});

test("parseIolMovements: depósito y crédito → deposit/dividend válidos", () => {
  const result = parseIolMovements(FIXTURE);
  const deposit = result.movements.find((m) => m.nroMov === "74468140")!;
  assert.equal(deposit.tipo, "deposit");
  assert.equal(deposit.monto, 500000);
  assert.equal(deposit.valid, true);

  const credit = result.movements.find((m) => m.nroMov === "74468150")!;
  assert.equal(credit.tipo, "dividend");
  assert.equal(credit.monto, 12345.67);
});

test("parseIolMovements: trade (Venta) se marca inválido (no es cash movement)", () => {
  const result = parseIolMovements(FIXTURE);
  const trade = result.movements.find((m) => m.nroMov === "74468160")!;
  assert.equal(trade.tipo, "trade");
  assert.equal(trade.valid, false);
  assert.match(trade.validationError ?? "", /trade/i);
});

test("parseIolMovements: operación partida en 2 filas (Pesos+Dólares) se mantienen AMBAS", () => {
  const result = parseIolMovements(FIXTURE);
  const split = result.movements.filter((m) => m.nroMov === "74468170");
  assert.equal(split.length, 2, "mismo nroMov, dos filas");
  const ars = split.find((m) => m.currency === "ARS")!;
  const usd = split.find((m) => m.currency === "USD")!;
  assert.equal(ars.monto, 1000);
  assert.equal(usd.monto, 50);
  assert.equal(ars.tipo, "dividend");
  assert.equal(usd.tipo, "dividend");
});

test("parseIolMovements: extracción en dólares → currency USD", () => {
  const result = parseIolMovements(FIXTURE);
  const usd = result.movements.find((m) => m.nroMov === "74468180")!;
  assert.equal(usd.currency, "USD");
  assert.equal(usd.monto, -2000);
  assert.equal(usd.tipo, "withdrawal");
});

test("parseIolMovements: sin <table> → error de archivo, 0 movimientos", () => {
  const result = parseIolMovements("<html><body>no hay tabla</body></html>");
  assert.equal(result.movements.length, 0);
  assert.ok(result.errors.length > 0);
});

// ============================================================
// Hash de dedup
// ============================================================

test("computeMovementHash: determinista e incluye los campos de dedup", () => {
  const a = computeMovementHash("acc-1", { date: "2026-08-18", amount: -14352.26, currency: "ARS", tipo: "withdrawal", source: "imported" });
  const b = computeMovementHash("acc-1", { date: "2026-08-18", amount: -14352.26, currency: "ARS", tipo: "withdrawal", source: "imported" });
  const c = computeMovementHash("acc-2", { date: "2026-08-18", amount: -14352.26, currency: "ARS", tipo: "withdrawal", source: "imported" });
  assert.equal(a, b, "mismo input → mismo hash");
  assert.notEqual(a, c, "distinto accountId → distinto hash");
});
