import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeDailySnapshotDeps,
  runDailySnapshots,
  type DailySnapshotDeps,
} from "../../src/jobs/dailySnapshot.js";
import type { PortfolioSummary } from "../../src/services/iol/types.js";

// ============================================================
// DAILY SNAPSHOT — con fakes (D3): una cuenta que falla (IOL caído,
// credenciales inválidas) se loguea y el job continúa con el resto
// (spec F1-R1 escenario "proveedor IOL caído").
// ============================================================

const silentLog = { log() {}, warn() {}, error() {} };

function fakePortfolio(accountNumber: string): PortfolioSummary {
  return {
    accountNumber,
    cashArs: 100_000,
    cashUsd: 0,
    positionsValueArs: 900_000,
    positionsValueUsd: 0,
    totalArs: 1_000_000,
    totalUsd: 0,
    gainLossArs: 50_000,
    gainLossUsd: 0,
    gainLossPct: 5,
    dayChangePct: 1.2,
    dayChangeAmountArs: 12_000,
    dayChangeAmountUsd: 0,
    distribution: [{ label: "efectivo", pct: 10 }],
    distributionByType: [],
    positions: [],
  };
}

function depsWith(overrides: Partial<DailySnapshotDeps>): DailySnapshotDeps {
  return makeDailySnapshotDeps({ log: silentLog, ...overrides });
}

test("una cuenta que falla no mata el job — las demás se capturan", async () => {
  const calls: string[] = [];
  const deps = depsWith({
    getCredentials: async () => ({ username: "u", password: "p" }),
    provider: {
      async getPortfolio(_creds, accountNumber) {
        if (accountNumber === "A-001") throw new Error("IOL caído");
        return fakePortfolio(accountNumber);
      },
    },
    saveSnapshot: async (accountId) => {
      calls.push(accountId);
      return true;
    },
    listActiveAccounts: async () => [
      { id: "acc-a", userId: "u1", iolAccountNumber: "A-001" },
      { id: "acc-b", userId: "u1", iolAccountNumber: "A-002" },
      { id: "acc-c", userId: "u2", iolAccountNumber: "A-003" },
    ],
  });

  const outcomes = await runDailySnapshots(deps);

  assert.equal(outcomes.length, 3);
  assert.deepEqual(
    outcomes.map((o) => o.ok),
    [false, true, true]
  );
  assert.equal(outcomes[0].error, "IOL caído");
  assert.deepEqual(calls, ["acc-b", "acc-c"], "las cuentas sanas se guardan");
});

test("credenciales que fallan → ok:false y el resto continúa", async () => {
  const deps = depsWith({
    provider: { getPortfolio: async (_c, accountNumber) => fakePortfolio(accountNumber) },
    getCredentials: async (userId) => {
      if (userId === "u-bad") throw new Error("credenciales inválidas");
      return { username: "u", password: "p" };
    },
    saveSnapshot: async () => true,
    listActiveAccounts: async () => [
      { id: "acc-bad", userId: "u-bad", iolAccountNumber: "A-001" },
      { id: "acc-ok", userId: "u-ok", iolAccountNumber: "A-002" },
    ],
  });

  const outcomes = await runDailySnapshots(deps);

  assert.equal(outcomes[0].ok, false);
  assert.match(outcomes[0].error ?? "", /credenciales/);
  assert.equal(outcomes[1].ok, true);
  assert.equal(outcomes[1].saved, true);
});

test("snapshot ya existente del día (idempotencia) → saved:false sin error", async () => {
  const deps = depsWith({
    getCredentials: async () => ({ username: "u", password: "p" }),
    provider: { getPortfolio: async () => fakePortfolio("A-001") },
    saveSnapshot: async () => false,
    listActiveAccounts: async () => [{ id: "acc-a", userId: "u1", iolAccountNumber: "A-001" }],
  });

  const [outcome] = await runDailySnapshots(deps);

  assert.equal(outcome.ok, true);
  assert.equal(outcome.saved, false);
  assert.equal(outcome.error, undefined);
});