// ============================================================
// RECONCILIACIÓN DE EFECTIVO — funciones PURAS (spec F3-B2/B3/B5,
// design D5/D6)
//
// Objetivo: explicar el delta de efectivo entre dos snapshots
// consecutivos. Por moneda (ARS y USD SEPARADOS — IOL separa el
// disponible por moneda, types.ts:34-39).
//
//   deltaCash    = cash(hoy) − cash(previo)          [moneda X]
//   expected     = Σ movs confirmed (firmados)
//                + Σ ventas − Σ compras − Σ comisiones (ops accepted)
//   unexplained  = deltaCash − expected
//
//   Si |unexplained| > umbral (100 unidades de la moneda O 1% del
//   cash de esa moneda) y ≠ 0 → movimiento detected/pending con
//   mensaje "¿Fue un depósito? +$500.000".
//
// Gaps: el delta se mide contra el snapshot ANTERIOR (no el día
// calendario) → fines de semana/feriados quedan atribuidos al rango.
//
// Dev/nota (F3-B5): el union de Operation no expone cauciones como
// tipo propio (solo buy/sell/subscription/redemption), así que la
// sugerencia 'caucion' no se emite hoy — está declarada para cuando
// IOL las exponga. Nunca se clasifica automáticamente: el tipo en BD
// queda deposit/withdrawal y la alternativa va en suggestedType +
// mensaje.
// ============================================================

import type { Currency } from "../iol/types.js";

// ============================================================
// Tipos mínimos (shape-compatible con las filas de BD / ops IOL)
// ============================================================

export interface OperationLike {
  type: "buy" | "sell" | "subscription" | "redemption";
  status: string;
  currency: Currency;
  total: number;
  commission: number;
  date: string; // ISO
}

export interface CashMovementLike {
  date: string; // YYYY-MM-DD
  amount: number; // firmado: +ingreso / −egreso
  currency: Currency;
  status: string; // confirmed | pending | rejected
}

export interface SnapshotLike {
  date: string; // YYYY-MM-DD (dateKey ART del snapshot)
  cashArs: number;
  cashUsd: number;
}

export type DetectedMovementType = "deposit" | "withdrawal";
export type SuggestedType = "dividend" | "caucion" | "adjustment";

/** Movimiento propuesto por la reconciliación — espera confirmación humana. */
export interface DetectedMovement {
  date: string; // YYYY-MM-DD del snapshot "hoy"
  amount: number; // firmado (mismo convenio que cash_movements.amount)
  currency: Currency;
  type: DetectedMovementType;
  source: "detected";
  status: "pending";
  suggestedType: SuggestedType | null;
  message: string;
}

export interface ReconcileResult {
  currency: Currency;
  deltaCash: number;
  expected: number;
  unexplained: number;
  thresholdExceeded: boolean;
  movement: DetectedMovement | null;
}

// Umbrales (spec F3-B3 / design D6):
//  - absoluto: 100 UNIDADES de la moneda que se reconcilia
//    (ARS 100; USD 100 — la literal "ARS 100" del spec no aplica a
//    una cuenta en dólares, D6 pide el umbral por moneda).
//  - relativo: 1% del cash ACTUAL de esa moneda.
const DEFAULT_ABSOLUTE_THRESHOLD = 100;
const DEFAULT_PCT_THRESHOLD = 0.01;

// ============================================================
// expectedCashDelta
// ============================================================

/**
 * Delta de efectivo ESPERADO para un rango [from, to] de una moneda:
 * Σ movimientos confirmed (firmados) + Σ ventas − Σ compras −
 * Σ comisiones. Suscripción FCI cuenta como compra (sale plata),
 * rescate como venta (entra plata). Solo ops `accepted`.
 */
export function expectedCashDelta(
  currency: Currency,
  from: string,
  to: string,
  operations: OperationLike[],
  movements: CashMovementLike[]
): number {
  let expected = 0;

  for (const m of movements) {
    if (m.currency !== currency || m.status !== "confirmed") continue;
    if (m.date < from || m.date > to) continue;
    expected += m.amount;
  }

  for (const op of operations) {
    if (op.currency !== currency || op.status !== "accepted") continue;
    const dateKey = op.date.slice(0, 10);
    if (dateKey < from || dateKey > to) continue;
    const isInflow = op.type === "sell" || op.type === "redemption";
    expected += isInflow ? op.total : -op.total;
    expected -= op.commission;
  }

  return expected;
}

// ============================================================
// reconcileDay
// ============================================================

/**
 * Reconciliación de un día (delta vs snapshot ANTERIOR — los gaps se
 * atribuyen al rango completo, D6). Devuelve el movimiento detected
 * sugerido solo si el unexplained supera el umbral y es ≠ 0.
 */
export function reconcileDay(args: {
  currency: Currency;
  prevSnapshot: SnapshotLike;
  todaySnapshot: SnapshotLike;
  operations: OperationLike[];
  movements: CashMovementLike[];
  absoluteThreshold?: number;
  pctThreshold?: number;
}): ReconcileResult {
  const {
    currency,
    prevSnapshot,
    todaySnapshot,
    operations,
    movements,
  } = args;
  const absoluteThreshold = args.absoluteThreshold ?? DEFAULT_ABSOLUTE_THRESHOLD;
  const pctThreshold = args.pctThreshold ?? DEFAULT_PCT_THRESHOLD;

  const prevCash = currency === "USD" ? prevSnapshot.cashUsd : prevSnapshot.cashArs;
  const todayCash = currency === "USD" ? todaySnapshot.cashUsd : todaySnapshot.cashArs;
  const deltaCash = todayCash - prevCash;

  const expected = expectedCashDelta(
    currency,
    prevSnapshot.date,
    todaySnapshot.date,
    operations,
    movements
  );
  const unexplained = deltaCash - expected;

  const thresholdExceeded =
    unexplained !== 0 &&
    (Math.abs(unexplained) > absoluteThreshold ||
      Math.abs(unexplained) > Math.abs(todayCash) * pctThreshold);

  const movement = thresholdExceeded
    ? buildDetectedMovement({
        date: todaySnapshot.date,
        currency,
        unexplained,
        operations,
        from: prevSnapshot.date,
        to: todaySnapshot.date,
      })
    : null;

  return { currency, deltaCash, expected, unexplained, thresholdExceeded, movement };
}

// ============================================================
// Detected movement
// ============================================================

function buildDetectedMovement(args: {
  date: string;
  currency: Currency;
  unexplained: number;
  operations: OperationLike[];
  from: string;
  to: string;
}): DetectedMovement {
  const { date, currency, unexplained, operations, from, to } = args;
  const type: DetectedMovementType = unexplained > 0 ? "deposit" : "withdrawal";
  const suggestedType = suggestType(unexplained, operations, from, to);
  const message = messageFor(unexplained, currency, type, suggestedType);

  return {
    date,
    amount: unexplained,
    currency,
    type,
    source: "detected",
    status: "pending",
    suggestedType,
    message,
  };
}

/**
 * Sugiere el tipo alternativo sin clasificar automáticamente (F3-B5):
 *  - ingreso SIN operaciones en el rango → dividendo/cupón probable.
 *  - cualquier delta alrededor de operaciones → ajuste (settlement/redondeo).
 *  - caucion: no detectable con el union actual de OperationType.
 */
function suggestType(
  unexplained: number,
  operations: OperationLike[],
  from: string,
  to: string
): SuggestedType | null {
  const hasOpsInRange = operations.some((op) => {
    if (op.status !== "accepted") return false;
    const dateKey = op.date.slice(0, 10);
    return dateKey >= from && dateKey <= to;
  });

  if (hasOpsInRange) return "adjustment";
  if (unexplained > 0) return "dividend";
  return null;
}

function messageFor(
  unexplained: number,
  currency: Currency,
  type: DetectedMovementType,
  suggestedType: SuggestedType | null
): string {
  const abs = Math.abs(unexplained);
  const sign = unexplained > 0 ? "+" : "-";
  const formatted = abs.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const amountLabel = currency === "USD" ? `${sign}USD ${formatted}` : `${sign}$${formatted}`;

  switch (suggestedType) {
    case "dividend":
      return `¿Fue un dividendo o cupón? ${amountLabel}`;
    case "caucion":
      return `¿Fue una caución? ${amountLabel}`;
    case "adjustment":
      return `¿Fue un ajuste? ${amountLabel}`;
    default:
      return type === "deposit"
        ? `¿Fue un depósito? ${amountLabel}`
        : `¿Fue una extracción? ${amountLabel}`;
  }
}