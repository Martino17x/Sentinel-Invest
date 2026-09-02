// ============================================================
// DAILY SNAPSHOT — captura diaria del portafolio por cuenta
//
// D3: el job recibe provider + saver por inyeccion → testeable
// con fakes en memoria (el repo no testea codigo DB-dependiente).
// Commit 2: multibroker 1:N (accounts ⋈ broker_connections) con
// fallback a iol_connections 1 sprint.
// ============================================================

import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { getBrokerCredentials } from "../../lib/broker-credentials.js";
import { getIolProvider } from "../../services/iol/index.js";
import type { BrokerType } from "../../services/iol/ports.js";
import type { IolProvider } from "../../services/iol/IolProvider.js";
import type { BrokerCredentials, PortfolioSummary } from "../../services/iol/types.js";
import { saveDailySnapshot, type SnapshotSource } from "../portafolio/reportBuilder.js";
import { artTodayKey } from "../portafolio/art-time.js";

/** Cuenta activa con conexion por broker activa (candidata a captura). Commit 2: 1:N por broker_type. */
export interface ActiveAccount {
  id: string;
  userId: string;
  iolAccountNumber: string;
  brokerType?: BrokerType;
  brokerAccountNumber?: string;
}

/** Dependencies del job — inyectables para tests con fakes (D3). Commit 2: creds por broker. */
export interface DailySnapshotDeps {
  provider: Pick<IolProvider, "getPortfolio">;
  getCredentials: (userId: string, brokerType?: BrokerType) => Promise<BrokerCredentials>;
  saveSnapshot: (
    accountId: string,
    portfolio: PortfolioSummary,
    opts?: { source?: SnapshotSource }
  ) => Promise<boolean>;
  listActiveAccounts: () => Promise<ActiveAccount[]>;
  log: Pick<Console, "log" | "warn" | "error">;
}

/** Resultado por cuenta — una falla no detiene el resto. */
export interface SnapshotOutcome {
  accountId: string;
  iolAccountNumber: string;
  ok: boolean;
  saved: boolean;
  error?: string;
}

/** Cuentas activas con conexion por broker activa (accounts ⋈ broker_connections). Fallback a iol_connections 1 sprint. */
async function listActiveAccountsWithConnection(): Promise<ActiveAccount[]> {
  try {
    const rows = await db
      .select({
        id: schema.accounts.id,
        userId: schema.accounts.userId,
        iolAccountNumber: schema.accounts.iolAccountNumber,
        brokerType: schema.accounts.brokerType,
        brokerAccountNumber: schema.accounts.brokerAccountNumber,
      })
      .from(schema.accounts)
      .innerJoin(schema.brokerConnections, eq(schema.brokerConnections.userId, schema.accounts.userId))
      .where(and(eq(schema.accounts.isActive, true), eq(schema.brokerConnections.isActive, true)));
    if (rows.length > 0) return rows as ActiveAccount[];
  } catch {
    // broker_connections aun no migrada (tests sin DDL) → fallback
  }
  const rows = await db
    .select({
      id: schema.accounts.id,
      userId: schema.accounts.userId,
      iolAccountNumber: schema.accounts.iolAccountNumber,
    })
    .from(schema.accounts)
    .innerJoin(schema.iolConnections, eq(schema.iolConnections.userId, schema.accounts.userId))
    .where(and(eq(schema.accounts.isActive, true), eq(schema.iolConnections.isActive, true)));
  return rows as ActiveAccount[];
}

/** Dependencies productivas por defecto — los tests las sobreescriben. Commit 2 usa genérico por broker. */
export function makeDailySnapshotDeps(
  overrides: Partial<DailySnapshotDeps> = {}
): DailySnapshotDeps {
  return {
    provider: getIolProvider(),
    getCredentials: (userId: string, brokerType?: BrokerType) => getBrokerCredentials(userId, (brokerType ?? "iol") as BrokerType),
    saveSnapshot: saveDailySnapshot,
    listActiveAccounts: listActiveAccountsWithConnection,
    log: console,
    ...overrides,
  };
}

/**
 * Captura el snapshot del dia para cada cuenta activa.
 * Por cuenta: getPortfolio → saveSnapshot (source='real' por defecto;
 * saveDailySnapshot es idempotente por unique(account_id, captured_at)).
 * Un error en una cuenta se loguea y el job continua.
 */
export async function runDailySnapshots(
  deps: DailySnapshotDeps
): Promise<SnapshotOutcome[]> {
  const accounts = await deps.listActiveAccounts();
  const outcomes: SnapshotOutcome[] = [];

  for (const account of accounts) {
    const brokerType = (account.brokerType as BrokerType) ?? "iol";
    const accountNumber = account.brokerAccountNumber ?? account.iolAccountNumber;
    try {
      const creds = await deps.getCredentials(account.userId, brokerType);
      const portfolio = await deps.provider.getPortfolio(creds, accountNumber);
      const saved = await deps.saveSnapshot(account.id, portfolio);
      if (saved) {
        deps.log.log(`snapshot ${accountNumber} (${artTodayKey()}) guardado`);
      }
      outcomes.push({
        accountId: account.id,
        iolAccountNumber: account.iolAccountNumber,
        ok: true,
        saved,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log.warn(`snapshot job [${accountNumber}]: ${message}`);
      outcomes.push({
        accountId: account.id,
        iolAccountNumber: account.iolAccountNumber,
        ok: false,
        saved: false,
        error: message,
      });
    }
  }

  return outcomes;
}
