// ============================================================
// RECONCILIATION DATA — adaptadores de BD para el job y la ruta
// /reconcile (spec F3-B2/B3/B5, design D5/D6).
//
// Funciones PURAS de acceso a datos: leen/escriben cash_movements,
// portfolio_snapshots y operaciones IOL, devolviendo shape-compatible
// con los tipos de reconciliation.ts (SnapshotLike / OperationLike /
// CashMovementLike). El job las inyecta (D3) para ser testeable con
// fakes; la ruta /reconcile las usa directo (solo lectura).
// ============================================================

import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { artDateKeyFromUtc } from "./art-time.js";
import { getIolCredentials } from "../../lib/iol-credentials.js";
import { getIolProvider } from "../iol/index.js";
import type {
  CashMovementLike,
  OperationLike,
  SnapshotLike,
} from "./reconciliation.js";
import type { Currency } from "../iol/types.js";

/** Cuenta candidata a reconciliar (misma forma que ActiveAccount del job). */
export interface ReconcileAccount {
  id: string;
  userId: string;
  iolAccountNumber: string;
}

// ============================================================
// SNAPSHOTS — par (previo, hoy) para el delta de efectivo
//
// El "hoy" es el snapshot más reciente (o el de asOfDateKey si se
// pasa). El "previo" es el inmediato anterior. Por construcción el
// delta se mide contra el snapshot ANTERIOR (D6): gaps de findes/
// feriados quedan atribuidos al rango.
// ============================================================

export async function getSnapshotPair(
  accountId: string,
  asOfDateKey?: string
): Promise<{ prev: SnapshotLike | null; today: SnapshotLike | null }> {
  const rows = await db
    .select()
    .from(schema.portfolioSnapshots)
    .where(eq(schema.portfolioSnapshots.accountId, accountId))
    .orderBy(asc(schema.portfolioSnapshots.capturedAt));

  if (rows.length === 0) return { prev: null, today: null };

  const toLike = (r: (typeof rows)[number]): SnapshotLike => ({
    date: artDateKeyFromUtc(r.capturedAt),
    cashArs: Number(r.cashArs),
    cashUsd: Number(r.cashUsd),
  });

  let todayIdx = rows.length - 1;
  if (asOfDateKey) {
    const idx = rows.findIndex((r) => artDateKeyFromUtc(r.capturedAt) === asOfDateKey);
    if (idx === -1) return { prev: null, today: null };
    todayIdx = idx;
  }

  const today = toLike(rows[todayIdx]);
  const prev = todayIdx > 0 ? toLike(rows[todayIdx - 1]) : null;
  return { prev, today };
}

// ============================================================
// MOVIMIENTOS CONFIRMADOS — expected cash (suma firmada)
// ============================================================

export async function getConfirmedMovements(
  accountId: string,
  from: string,
  to: string
): Promise<CashMovementLike[]> {
  const rows = await db
    .select({
      date: sql<string>`to_char(${schema.cashMovements.date}, 'YYYY-MM-DD')`,
      amount: schema.cashMovements.amount,
      currency: schema.cashMovements.currency,
      status: schema.cashMovements.status,
    })
    .from(schema.cashMovements)
    .where(
      and(
        eq(schema.cashMovements.accountId, accountId),
        eq(schema.cashMovements.status, "confirmed"),
        sql`${schema.cashMovements.date} >= ${from}`,
        sql`${schema.cashMovements.date} <= ${to}`
      )
    );

  return rows.map((r) => ({
    date: r.date,
    amount: Number(r.amount),
    currency: r.currency as Currency,
    status: r.status,
  }));
}

// ============================================================
// OPERACIONES IOL — expected cash (ventas − compras − comisiones)
//
// Degrada a [] si IOL no responde (credenciales caídas / red): la
// reconciliación NO debe romper (spec F1-R1 / F3-B2 escenario).
// ============================================================

export async function fetchOperationsLike(
  account: ReconcileAccount,
  from: string,
  to: string
): Promise<OperationLike[]> {
  try {
    const creds = await getIolCredentials(account.userId);
    const provider = getIolProvider();
    const ops = await provider.getOperations(creds, account.iolAccountNumber, {
      from,
      to,
      status: "accepted",
    });
    return ops.map((o) => ({
      type: o.type,
      status: o.status,
      currency: o.currency,
      total: o.total,
      commission: o.commission,
      date: o.date,
    }));
  } catch {
    return [];
  }
}

// ============================================================
// DEDUP — 1 detected/día por cuenta (partial unique D5)
// ============================================================

export async function getExistingDetected(
  accountId: string,
  date: string
): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: schema.cashMovements.id })
    .from(schema.cashMovements)
    .where(
      and(
        eq(schema.cashMovements.accountId, accountId),
        eq(schema.cashMovements.source, "detected"),
        sql`${schema.cashMovements.date} = ${date}`
      )
    )
    .limit(1);
  return row ?? null;
}

export async function insertDetectedMovement(
  accountId: string,
  movement: {
    date: string;
    amount: number;
    currency: Currency;
    type: string;
    message: string;
  }
): Promise<void> {
  await db.insert(schema.cashMovements).values({
    accountId,
    // String explícito + cast ::date: evita cualquier corrimiento de
    // zona horaria al interpretar un DATE de Postgres (regla PREREQ-1).
    date: sql`${movement.date}::date`,
    amount: String(movement.amount),
    currency: movement.currency,
    type: movement.type,
    source: "detected",
    status: "pending",
    description: movement.message,
  });
}
