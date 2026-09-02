import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runReconciliation,
  type ReconciliationJobDeps,
  type ActiveAccount,
} from "../../src/jobs/reconciliation.js";
import type { DetectedMovement } from "../../src/services/reports/reconciliation.js";

// ============================================================
// RECONCILIATION JOB — con fakes (D3): detección de deltas
// inexplicados, inserción de detected/pending, idempotencia en
// rerun (doble run sin duplicados) y dominancia por moneda.
// ============================================================

const silentLog = { log() {}, warn() {}, error() {} };

function makeDeps(overrides: Partial<ReconciliationJobDeps> = {}): ReconciliationJobDeps {
  const inserted: DetectedMovement[] = [];
  return {
    log: silentLog,
    listActiveAccounts: async (): Promise<ActiveAccount[]> => [
      { id: "acc-1", userId: "u1", iolAccountNumber: "A-1" },
    ],
    getSnapshotPair: async () => ({
      prev: { date: "2026-08-18", cashArs: 100_000, cashUsd: 0 },
      today: { date: "2026-08-19", cashArs: 100_000, cashUsd: 0 },
    }),
    getOperationsForRange: async () => [],
    getConfirmedMovements: async () => [],
    getExistingDetected: async () => null,
    insertDetectedMovement: async (_accountId, m) => {
      inserted.push(m);
    },
    ...overrides,
    // exponer el spy aunque esté en overrides
    ...(overrides as { __inserted?: DetectedMovement[] }),
  } as ReconciliationJobDeps & { __inserted?: DetectedMovement[] };
}

test("delta inexplicado ≥ umbral → crea detected/pending (ARS depósito)", async () => {
  const inserted: DetectedMovement[] = [];
  const deps = makeDeps({
    getSnapshotPair: async () => ({
      prev: { date: "2026-08-18", cashArs: 100_000, cashUsd: 0 },
      today: { date: "2026-08-19", cashArs: 200_000, cashUsd: 0 },
    }),
    insertDetectedMovement: async (_a, m) => {
      inserted.push(m);
    },
  });

  const [outcome] = await runReconciliation(deps);

  assert.equal(outcome.ok, true);
  assert.equal(outcome.created, true);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].currency, "ARS");
  assert.equal(inserted[0].type, "deposit");
  assert.equal(inserted[0].source, "detected");
  assert.equal(inserted[0].status, "pending");
  assert.equal(inserted[0].amount, 100_000);
});

test("doble run sin duplicados (idempotente por detected 1/día)", async () => {
  let inserted = 0;
  const deps = makeDeps({
    getSnapshotPair: async () => ({
      prev: { date: "2026-08-18", cashArs: 100_000, cashUsd: 0 },
      today: { date: "2026-08-19", cashArs: 200_000, cashUsd: 0 },
    }),
    // el detected solo "existe" a partir del primer insert (simula el
    // rerun: el primer run lo crea, el segundo lo encuentra y omite).
    getExistingDetected: async () => (inserted > 0 ? { id: "existing-1" } : null),
    insertDetectedMovement: async () => {
      inserted++;
    },
  });

  const first = await runReconciliation(deps);
  const second = await runReconciliation(deps);

  assert.equal(first[0].created, true);
  assert.equal(second[0].created, false);
  assert.equal(second[0].skipped, true, "segundo run omite por existente");
  assert.equal(inserted, 1, "solo se inserta una vez en dos runs");
});

test("delta explicado por movimiento confirmed → sin detected", async () => {
  let inserted = 0;
  const deps = makeDeps({
    getSnapshotPair: async () => ({
      prev: { date: "2026-08-18", cashArs: 100_000, cashUsd: 0 },
      today: { date: "2026-08-19", cashArs: 200_000, cashUsd: 0 },
    }),
    getConfirmedMovements: async () => [
      { date: "2026-08-19", amount: 100_000, currency: "ARS", status: "confirmed" },
    ],
    insertDetectedMovement: async () => {
      inserted++;
    },
  });

  const [outcome] = await runReconciliation(deps);

  assert.equal(outcome.created, false);
  assert.equal(inserted, 0);
});

test("delta bajo umbral → sin detected", async () => {
  let inserted = 0;
  const deps = makeDeps({
    getSnapshotPair: async () => ({
      prev: { date: "2026-08-18", cashArs: 100_000, cashUsd: 0 },
      today: { date: "2026-08-19", cashArs: 100_050, cashUsd: 0 },
    }),
    insertDetectedMovement: async () => {
      inserted++;
    },
  });

  const [outcome] = await runReconciliation(deps);

  assert.equal(outcome.created, false);
  assert.equal(inserted, 0);
});

test("ARS y USD ambos inexplicados → inserta solo el dominante (1/día)", async () => {
  const inserted: DetectedMovement[] = [];
  const deps = makeDeps({
    getSnapshotPair: async () => ({
      prev: { date: "2026-08-18", cashArs: 0, cashUsd: 0 },
      today: { date: "2026-08-19", cashArs: 500_000, cashUsd: 200_000 },
    }),
    insertDetectedMovement: async (_a, m) => {
      inserted.push(m);
    },
  });

  const [outcome] = await runReconciliation(deps);

  assert.equal(outcome.created, true);
  assert.equal(inserted.length, 1, "1 detected/día pese a 2 monedas");
  assert.equal(inserted[0].currency, "ARS", "domina el de mayor |monto|");
  assert.equal(inserted[0].amount, 500_000);
});

test("sin snapshots → omitido sin insertar ni error", async () => {
  let inserted = 0;
  const deps = makeDeps({
    getSnapshotPair: async () => ({ prev: null, today: null }),
    insertDetectedMovement: async () => {
      inserted++;
    },
  });

  const [outcome] = await runReconciliation(deps);

  assert.equal(outcome.processed, false);
  assert.equal(outcome.created, false);
  assert.equal(inserted, 0);
});

test("una cuenta que falla no mata el job — las demás continúan", async () => {
  let inserted = 0;
  const deps = makeDeps({
    listActiveAccounts: async () => [
      { id: "acc-bad", userId: "u-bad", iolAccountNumber: "A-BAD" },
      { id: "acc-ok", userId: "u-ok", iolAccountNumber: "A-OK" },
    ],
    getSnapshotPair: async (accountId) => {
      if (accountId === "acc-bad") throw new Error("BD caída");
      return {
        prev: { date: "2026-08-18", cashArs: 100_000, cashUsd: 0 },
        today: { date: "2026-08-19", cashArs: 100_000, cashUsd: 0 },
      };
    },
    insertDetectedMovement: async () => {
      inserted++;
    },
  });

  const outcomes = await runReconciliation(deps);

  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0].ok, false);
  assert.match(outcomes[0].error ?? "", /BD caída/);
  assert.equal(outcomes[1].ok, true);
  assert.equal(inserted, 0);
});
