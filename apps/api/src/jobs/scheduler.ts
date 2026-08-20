// ============================================================
// SCHEDULER — jobs diarios del portafolio (node-cron)
//
// D2: cron "30 17 * * 1-5" en tz ART, arrancado en index.ts
// tras ensureSchema(). Kill-switches por env (patrón AGENT_ENABLED
// de index.ts:27): habilitado salvo que la env sea literalmente
// 'false'. stop() para tests/shutdown. Guard de tabla: si
// portfolio_snapshots no existe, los jobs NO arrancan (boot
// degradado, la app sigue viva).
//
// El handler de reconciliación (jobs/reconciliation.ts) se conecta acá
// vía runDailyReconciliation, detrás del kill-switch
// RECONCILIATION_JOB_ENABLED (D2).
// ============================================================

import { schedule, type ScheduledTask } from "node-cron";
import { pool } from "../db/index.js";
import { makeDailySnapshotDeps, runDailySnapshots } from "./dailySnapshot.js";
import { runDailyReconciliation } from "./reconciliation.js";
import { makeQuotesSnapshotDeps, runQuotesSnapshots } from "./quotesSnapshot.js";

const SNAPSHOT_CRON = "30 17 * * 1-5"; // 17:30 ART, lunes a viernes (F1-R1)
const QUOTES_SNAPSHOT_CRON = "5 17 * * 1-5"; // 17:05 ART, lun-vie — snapshot de cotizaciones al cierre
const RECONCILIATION_CRON = "30 18 * * 1-5"; // 18:30 ART, tras el snapshot (se afina en F3-4)
const CRON_TZ = "America/Argentina/Buenos_Aires";

const SNAPSHOT_TASK_NAME = "daily-snapshot";
const QUOTES_SNAPSHOT_TASK_NAME = "quotes-snapshot";
const RECONCILIATION_TASK_NAME = "daily-reconciliation";

export interface ScheduledJobState {
  enabled: boolean;
  scheduled: boolean;
}

/** Handle devuelto por startScheduledJobs — stop() para tests/shutdown. */
export interface ScheduledJobs {
  started: boolean;
  snapshot: ScheduledJobState;
  quotesSnapshot: ScheduledJobState;
  reconciliation: ScheduledJobState;
  stop: () => void;
}

export interface SchedulerDeps {
  log?: Pick<Console, "log" | "warn" | "error">;
  /** Guard de tabla inyectable (tests lo reemplazan por un fake). */
  tablesReady?: () => Promise<boolean>;
  /** Guard de tabla quotes — inyectable para tests del nuevo job. */
  quotesTablesReady?: () => Promise<boolean>;
  /** Handler del snapshot diario — por defecto runDailySnapshots real. */
  runSnapshot?: () => Promise<unknown>;
  /** Handler de snapshot de cotizaciones — por defecto runQuotesSnapshots real. */
  runQuotesSnapshot?: () => Promise<unknown>;
  /** Handler de reconciliación — lo conecta F3-4. */
  runReconciliation?: () => Promise<unknown>;
}

async function defaultTablesReady(): Promise<boolean> {
  try {
    const result = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.portfolio_snapshots') IS NOT NULL AS exists"
    );
    return result.rows[0]?.exists ?? false;
  } catch {
    return false;
  }
}

async function defaultQuotesTablesReady(): Promise<boolean> {
  try {
    const result = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.quotes_snapshots') IS NOT NULL AS exists"
    );
    return result.rows[0]?.exists ?? false;
  } catch {
    return false;
  }
}

/** Wrapper default del snapshot: respeta el modo de provider (como portfolio.ts:33). */
function defaultRunSnapshot(
  log: Pick<Console, "log" | "warn" | "error">
): () => Promise<unknown> {
  return async () => {
    // En modo mock no hay captura real (la cuenta "demo" no está en BD);
    // guard espejo del de la ruta GET /api/portfolio (portfolio.ts:33).
    if (process.env.IOL_PROVIDER !== "api") return;
    await runDailySnapshots(makeDailySnapshotDeps({ log }));
  };
}

function defaultRunQuotesSnapshot(
  log: Pick<Console, "log" | "warn" | "error">
): () => Promise<unknown> {
  return async () => {
    await runQuotesSnapshots(makeQuotesSnapshotDeps({ log }));
  };
}

/**
 * Arranca los jobs diarios. Idempotente por diseño (cada boot lo vuelve
 * a llamar una vez). La idempotencia del snapshot (unique(account_id,
 * captured_at) + ON CONFLICT DO NOTHING) es la defensa primaria contra
 * doble instancia (D2/D4).
 */
export async function startScheduledJobs(deps: SchedulerDeps = {}): Promise<ScheduledJobs> {
  const log = deps.log ?? console;
  const tasks: ScheduledTask[] = [];
  const stop = () => {
    for (const task of tasks) task.destroy();
    tasks.length = 0;
  };

  const portfolioReady = await (deps.tablesReady ?? defaultTablesReady)();
  const quotesReady = await (deps.quotesTablesReady ?? deps.tablesReady ?? defaultQuotesTablesReady)();

  if (!portfolioReady && !quotesReady) {
    log.warn("⚠️ scheduler: portfolio_snapshots y quotes_snapshots ausentes — jobs NO arrancan");
    return {
      started: false,
      snapshot: { enabled: false, scheduled: false },
      quotesSnapshot: { enabled: false, scheduled: false },
      reconciliation: { enabled: false, scheduled: false },
      stop,
    };
  }

  if (!portfolioReady) {
    log.warn("⚠️ scheduler: portfolio_snapshots ausente — snapshot/reconciliación NO arrancan (quotes sí)");
  }

  const snapshotEnabled = process.env.SNAPSHOT_JOB_ENABLED !== "false";
  const reconciliationEnabled = process.env.RECONCILIATION_JOB_ENABLED !== "false";
  const quotesEnabled = process.env.QUOTES_SNAPSHOT_ENABLED !== "false";

  // — Quotes snapshot 17:05 (independiente de portfolio) —
  let quotesScheduled = false;
  if (quotesReady && quotesEnabled) {
    const run = deps.runQuotesSnapshot ?? defaultRunQuotesSnapshot(log);
    const task = schedule(QUOTES_SNAPSHOT_CRON, () => {
      run().catch((err) => {
        log.error("⚠️ scheduler: quotes-snapshot falló:", err instanceof Error ? err : new Error(String(err)));
      });
    }, {
      timezone: CRON_TZ,
      name: QUOTES_SNAPSHOT_TASK_NAME,
      noOverlap: true,
      unref: true,
    });
    tasks.push(task);
    quotesScheduled = true;
    log.log("🕒 scheduler: snapshot de cotizaciones 17:05 ART (L–V) activo");
  } else if (!quotesReady) {
    log.warn("⚠️ scheduler: quotes_snapshots ausente — snapshot de cotizaciones NO arranca");
  } else {
    log.log("🕒 scheduler: QUOTES_SNAPSHOT_ENABLED=false → snapshot de cotizaciones deshabilitado");
  }

  // — Portfolio snapshot 17:30 —
  let snapshotScheduled = false;
  if (portfolioReady && snapshotEnabled) {
    const run = deps.runSnapshot ?? defaultRunSnapshot(log);
    const task = schedule(SNAPSHOT_CRON, () => {
      run().catch((err) => {
        log.error("⚠️ scheduler: snapshot job falló:", err instanceof Error ? err : new Error(String(err)));
      });
    }, {
      timezone: CRON_TZ,
      name: SNAPSHOT_TASK_NAME,
      noOverlap: true,
      unref: true,
    });
    tasks.push(task);
    snapshotScheduled = true;
    if (process.env.IOL_PROVIDER !== "api") {
      log.log("🕒 scheduler: snapshot diario 17:30 ART activo (IOL_PROVIDER no es 'api' → no captura hasta que lo sea)");
    } else {
      log.log("🕒 scheduler: snapshot diario 17:30 ART (L–V) activo");
    }
  } else if (portfolioReady) {
    log.log("🕒 scheduler: SNAPSHOT_JOB_ENABLED=false → snapshot diario deshabilitado");
  }

  // — Reconciliación 18:30 —
  let reconciliationScheduled = false;
  if (portfolioReady && reconciliationEnabled) {
    const run = deps.runReconciliation ?? (async () => {
      await runDailyReconciliation();
    });
    const task = schedule(RECONCILIATION_CRON, () => {
      run().catch((err) => {
        log.error("⚠️ scheduler: reconciliación falló:", err instanceof Error ? err : new Error(String(err)));
      });
    }, {
      timezone: CRON_TZ,
      name: RECONCILIATION_TASK_NAME,
      noOverlap: true,
      unref: true,
    });
    tasks.push(task);
    reconciliationScheduled = true;
    log.log("🕒 scheduler: reconciliación 18:30 ART (L–V) activa");
  } else if (portfolioReady) {
    log.log("🕒 scheduler: RECONCILIATION_JOB_ENABLED=false → reconciliación deshabilitada");
  }

  const started = quotesScheduled || snapshotScheduled || reconciliationScheduled;
  return {
    started,
    snapshot: { enabled: portfolioReady && snapshotEnabled, scheduled: snapshotScheduled },
    quotesSnapshot: { enabled: quotesReady && quotesEnabled, scheduled: quotesScheduled },
    reconciliation: { enabled: portfolioReady && reconciliationEnabled, scheduled: reconciliationScheduled },
    stop,
  };
}