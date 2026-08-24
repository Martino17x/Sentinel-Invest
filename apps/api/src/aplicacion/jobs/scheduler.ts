// ============================================================
// SCHEDULER â€” jobs diarios del portafolio (node-cron)
//
// D2: cron "30 17 * * 1-5" en tz ART, arrancado en index.ts
// tras ensureSchema(). Kill-switches por env (patrÃ³n AGENT_ENABLED
// de index.ts:27): habilitado salvo que la env sea literalmente
// 'false'. stop() para tests/shutdown. Guard de tabla: si
// portfolio_snapshots no existe, los jobs NO arrancan (boot
// degradado, la app sigue viva).
//
// El handler de reconciliaciÃ³n (jobs/reconciliation.ts) se conecta acÃ¡
// vÃ­a runDailyReconciliation, detrÃ¡s del kill-switch
// RECONCILIATION_JOB_ENABLED (D2).
// ============================================================

import { schedule, type ScheduledTask } from "node-cron";
import { pool } from "../../db/index.js";
import { makeDailySnapshotDeps, runDailySnapshots } from "./dailySnapshot.js";
import { runDailyReconciliation } from "./reconciliation.js";
import { makeQuotesSnapshotDeps, runQuotesSnapshots } from "./quotesSnapshot.js";
import {
  makeBondAnalyticsSnapshotDeps,
  runBondAnalyticsSnapshot,
} from "./bondAnalyticsSnapshot.js";
import { runDailyTirValidation } from "../../services/market/bonds/tirValidation.js";

const SNAPSHOT_CRON = "30 17 * * 1-5"; // 17:30 ART, lunes a viernes (F1-R1)
const QUOTES_SNAPSHOT_CRON = "5 17 * * 1-5"; // 17:05 ART, lun-vie â€” snapshot de cotizaciones al cierre
const BOND_ANALYTICS_CRON = "10 17 * * 1-5"; // 17:10 ART, lun-vie â€” snapshot analytics bonos (renta-fija-curva)
const TIR_VALIDATION_CRON = "15 17 * * 1-5"; // 17:15 ART, lun-vie â€” validaciÃ³n TIR 5bps/1% (T-008)
const RECONCILIATION_CRON = "30 18 * * 1-5"; // 18:30 ART, tras el snapshot (se afina en F3-4)
const CRON_TZ = "America/Argentina/Buenos_Aires";

const SNAPSHOT_TASK_NAME = "daily-snapshot";
const QUOTES_SNAPSHOT_TASK_NAME = "quotes-snapshot";
const BOND_ANALYTICS_TASK_NAME = "bond-analytics-snapshot";
const TIR_VALIDATION_TASK_NAME = "tir-validation";
const RECONCILIATION_TASK_NAME = "daily-reconciliation";

export interface ScheduledJobState {
  enabled: boolean;
  scheduled: boolean;
}

/** Handle devuelto por startScheduledJobs â€” stop() para tests/shutdown. */
export interface ScheduledJobs {
  started: boolean;
  snapshot: ScheduledJobState;
  quotesSnapshot: ScheduledJobState;
  bondAnalytics: ScheduledJobState;
  tirValidation: ScheduledJobState;
  reconciliation: ScheduledJobState;
  stop: () => void;
}

export interface SchedulerDeps {
  log?: Pick<Console, "log" | "warn" | "error">;
  /** Guard de tabla inyectable (tests lo reemplazan por un fake). */
  tablesReady?: () => Promise<boolean>;
  /** Guard de tabla quotes â€” inyectable para tests del nuevo job. */
  quotesTablesReady?: () => Promise<boolean>;
  /** Guard de tabla bond_analytics_snapshots â€” inyectable para tests. */
  bondAnalyticsTablesReady?: () => Promise<boolean>;
  /** Handler del snapshot diario â€” por defecto runDailySnapshots real. */
  runSnapshot?: () => Promise<unknown>;
  /** Handler de snapshot de cotizaciones â€” por defecto runQuotesSnapshots real. */
  runQuotesSnapshot?: () => Promise<unknown>;
  /** Handler de snapshot de analytics bonos â€” por defecto runBondAnalyticsSnapshot real. */
  runBondAnalyticsSnapshot?: () => Promise<unknown>;
  /** Handler de validaciÃ³n TIR diaria â€” T-008. */
  runTirValidation?: () => Promise<unknown>;
  /** Handler de reconciliaciÃ³n â€” lo conecta F3-4. */
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

async function defaultBondAnalyticsTablesReady(): Promise<boolean> {
  try {
    const result = await pool.query<{ exists: boolean }>(
      "SELECT to_regclass('public.bond_analytics_snapshots') IS NOT NULL AS exists"
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
    // En modo mock no hay captura real (la cuenta "demo" no estÃ¡ en BD);
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

function defaultRunBondAnalyticsSnapshot(
  log: Pick<Console, "log" | "warn" | "error">
): () => Promise<unknown> {
  return async () => {
    if (process.env.BONDS_SNAPSHOT_ENABLED !== "true") return;
    await runBondAnalyticsSnapshot(makeBondAnalyticsSnapshotDeps({ log }));
  };
}

function defaultRunTirValidation(
  log: Pick<Console, "log" | "warn" | "error">
): () => Promise<unknown> {
  return async () => {
    // Corre siempre que haya datos MAE; no requiere flag extra (usa misma guard bondAnalyticsReady)
    try {
      const summary = await runDailyTirValidation();
      log.log(`ðŸ“Š tir-validation: checked=${summary.checked} diverged5bps=${summary.diverged5bps} diverged1pct=${summary.diverged1pct}`);
    } catch (err) {
      log.warn(`âš ï¸ tir-validation fallÃ³: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

/**
 * Arranca los jobs diarios. Idempotente por diseÃ±o (cada boot lo vuelve
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
  const bondAnalyticsReady = await (deps.bondAnalyticsTablesReady ?? defaultBondAnalyticsTablesReady)();

  if (!portfolioReady && !quotesReady && !bondAnalyticsReady) {
    log.warn("âš ï¸ scheduler: portfolio_snapshots, quotes_snapshots y bond_analytics_snapshots ausentes â€” jobs NO arrancan");
    return {
      started: false,
      snapshot: { enabled: false, scheduled: false },
      quotesSnapshot: { enabled: false, scheduled: false },
      bondAnalytics: { enabled: false, scheduled: false },
      tirValidation: { enabled: false, scheduled: false },
      reconciliation: { enabled: false, scheduled: false },
      stop,
    };
  }

  if (!portfolioReady) {
    log.warn("âš ï¸ scheduler: portfolio_snapshots ausente â€” snapshot/reconciliaciÃ³n NO arrancan (quotes sÃ­)");
  }

  const snapshotEnabled = process.env.SNAPSHOT_JOB_ENABLED !== "false";
  const reconciliationEnabled = process.env.RECONCILIATION_JOB_ENABLED !== "false";
  const quotesEnabled = process.env.QUOTES_SNAPSHOT_ENABLED !== "false";
  const bondAnalyticsEnabled = process.env.BONDS_SNAPSHOT_ENABLED === "true";

  // â€” Quotes snapshot 17:05 (independiente de portfolio) â€”
  let quotesScheduled = false;
  if (quotesReady && quotesEnabled) {
    const run = deps.runQuotesSnapshot ?? defaultRunQuotesSnapshot(log);
    const task = schedule(QUOTES_SNAPSHOT_CRON, () => {
      run().catch((err) => {
        log.error("âš ï¸ scheduler: quotes-snapshot fallÃ³:", err instanceof Error ? err : new Error(String(err)));
      });
    }, {
      timezone: CRON_TZ,
      name: QUOTES_SNAPSHOT_TASK_NAME,
      noOverlap: true,
      unref: true,
    });
    tasks.push(task);
    quotesScheduled = true;
    log.log("ðŸ•’ scheduler: snapshot de cotizaciones 17:05 ART (Lâ€“V) activo");
  } else if (!quotesReady) {
    log.warn("âš ï¸ scheduler: quotes_snapshots ausente â€” snapshot de cotizaciones NO arranca");
  } else {
    log.log("ðŸ•’ scheduler: QUOTES_SNAPSHOT_ENABLED=false â†’ snapshot de cotizaciones deshabilitado");
  }

  // â€” Portfolio snapshot 17:30 â€”
  let snapshotScheduled = false;
  if (portfolioReady && snapshotEnabled) {
    const run = deps.runSnapshot ?? defaultRunSnapshot(log);
    const task = schedule(SNAPSHOT_CRON, () => {
      run().catch((err) => {
        log.error("âš ï¸ scheduler: snapshot job fallÃ³:", err instanceof Error ? err : new Error(String(err)));
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
      log.log("ðŸ•’ scheduler: snapshot diario 17:30 ART activo (IOL_PROVIDER no es 'api' â†’ no captura hasta que lo sea)");
    } else {
      log.log("ðŸ•’ scheduler: snapshot diario 17:30 ART (Lâ€“V) activo");
    }
  } else if (portfolioReady) {
    log.log("ðŸ•’ scheduler: SNAPSHOT_JOB_ENABLED=false â†’ snapshot diario deshabilitado");
  }

  // â€” Bond analytics snapshot 17:10 â€”
  let bondAnalyticsScheduled = false;
  if (bondAnalyticsReady && bondAnalyticsEnabled) {
    const run = deps.runBondAnalyticsSnapshot ?? defaultRunBondAnalyticsSnapshot(log);
    const task = schedule(BOND_ANALYTICS_CRON, () => {
      run().catch((err) => {
        log.error("âš ï¸ scheduler: bond-analytics-snapshot fallÃ³:", err instanceof Error ? err : new Error(String(err)));
      });
    }, {
      timezone: CRON_TZ,
      name: BOND_ANALYTICS_TASK_NAME,
      noOverlap: true,
      unref: true,
    });
    tasks.push(task);
    bondAnalyticsScheduled = true;
    log.log("ðŸ•’ scheduler: snapshot analytics bonos 17:10 ART (Lâ€“V) activo");
  } else if (!bondAnalyticsReady) {
    log.warn("âš ï¸ scheduler: bond_analytics_snapshots ausente â€” snapshot analytics bonos NO arranca");
  } else {
    log.log("ðŸ•’ scheduler: BONDS_SNAPSHOT_ENABLED!=true â†’ snapshot analytics bonos deshabilitado");
  }

  // â€” TIR validation 17:15 â€” T-008 (depende de bondAnalyticsReady, pero corre aunque snapshot estÃ© off)
  let tirValidationScheduled = false;
  const tirValidationEnabled = bondAnalyticsReady; // se activa si hay tabla bonos; no requiere flag extra
  if (tirValidationEnabled) {
    const run = deps.runTirValidation ?? defaultRunTirValidation(log);
    const task = schedule(TIR_VALIDATION_CRON, () => {
      run().catch((err) => {
        log.error("âš ï¸ scheduler: tir-validation fallÃ³:", err instanceof Error ? err : new Error(String(err)));
      });
    }, {
      timezone: CRON_TZ,
      name: TIR_VALIDATION_TASK_NAME,
      noOverlap: true,
      unref: true,
    });
    tasks.push(task);
    tirValidationScheduled = true;
    log.log("ðŸ•’ scheduler: validaciÃ³n TIR diaria 17:15 ART (Lâ€“V) activa (5bps / 1% crÃ­tico)");
  } else {
    log.warn("âš ï¸ scheduler: bond_analytics_snapshots ausente â€” validaciÃ³n TIR NO arranca");
  }

  // â€” ReconciliaciÃ³n 18:30 â€”
  let reconciliationScheduled = false;
  if (portfolioReady && reconciliationEnabled) {
    const run = deps.runReconciliation ?? (async () => {
      await runDailyReconciliation();
    });
    const task = schedule(RECONCILIATION_CRON, () => {
      run().catch((err) => {
        log.error("âš ï¸ scheduler: reconciliaciÃ³n fallÃ³:", err instanceof Error ? err : new Error(String(err)));
      });
    }, {
      timezone: CRON_TZ,
      name: RECONCILIATION_TASK_NAME,
      noOverlap: true,
      unref: true,
    });
    tasks.push(task);
    reconciliationScheduled = true;
    log.log("ðŸ•’ scheduler: reconciliaciÃ³n 18:30 ART (Lâ€“V) activa");
  } else if (portfolioReady) {
    log.log("ðŸ•’ scheduler: RECONCILIATION_JOB_ENABLED=false â†’ reconciliaciÃ³n deshabilitada");
  }

  const started = quotesScheduled || snapshotScheduled || reconciliationScheduled || bondAnalyticsScheduled || tirValidationScheduled;
  return {
    started,
    snapshot: { enabled: portfolioReady && snapshotEnabled, scheduled: snapshotScheduled },
    quotesSnapshot: { enabled: quotesReady && quotesEnabled, scheduled: quotesScheduled },
    bondAnalytics: { enabled: bondAnalyticsReady && bondAnalyticsEnabled, scheduled: bondAnalyticsScheduled },
    tirValidation: { enabled: tirValidationEnabled, scheduled: tirValidationScheduled },
    reconciliation: { enabled: portfolioReady && reconciliationEnabled, scheduled: reconciliationScheduled },
    stop,
  };
}