import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getTasks } from "node-cron";
import { startScheduledJobs } from "../../src/jobs/scheduler.js";

// ============================================================
// SCHEDULER — con fakes (D3): guard de tabla, kill-switches
// (enabled salvo env === 'false'), stop() y handler inyectado.
// ============================================================

const silentLog = { log() {}, warn() {}, error() {} };

const ORIGINAL_ENV: Record<string, string | undefined> = {
  SNAPSHOT_JOB_ENABLED: process.env.SNAPSHOT_JOB_ENABLED,
  RECONCILIATION_JOB_ENABLED: process.env.RECONCILIATION_JOB_ENABLED,
  IOL_PROVIDER: process.env.IOL_PROVIDER,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("tabla ausente → started:false y nada se agenda", async () => {
  const jobs = await startScheduledJobs({
    log: silentLog,
    tablesReady: async () => false,
  });

  assert.equal(jobs.started, false);
  assert.equal(jobs.snapshot.scheduled, false);
  assert.equal(jobs.reconciliation.scheduled, false);
  jobs.stop();
});

test("kill-switches=false → no-op (nada se agenda, started:true)", async () => {
  process.env.SNAPSHOT_JOB_ENABLED = "false";
  process.env.RECONCILIATION_JOB_ENABLED = "false";

  const jobs = await startScheduledJobs({
    log: silentLog,
    tablesReady: async () => true,
  });

  assert.equal(jobs.started, true);
  assert.equal(jobs.snapshot.enabled, false);
  assert.equal(jobs.snapshot.scheduled, false);
  assert.equal(jobs.reconciliation.enabled, false);
  assert.equal(jobs.reconciliation.scheduled, false);
  jobs.stop();
});

test("default: snapshot agendado; reconciliación sin handler no agenda (llega en F3-4)", async () => {
  delete process.env.SNAPSHOT_JOB_ENABLED;
  delete process.env.RECONCILIATION_JOB_ENABLED;

  const jobs = await startScheduledJobs({
    log: silentLog,
    tablesReady: async () => true,
  });

  assert.equal(jobs.started, true);
  assert.equal(jobs.snapshot.scheduled, true);
  assert.equal(jobs.reconciliation.enabled, true);
  assert.equal(jobs.reconciliation.scheduled, false, "sin handler no agenda");
  jobs.stop();
});

test("el task agendado ejecuta el handler inyectado (execute) y stop() lo destruye", async () => {
  delete process.env.SNAPSHOT_JOB_ENABLED;
  delete process.env.RECONCILIATION_JOB_ENABLED;
  process.env.IOL_PROVIDER = "api";

  let runs = 0;
  const jobs = await startScheduledJobs({
    log: silentLog,
    tablesReady: async () => true,
    runSnapshot: async () => {
      runs++;
    },
  });

  const task = findTask("daily-snapshot");
  assert.ok(task, "task daily-snapshot registrada en node-cron");
  await task.execute();
  assert.equal(runs, 1, "el handler inyectado corre una vez por ejecución");

  jobs.stop();
  assert.ok(!findTask("daily-snapshot"), "stop() destruye el task");
});

// El registry de node-cron se indexa por id (aleatorio), no por name —
// buscar por name para los asserts de tests.
function findTask(name: string) {
  return [...getTasks().values()].find((t) => t.name === name);
}