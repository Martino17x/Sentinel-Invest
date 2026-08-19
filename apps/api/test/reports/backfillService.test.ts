import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runBackfill,
  rollbackBackfill,
  type BackfillDeps,
  type BackfillResult,
} from "../../src/services/reports/backfillService.js";
import type { BackfillSnapshot, OperationInput } from "../../src/services/reports/backfill.js";

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

function makeDeps(overrides: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    accountId: "acc-1",
    from: "2026-08-01",
    to: "2026-08-03",
    getOperations: async () => [],
    getClose: () => 100,
    getCurrentBalances: async () => ({ cashArs: 500, cashUsd: 0, asOf: "2026-08-03" }),
    getNetFlows: async () => [],
    hasRealSnapshot: async () => false,
    insertSnapshot: async () => {},
    ...overrides,
  };
}

// ============================================================
// runBackfill
// ============================================================

test("runBackfill: inserta donde NO hay real y omite donde SÍ hay", async () => {
  const inserted: BackfillSnapshot[] = [];
  const deps = makeDeps({
    getOperations: async () => [
      op({ symbol: "A", type: "buy", quantity: 10, total: 1000, commission: 10, date: "2026-08-01T14:00:00.000Z" }),
      op({ symbol: "A", type: "sell", quantity: 4, total: 400, date: "2026-08-03T14:00:00.000Z" }),
    ],
    getNetFlows: async () => [
      { date: "2026-08-01", netFlowArs: -1010, netFlowUsd: 0 },
      { date: "2026-08-02", netFlowArs: 0, netFlowUsd: 0 },
      { date: "2026-08-03", netFlowArs: 400, netFlowUsd: 0 },
    ],
    // día 1 ya tiene snapshot real → debe omitirse
    hasRealSnapshot: async (date) => date === "2026-08-01",
    insertSnapshot: async (snap) => {
      inserted.push(snap);
    },
  });

  const result: BackfillResult = await runBackfill(deps);
  assert.equal(result.inserted, 2, "días 2 y 3 insertados");
  assert.equal(result.skipped, 1, "día 1 omitido (real existente)");
  assert.equal(inserted.length, 2);

  const day3 = inserted.find((s) => s.date === "2026-08-03")!;
  assert.equal(day3.positionsValueArs, 600, "6 × 100");
  assert.equal(day3.cashArs, 500, "cash hacia atrás: día 3 = saldo actual");
  assert.equal(day3.totalValue, 1100);
  assert.equal(day3.source, "reconstructed");
});

test("runBackfill: todo reconstruido cuando no hay reales", async () => {
  const inserted: BackfillSnapshot[] = [];
  const deps = makeDeps({
    getOperations: async () => [
      op({ symbol: "A", type: "buy", quantity: 1, total: 100, date: "2026-08-01T14:00:00.000Z" }),
    ],
    hasRealSnapshot: async () => false,
    insertSnapshot: async (snap) => {
      inserted.push(snap);
    },
  });
  const result = await runBackfill(deps);
  assert.equal(result.inserted, 3);
  assert.equal(result.skipped, 0);
});

test("runBackfill: todos reales → 0 insertados", async () => {
  const deps = makeDeps({ hasRealSnapshot: async () => true });
  const result = await runBackfill(deps);
  assert.equal(result.inserted, 0);
  assert.equal(result.skipped, 3);
});

// ============================================================
// rollbackBackfill
// ============================================================

test("rollbackBackfill: elimina los reconstruidos y devuelve el count", async () => {
  let deleted = 0;
  const result = await rollbackBackfill({
    accountId: "acc-1",
    deleteReconstructed: async () => {
      deleted = 3;
      return 3;
    },
  });
  assert.equal(result, 3);
  assert.equal(deleted, 3);
});
