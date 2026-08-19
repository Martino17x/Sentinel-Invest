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

const SNAPSHOT_CRON = "30 17 * * 1-5"; // 17:30 ART, lunes a viernes (F1-R1)
const RECONCILIATION_CRON = "30 18 * * 1-5"; // 18:30 ART, tras el snapshot (se afina en F3-4)
const CRON_TZ = "America/Argentina/Buenos_Aires";

const SNAPSHOT_TASK_NAME = "daily-snapshot";
const RECONCILIATION_TASK_NAME = "daily-reconciliation";

export interface ScheduledJobState {
  enabled: boolean;
  scheduled: boolean;
}

/** Handle devuelto por startScheduledJobs — stop() para tests/shutdown. */
export interface ScheduledJobs {
  started: boolean;
  snapshot: ScheduledJobState;
  reconciliation: ScheduledJobState;
  stop: () => void;
}

export interface SchedulerDeps {
  log?: Pick<Console, "log" | "warn" | "error">;
  /** Guard de tabla inyectable (tests lo reemplazan por un fake). */
  tablesReady?: () => Promise<boolean>;
  /** Handler del snapshot diario — por defecto runDailySnapshots real. */
  runSnapshot?: () => Promise<unknown>;
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

  const ready = await (deps.tablesReady ?? defaultTablesReady)();
  if (!ready) {
    log.warn("⚠️ scheduler: portfolio_snapshots ausente — jobs diarios NO arrancan");
    return {
      started: false,
      snapshot: { enabled: false, scheduled: false },
      reconciliation: { enabled: false, scheduled: false },
      stop,
    };
  }

  const snapshotEnabled = process.env.SNAPSHOT_JOB_ENABLED !== "false";
  const reconciliationEnabled = process.env.RECONCILIATION_JOB_ENABLED !== "false";

  if (snapshotEnabled) {
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
    if (process.env.IOL_PROVIDER !== "api") {
      log.log("🕒 scheduler: snapshot diario 17:30 ART activo (IOL_PROVIDER no es 'api' → no captura hasta que lo sea)");
    } else {
      log.log("🕒 scheduler: snapshot diario 17:30 ART (L–V) activo");
    }
  } else {
    log.log("🕒 scheduler: SNAPSHOT_JOB_ENABLED=false → snapshot diario deshabilitado");
  }

  if (reconciliationEnabled) {
    // Handler inyectable (D3): por defecto el job productivo real;
    // los tests pasan deps.runReconciliation con fakes.
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
    log.log("🕒 scheduler: reconciliación 18:30 ART (L–V) activa");
  } else {
    log.log("🕒 scheduler: RECONCILIATION_JOB_ENABLED=false → reconciliación deshabilitada");
  }

  return {
    started: true,
    snapshot: { enabled: snapshotEnabled, scheduled: snapshotEnabled },
    reconciliation: { enabled: reconciliationEnabled, scheduled: reconciliationEnabled && !!deps.runReconciliation },
    stop,
  };
}