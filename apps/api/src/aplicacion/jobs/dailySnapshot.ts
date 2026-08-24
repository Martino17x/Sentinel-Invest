// ============================================================
// DAILY SNAPSHOT â€” captura diaria del portafolio por cuenta
//
// D3: el job recibe provider + saver por inyecciÃ³n â†’ testeable
// con fakes en memoria (el repo no testea cÃ³digo DB-dependiente).
// Una cuenta que falla (IOL caÃ­do, credenciales invÃ¡lidas) se
// loguea y el job continÃºa con el resto â€” nunca rompe el proceso
// (spec F1-R1 escenario "proveedor IOL caÃ­do").
// ============================================================

import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { getIolCredentials } from "../../lib/iol-credentials.js";
import { getIolProvider } from "../../services/iol/index.js";
import type { IolProvider } from "../../services/iol/IolProvider.js";
import type { IolCredentials, PortfolioSummary } from "../../services/iol/types.js";
import { saveDailySnapshot, type SnapshotSource } from "../portafolio/reportBuilder.js";
import { artTodayKey } from "../portafolio/art-time.js";

/** Cuenta activa con conexiÃ³n IOL activa (candidata a captura). */
export interface ActiveAccount {
  id: string;
  userId: string;
  iolAccountNumber: string;
}

/** Dependencies del job â€” inyectables para tests con fakes (D3). */
export interface DailySnapshotDeps {
  provider: Pick<IolProvider, "getPortfolio">;
  getCredentials: (userId: string) => Promise<IolCredentials>;
  saveSnapshot: (
    accountId: string,
    portfolio: PortfolioSummary,
    opts?: { source?: SnapshotSource }
  ) => Promise<boolean>;
  listActiveAccounts: () => Promise<ActiveAccount[]>;
  log: Pick<Console, "log" | "warn" | "error">;
}

/** Resultado por cuenta â€” una falla no detiene el resto. */
export interface SnapshotOutcome {
  accountId: string;
  iolAccountNumber: string;
  ok: boolean;
  saved: boolean;
  error?: string;
}

/** Cuentas activas con conexiÃ³n IOL activa (accounts â‹ˆ iol_connections). */
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

/** Dependencies productivas por defecto â€” los tests las sobreescriben. */
export function makeDailySnapshotDeps(
  overrides: Partial<DailySnapshotDeps> = {}
): DailySnapshotDeps {
  return {
    provider: getIolProvider(),
    getCredentials: getIolCredentials,
    saveSnapshot: saveDailySnapshot,
    listActiveAccounts: listActiveAccountsWithConnection,
    log: console,
    ...overrides,
  };
}

/**
 * Captura el snapshot del dÃ­a para cada cuenta activa.
 * Por cuenta: getPortfolio â†’ saveSnapshot (source='real' por defecto;
 * saveDailySnapshot es idempotente por unique(account_id, captured_at)).
 * Un error en una cuenta se loguea y el job continÃºa.
 */
export async function runDailySnapshots(
  deps: DailySnapshotDeps
): Promise<SnapshotOutcome[]> {
  const accounts = await deps.listActiveAccounts();
  const outcomes: SnapshotOutcome[] = [];

  for (const account of accounts) {
    try {
      const creds = await deps.getCredentials(account.userId);
      const portfolio = await deps.provider.getPortfolio(creds, account.iolAccountNumber);
      const saved = await deps.saveSnapshot(account.id, portfolio);
      if (saved) {
        deps.log.log(`ðŸ“¸ snapshot ${account.iolAccountNumber} (${artTodayKey()}) guardado`);
      }
      outcomes.push({
        accountId: account.id,
        iolAccountNumber: account.iolAccountNumber,
        ok: true,
        saved,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log.warn(`âš ï¸ snapshot job [${account.iolAccountNumber}]: ${message}`);
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