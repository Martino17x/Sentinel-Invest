// ============================================================
// RECONCILIATION JOB â€” detecciÃ³n diaria de deltas inexplicados
// (spec F3-B2/B3/B5, design D5/D6).
//
// D3: el job recibe TODAS sus dependencias por inyecciÃ³n â†’ testeable
// con fakes en memoria (el repo no testea cÃ³digo DB-dependiente).
// Una cuenta que falla se loguea y el job continÃºa (nunca rompe el
// proceso).
//
// Por cada cuenta activa: snapshot pair (prev,hoy) â†’ reconcileDay por
// moneda (ARS y USD) â†’ si algÃºn currency supera el umbral, propone un
// movimiento detected/pending. El partial unique (D5) capa detected a
// 1/dÃ­a: si ARS y USD ambos tienen delta inexplicado, se exhÃ­be el
// dominante (mayor |monto|); el preview de ambos queda en /reconcile.
// El rerun es idempotente (getExistingDetected evita duplicados).
// ============================================================

import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import type { Currency } from "../../services/iol/types.js";
import { reconcileDay } from "../portafolio/reconciliation.js";
import type {
  CashMovementLike,
  DetectedMovement,
  OperationLike,
  SnapshotLike,
} from "../portafolio/reconciliation.js";
import {
  fetchOperationsLike,
  getConfirmedMovements,
  getExistingDetected,
  getSnapshotPair,
  insertDetectedMovement,
  type ReconcileAccount,
} from "../portafolio/reconciliationData.js";

/** Cuenta activa con conexiÃ³n IOL activa (candidata a reconciliar). */
export interface ActiveAccount {
  id: string;
  userId: string;
  iolAccountNumber: string;
}

export interface ReconciliationJobDeps {
  log: Pick<Console, "log" | "warn" | "error">;
  listActiveAccounts: () => Promise<ActiveAccount[]>;
  getSnapshotPair: (
    accountId: string,
    asOfDateKey?: string
  ) => Promise<{ prev: SnapshotLike | null; today: SnapshotLike | null }>;
  getOperationsForRange: (
    account: ReconcileAccount,
    from: string,
    to: string
  ) => Promise<OperationLike[]>;
  getConfirmedMovements: (
    accountId: string,
    from: string,
    to: string
  ) => Promise<CashMovementLike[]>;
  getExistingDetected: (accountId: string, date: string) => Promise<{ id: string } | null>;
  insertDetectedMovement: (accountId: string, movement: DetectedMovement) => Promise<void>;
}

export interface ReconciliationOutcome {
  accountId: string;
  ok: boolean;
  processed: boolean;
  created: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Corre la reconciliaciÃ³n para todas las cuentas activas. Por cuenta:
 * snapshot pair â†’ reconcileDay (ARS+USD) â†’ inserta detected/pending si
 * supera umbral y no existe ya uno ese dÃ­a. Una falla no detiene el resto.
 */
export async function runReconciliation(deps: ReconciliationJobDeps): Promise<ReconciliationOutcome[]> {
  const accounts = await deps.listActiveAccounts();
  const outcomes: ReconciliationOutcome[] = [];

  for (const account of accounts) {
    try {
      const { prev, today } = await deps.getSnapshotPair(account.id);
      if (!prev || !today) {
        deps.log.log(`ðŸ” reconciliaciÃ³n [${account.iolAccountNumber}]: sin snapshots previo/hoy â†’ omitido`);
        outcomes.push({ accountId: account.id, ok: true, processed: false, created: false });
        continue;
      }

      const from = prev.date;
      const to = today.date;
      const [operations, movements] = await Promise.all([
        deps.getOperationsForRange(account, from, to),
        deps.getConfirmedMovements(account.id, from, to),
      ]);

      const candidates = (["ARS", "USD"] as Currency[])
        .map((currency) =>
          reconcileDay({ currency, prevSnapshot: prev, todaySnapshot: today, operations, movements })
        )
        .filter((r) => r.thresholdExceeded && r.movement)
        .map((r) => r.movement!);

      if (candidates.length === 0) {
        outcomes.push({ accountId: account.id, ok: true, processed: true, created: false });
        continue;
      }

      const chosen = pickDominant(candidates);
      const existing = await deps.getExistingDetected(account.id, chosen.date);
      if (existing) {
        deps.log.log(
          `ðŸ” reconciliaciÃ³n [${account.iolAccountNumber}]: ya existe detected ${chosen.date} â†’ omitido (idempotente)`
        );
        outcomes.push({ accountId: account.id, ok: true, processed: true, created: false, skipped: true });
        continue;
      }

      await deps.insertDetectedMovement(account.id, chosen);
      deps.log.log(
        `ðŸ” reconciliaciÃ³n [${account.iolAccountNumber}]: detected ${chosen.currency} ${chosen.amount} (${chosen.date})`
      );
      outcomes.push({ accountId: account.id, ok: true, processed: true, created: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log.warn(`âš ï¸ reconciliaciÃ³n [${account.iolAccountNumber}]: ${message}`);
      outcomes.push({
        accountId: account.id,
        ok: false,
        processed: false,
        created: false,
        error: message,
      });
    }
  }

  return outcomes;
}

/** Entre varios detected candidatos (ARS+USD), exhÃ­be el de mayor |monto|. */
function pickDominant(movements: DetectedMovement[]): DetectedMovement {
  return movements.reduce((best, m) => (Math.abs(m.amount) > Math.abs(best.amount) ? m : best));
}

// ============================================================
// Deps productivas por defecto â€” los tests las sobreescriben.
// ============================================================

async function listActiveAccountsWithConnection(): Promise<ActiveAccount[]> {
  const rows = await db
    .select({
      id: schema.accounts.id,
      userId: schema.accounts.userId,
      iolAccountNumber: schema.accounts.iolAccountNumber,
    })
    .from(schema.accounts)
    .innerJoin(schema.iolConnections, eq(schema.iolConnections.userId, schema.accounts.userId))
    .where(and(eq(schema.accounts.isActive, true), eq(schema.iolConnections.isActive, true)));
  return rows;
}

export function makeReconciliationDeps(
  overrides: Partial<ReconciliationJobDeps> = {}
): ReconciliationJobDeps {
  return {
    log: console,
    listActiveAccounts: listActiveAccountsWithConnection,
    getSnapshotPair: (accountId, asOfDateKey) => getSnapshotPair(accountId, asOfDateKey),
    getOperationsForRange: (account, from, to) => fetchOperationsLike(account, from, to),
    getConfirmedMovements: (accountId, from, to) => getConfirmedMovements(accountId, from, to),
    getExistingDetected: (accountId, date) => getExistingDetected(accountId, date),
    insertDetectedMovement: (accountId, movement) => insertDetectedMovement(accountId, movement),
    ...overrides,
  };
}

/** Handler productivo: corre la reconciliaciÃ³n con deps reales (BD). */
export function runDailyReconciliation(): Promise<ReconciliationOutcome[]> {
  return runReconciliation(makeReconciliationDeps());
}
