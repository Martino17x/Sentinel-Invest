// ============================================================
// RECONCILIATION JOB — detección diaria de deltas inexplicados
// (spec F3-B2/B3/B5, design D5/D6).
//
// D3: el job recibe TODAS sus dependencias por inyección → testeable
// con fakes en memoria (el repo no testea código DB-dependiente).
// Una cuenta que falla se loguea y el job continúa (nunca rompe el
// proceso).
//
// Por cada cuenta activa: snapshot pair (prev,hoy) → reconcileDay por
// moneda (ARS y USD) → si algún currency supera el umbral, propone un
// movimiento detected/pending. El partial unique (D5) capa detected a
// 1/día: si ARS y USD ambos tienen delta inexplicado, se exhíbe el
// dominante (mayor |monto|); el preview de ambos queda en /reconcile.
// El rerun es idempotente (getExistingDetected evita duplicados).
// ============================================================

import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import type { Currency } from "../services/iol/types.js";
import { reconcileDay } from "../services/reports/reconciliation.js";
import type {
  CashMovementLike,
  DetectedMovement,
  OperationLike,
  SnapshotLike,
} from "../services/reports/reconciliation.js";
import {
  fetchOperationsLike,
  getConfirmedMovements,
  getExistingDetected,
  getSnapshotPair,
  insertDetectedMovement,
  type ReconcileAccount,
} from "../services/reports/reconciliationData.js";

/** Cuenta activa con conexión IOL activa (candidata a reconciliar). */
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
 * Corre la reconciliación para todas las cuentas activas. Por cuenta:
 * snapshot pair → reconcileDay (ARS+USD) → inserta detected/pending si
 * supera umbral y no existe ya uno ese día. Una falla no detiene el resto.
 */
export async function runReconciliation(deps: ReconciliationJobDeps): Promise<ReconciliationOutcome[]> {
  const accounts = await deps.listActiveAccounts();
  const outcomes: ReconciliationOutcome[] = [];

  for (const account of accounts) {
    try {
      const { prev, today } = await deps.getSnapshotPair(account.id);
      if (!prev || !today) {
        deps.log.log(`🔍 reconciliación [${account.iolAccountNumber}]: sin snapshots previo/hoy → omitido`);
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
          `🔍 reconciliación [${account.iolAccountNumber}]: ya existe detected ${chosen.date} → omitido (idempotente)`
        );
        outcomes.push({ accountId: account.id, ok: true, processed: true, created: false, skipped: true });
        continue;
      }

      await deps.insertDetectedMovement(account.id, chosen);
      deps.log.log(
        `🔍 reconciliación [${account.iolAccountNumber}]: detected ${chosen.currency} ${chosen.amount} (${chosen.date})`
      );
      outcomes.push({ accountId: account.id, ok: true, processed: true, created: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log.warn(`⚠️ reconciliación [${account.iolAccountNumber}]: ${message}`);
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

/** Entre varios detected candidatos (ARS+USD), exhíbe el de mayor |monto|. */
function pickDominant(movements: DetectedMovement[]): DetectedMovement {
  return movements.reduce((best, m) => (Math.abs(m.amount) > Math.abs(best.amount) ? m : best));
}

// ============================================================
// Deps productivas por defecto — los tests las sobreescriben.
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

/** Handler productivo: corre la reconciliación con deps reales (BD). */
export function runDailyReconciliation(): Promise<ReconciliationOutcome[]> {
  return runReconciliation(makeReconciliationDeps());
}
