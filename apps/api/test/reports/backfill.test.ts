import { test } from "node:test";
import assert from "node:assert/strict";
import {
  walkPositions,
  walkCashBackwards,
  buildNetFlows,
  type OperationInput,
  type MovementInput,
  type GetClose,
} from "../../src/services/reports/backfill.js";

const fixed = (price: number): GetClose => () => price;

const op = (overrides: Partial<OperationInput>): OperationInput => ({
  symbol: "A",
  market: "bcba",
  type: "buy",
  status: "accepted",
  quantity: 0,
  total: 0,
  commission: 0,
  currency: "ARS",
  date: "2026-08-01T14:00:00.000Z",
  ...overrides,
});

// ============================================================
// walkPositions — posiciones hacia adelante
// ============================================================

test("walkPositions: aplica compra y venta por día y valora al cierre", () => {
  const operations: OperationInput[] = [
    op({ symbol: "A", type: "buy", quantity: 10, total: 1000, commission: 10, date: "2026-08-01T14:00:00.000Z" }),
    op({ symbol: "A", type: "sell", quantity: 4, total: 400, date: "2026-08-03T14:00:00.000Z" }),
  ];
  const snaps = walkPositions(operations, "2026-08-01", "2026-08-03", fixed(100));
  assert.equal(snaps.length, 3);

  assert.equal(snaps[0].date, "2026-08-01");
  assert.equal(snaps[0].positionsValueArs, 1000, "10 × 100");
  assert.equal(snaps[0].positions[0].quantity, 10);

  assert.equal(snaps[1].date, "2026-08-02");
  assert.equal(snaps[1].positionsValueArs, 1000, "sin ops ese día → carry");

  assert.equal(snaps[2].date, "2026-08-03");
  assert.equal(snaps[2].positionsValueArs, 600, "6 × 100 tras vender 4");
  assert.equal(snaps[2].positions[0].quantity, 6);
});

test("walkPositions: posiciones iniciales + moneda USD separada", () => {
  const operations: OperationInput[] = [
    op({ symbol: "B", market: "nyse", type: "buy", quantity: 2, total: 200, currency: "USD", date: "2026-08-02T14:00:00.000Z" }),
  ];
  const snaps = walkPositions(
    operations,
    "2026-08-01",
    "2026-08-02",
    fixed(50),
    { initialPositions: [{ symbol: "A", market: "bcba", quantity: 3, currency: "ARS" }] }
  );
  // día 1: solo la posición inicial A (3 × 50 = 150 ARS)
  assert.equal(snaps[0].positionsValueArs, 150);
  assert.equal(snaps[0].positionsValueUsd, 0);
  // día 2: A(3×50=150) + B(2×50=100 USD)
  assert.equal(snaps[1].positionsValueArs, 150);
  assert.equal(snaps[1].positionsValueUsd, 100);
});

test("walkPositions: ignora ops no accepted y posteriores a 'to'", () => {
  const operations: OperationInput[] = [
    op({ symbol: "A", type: "buy", quantity: 5, status: "pending", date: "2026-08-01T14:00:00.000Z" }),
    op({ symbol: "A", type: "buy", quantity: 7, date: "2026-08-02T14:00:00.000Z" }), // después de 'to'
  ];
  const snaps = walkPositions(operations, "2026-08-01", "2026-08-01", fixed(10));
  assert.equal(snaps[0].positionsValueArs, 0, "ninguna op válida en rango");
});

// ============================================================
// walkCashBackwards — cash hacia atrás
// ============================================================

test("walkCashBackwards: cash(d-1) = cash(d) − netFlow(d)", () => {
  const flows = [
    { date: "2026-08-01", netFlowArs: -200, netFlowUsd: 0 },
    { date: "2026-08-02", netFlowArs: 500, netFlowUsd: 0 },
  ];
  const cash = walkCashBackwards(1000, 0, flows);
  assert.equal(cash.get("2026-08-02")!.cashArs, 1000, "último día = saldo actual");
  assert.equal(cash.get("2026-08-01")!.cashArs, 500, "día previo = 1000 − 500");
});

test("walkCashBackwards: USD se resuelve en paralelo a ARS", () => {
  const flows = [{ date: "2026-08-01", netFlowArs: 0, netFlowUsd: -50 }];
  const cash = walkCashBackwards(300, 100, flows);
  assert.equal(cash.get("2026-08-01")!.cashArs, 300);
  assert.equal(cash.get("2026-08-01")!.cashUsd, 100, "antes del flujo USD negativo = 100 + 50");
});

// ============================================================
// buildNetFlows
// ============================================================

test("buildNetFlows: compras restan, ventas suman, comisión siempre resta", () => {
  const operations: OperationInput[] = [
    op({ symbol: "A", type: "buy", quantity: 1, total: 1000, commission: 10, date: "2026-08-01T14:00:00.000Z" }),
    op({ symbol: "A", type: "sell", quantity: 1, total: 400, date: "2026-08-02T14:00:00.000Z" }),
  ];
  const flows = buildNetFlows(operations, [], "2026-08-01", "2026-08-02");
  assert.equal(flows[0].netFlowArs, -1010, "compra: −total − comisión");
  assert.equal(flows[1].netFlowArs, 400, "venta: +total");
});

test("buildNetFlows: movimientos confirmed del mismo día se suman al flujo", () => {
  const operations: OperationInput[] = [];
  const movements: MovementInput[] = [
    { date: "2026-08-01", amount: 250, currency: "ARS", status: "confirmed" },
    { date: "2026-08-01", amount: 100, currency: "ARS", status: "pending" }, // ignorado
  ];
  const flows = buildNetFlows(operations, movements, "2026-08-01", "2026-08-01");
  assert.equal(flows[0].netFlowArs, 250);
});
