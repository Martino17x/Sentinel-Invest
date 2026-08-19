// ============================================================
// BACKFILL SERVICE — runner on-demand + rollback (spec F3-C2)
//
// Orquesta los walkers puros de backfill.ts contra providers
// inyectados (IOL + BD). Solo rellena donde NO existe un snapshot
// REAL para ese día/cuenta. Todo reconstruido lleva source=
// 'reconstructed' → se puede limpiar con rollbackBackfill.
//
// Testeable: los tests inyectan fakes (sin BD, sin IOL).
// ============================================================

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { artStartOfDay } from "./art-time.js";
import {
  walkPositions,
  walkCashBackwards,
  buildNetFlows,
  type BackfillSnapshot,
  type DailyNetFlow,
  type GetClose,
  type MovementInput,
  type OperationInput,
} from "./backfill.js";
import type { IolProvider } from "../iol/IolProvider.js";
import type { IolCredentials } from "../iol/types.js";

export interface BackfillDeps {
  accountId: string;
  from: string;
  to: string;
  getOperations: () => Promise<OperationInput[]>;
  getClose: GetClose;
  getCurrentBalances: () => Promise<{ cashArs: number; cashUsd: number; asOf: string }>;
  getNetFlows: () => Promise<DailyNetFlow[]>;
  hasRealSnapshot: (date: string) => Promise<boolean>;
  insertSnapshot: (snap: BackfillSnapshot) => Promise<void>;
  log?: Pick<Console, "log" | "warn" | "error">;
}

export interface BackfillResult {
  inserted: number;
  skipped: number;
  from: string;
  to: string;
}

/**
 * Backfill híbrido: posiciones FORWARD (ops × cierre ajustado) + cash
 * BACKWARD (desde saldo actual). Inserta SOLO donde no hay snapshot real.
 */
export async function runBackfill(deps: BackfillDeps): Promise<BackfillResult> {
  const log = deps.log ?? console;
  const ops = await deps.getOperations();
  const balances = await deps.getCurrentBalances();
  const flows = await deps.getNetFlows();

  const to = deps.to;
  const posSnaps = walkPositions(ops, deps.from, to, deps.getClose);
  const cashByDate = walkCashBackwards(balances.cashArs, balances.cashUsd, flows);

  let inserted = 0;
  let skipped = 0;

  for (const p of posSnaps) {
    const cash = cashByDate.get(p.date) ?? { cashArs: 0, cashUsd: 0 };
    const snap: BackfillSnapshot = {
      ...p,
      cashArs: cash.cashArs,
      cashUsd: cash.cashUsd,
      totalValue: p.positionsValueArs + cash.cashArs,
      totalValueUsd: p.positionsValueUsd + cash.cashUsd,
    };
    if (await deps.hasRealSnapshot(p.date)) {
      skipped++;
      continue;
    }
    await deps.insertSnapshot(snap);
    inserted++;
  }

  log.log(`🔁 backfill: ${inserted} snapshots reconstruidos, ${skipped} omitidos (ya había real)`);
  return { inserted, skipped, from: deps.from, to };
}

// ============================================================
// ROLLBACK — borra TODO lo reconstruido de la cuenta
// ============================================================

export interface RollbackDeps {
  accountId: string;
  deleteReconstructed: () => Promise<number>;
  log?: Pick<Console, "warn" | "log">;
}

export async function rollbackBackfill(deps: RollbackDeps): Promise<number> {
  const log = deps.log ?? console;
  const deleted = await deps.deleteReconstructed();
  log.log(`♻️ backfill rollback: ${deleted} snapshots reconstruidos eliminados`);
  return deleted;
}

// ============================================================
// WIRING REAL (BD + IOL) — no se ejercita en los tests unitarios
// ============================================================

export interface AccountBackfillOptions {
  /** Fecha inicial del backfill (default: 1 año atrás en ART). */
  from?: string;
  /** Hasta qué fecha (default: hoy ART). */
  to?: string;
  log?: Pick<Console, "log" | "warn" | "error">;
}

/** Construye un getClose sync precargando seriehistorica por símbolo. */
export async function buildPriceCache(
  creds: IolCredentials,
  provider: IolProvider,
  operations: OperationInput[],
  from: string,
  to: string
): Promise<Map<string, { date: string; close: number }[]>> {
  const cache = new Map<string, { date: string; close: number }[]>();
  const symbols = new Set(operations.map((o) => `${o.symbol}|${o.market}`));
  await Promise.all(
    [...symbols].map(async (key) => {
      const [symbol, market] = key.split("|");
      try {
        const series = await provider.getQuoteHistory(creds, symbol, market, 365);
        const normalized = series
          .filter((pt) => pt.date >= from && pt.date <= to)
          .map((pt) => ({ date: pt.date.slice(0, 10), close: pt.close }))
          .sort((a, b) => (a.date < b.date ? -1 : 1));
        cache.set(key, normalized);
      } catch {
        cache.set(key, []);
      }
    })
  );
  return cache;
}

/** getClose sync que lee de la cache precargada (último ≤ dateKey). */
export function makeCachedGetClose(
  cache: Map<string, { date: string; close: number }[]>
): GetClose {
  return (symbol, market, dateKey) => {
    const series = cache.get(`${symbol}|${market}`) ?? [];
    let best: number | null = null;
    for (const pt of series) {
      if (pt.date <= dateKey) best = pt.close;
      else break;
    }
    return best;
  };
}

/**
 * Backfill de una cuenta real: resuelve providers contra IOL + BD.
 * FCI: seriehistorica suele venir vacía → el precio se "carriea" desde
 * el último conocido; el hook de cafci VCP puede enchufarse en getClose.
 */
export async function runAccountBackfill(
  accountId: string,
  provider: IolProvider,
  creds: IolCredentials,
  accountNumber: string,
  options: AccountBackfillOptions = {}
): Promise<BackfillResult> {
  const log = options.log ?? console;
  const now = artStartOfDay(new Date());
  const to = options.to ?? now.toISOString().slice(0, 10);
  const from = options.from ?? new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);

  const rawOps = await provider.getOperations(creds, accountNumber);
  const operations: OperationInput[] = rawOps.map((o) => ({
    symbol: o.symbol,
    market: o.market,
    type: o.type,
    status: o.status,
    quantity: o.quantity,
    total: o.total,
    commission: o.commission,
    currency: o.currency,
    date: o.date,
  }));

  const priceCache = await buildPriceCache(creds, provider, operations, from, to);

  const [latestReal] = await db
    .select({ cashArs: schema.portfolioSnapshots.cashArs, cashUsd: schema.portfolioSnapshots.cashUsd, capturedAt: schema.portfolioSnapshots.capturedAt })
    .from(schema.portfolioSnapshots)
    .where(and(eq(schema.portfolioSnapshots.accountId, accountId), eq(schema.portfolioSnapshots.source, "real")))
    .orderBy(desc(schema.portfolioSnapshots.capturedAt))
    .limit(1);

  const balances = latestReal
    ? {
        cashArs: Number(latestReal.cashArs),
        cashUsd: Number(latestReal.cashUsd),
        asOf: latestReal.capturedAt.toISOString().slice(0, 10),
      }
    : { cashArs: 0, cashUsd: 0, asOf: to };

  const movements: MovementInput[] = (
    await db
      .select({ date: schema.cashMovements.date, amount: schema.cashMovements.amount, currency: schema.cashMovements.currency, status: schema.cashMovements.status })
      .from(schema.cashMovements)
      .where(
        and(
          eq(schema.cashMovements.accountId, accountId),
          gte(schema.cashMovements.date, from),
          sql`${schema.cashMovements.date} <= ${to}`
        )
      )
  ).map((m) => ({ date: m.date, amount: Number(m.amount), currency: m.currency, status: m.status }));

  return runBackfill({
    accountId,
    from,
    to,
    getOperations: async () => operations,
    getClose: makeCachedGetClose(priceCache),
    getCurrentBalances: async () => balances,
    getNetFlows: async () => buildNetFlows(operations, movements, from, to),
    hasRealSnapshot: async (date) => {
      const [existing] = await db
        .select({ id: schema.portfolioSnapshots.id })
        .from(schema.portfolioSnapshots)
        .where(
          and(
            eq(schema.portfolioSnapshots.accountId, accountId),
            eq(schema.portfolioSnapshots.source, "real"),
            sql`DATE(${schema.portfolioSnapshots.capturedAt}) = ${date}`
          )
        )
        .limit(1);
      return !!existing;
    },
    insertSnapshot: async (snap) => {
      await insertReconstructedSnapshot(accountId, snap);
    },
    log,
  });
}

async function insertReconstructedSnapshot(accountId: string, snap: BackfillSnapshot): Promise<void> {
  const capturedAt = new Date(`${snap.date}T03:00:00Z`);
  const [inserted] = await db
    .insert(schema.portfolioSnapshots)
    .values({
      accountId,
      totalValue: String(snap.totalValue),
      totalValueUsd: String(snap.totalValueUsd),
      cash: String(snap.cashArs),
      cashArs: String(snap.cashArs),
      cashUsd: String(snap.cashUsd),
      positionsValue: String(snap.positionsValueArs),
      unrealizedGain: "0",
      dayChangePct: "0",
      currency: "ARS",
      source: "reconstructed",
      capturedAt,
    })
    .onConflictDoNothing()
    .returning({ id: schema.portfolioSnapshots.id });

  if (!inserted) return;

  if (snap.positions.length > 0) {
    await db
      .insert(schema.snapshotPositions)
      .values(
        snap.positions.map((p) => ({
          snapshotId: inserted.id,
          symbol: p.symbol,
          market: p.market,
          assetType: null,
          quantity: String(p.quantity),
          avgPrice: null,
          lastPrice: p.price != null ? String(p.price) : null,
          totalValue: String(p.value),
          currency: p.currency,
        }))
      )
      .onConflictDoNothing();
  }
}

/** Rollback real: DELETE WHERE source='reconstructed' (cascade borra positions). */
export async function runAccountRollback(accountId: string, log?: Pick<Console, "warn" | "log">): Promise<number> {
  return rollbackBackfill({
    accountId,
    deleteReconstructed: async () => {
      const deleted = await db
        .delete(schema.portfolioSnapshots)
        .where(
          and(
            eq(schema.portfolioSnapshots.accountId, accountId),
            eq(schema.portfolioSnapshots.source, "reconstructed")
          )
        )
        .returning({ id: schema.portfolioSnapshots.id });
      return deleted.length;
    },
    log,
  });
}
