// ============================================================
// BACKFILL HÍBRIDO — walkers PUROS (sin BD, testables con fakes)
// (spec F3-C2 / design: backfill.ts)
//
// Posiciones FORWARD: desde la primera operación accepted, aplicar
//   ops por día y valorar al cierre ajustado → snapshot diario de
//   posiciones (FCI vía proveedor de precios inyectable).
// Cash BACKWARD: desde el saldo actual, invertir los flujos netos
//   diarios → cash de cada día.
//
// Todo es puro: los providers (precio, ops, balances) se inyectan,
// así el runner los resuelve contra IOL/BD y los tests usan fakes.
// ============================================================

import type { Currency, Market, OperationType } from "../iol/types.js";

export interface OperationInput {
  symbol: string;
  market: Market;
  type: OperationType;
  status: string;
  quantity: number;
  total: number;
  commission: number;
  currency: Currency;
  date: string; // ISO
}

export interface MovementInput {
  date: string; // YYYY-MM-DD
  amount: number; // firmado
  currency: Currency;
  status: string;
}

export interface BackfillPosition {
  symbol: string;
  market: Market;
  quantity: number;
  price: number; // cierre ajustado del día (o último conocido)
  value: number; // quantity * price
  currency: Currency;
}

export interface BackfillSnapshot {
  date: string; // YYYY-MM-DD (dateKey ART)
  positions: BackfillPosition[];
  positionsValueArs: number;
  positionsValueUsd: number;
  cashArs: number;
  cashUsd: number;
  totalValue: number;
  totalValueUsd: number;
  currency: Currency;
  source: "reconstructed";
}

/** Proveedor de precio de cierre ajustado (sync, ya pre-cargado). */
export type GetClose = (symbol: string, market: Market, dateKey: string) => number | null;

export interface DailyNetFlow {
  date: string; // YYYY-MM-DD
  netFlowArs: number;
  netFlowUsd: number;
}

// ============================================================
// Utilidades de fechas (dateKey ART = YYYY-MM-DD, sin tz)
// ============================================================

function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (start > end) return days;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function holdingKey(symbol: string, market: Market): string {
  return `${symbol}|${market}`;
}

// ============================================================
// walkPositions — posiciones hacia adelante
// ============================================================

export interface WalkPositionsOptions {
  initialPositions?: { symbol: string; market: Market; quantity: number; currency: Currency }[];
}

export function walkPositions(
  operations: OperationInput[],
  from: string,
  to: string,
  getClose: GetClose,
  options: WalkPositionsOptions = {}
): BackfillSnapshot[] {
  const days = enumerateDays(from, to);
  if (days.length === 0) return [];

  const accepted = operations
    .filter((op) => op.status === "accepted")
    .map((op) => ({ ...op, dateKey: op.date.slice(0, 10) }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  const holdings = new Map<string, { symbol: string; market: Market; currency: Currency; quantity: number; lastPrice: number }>();
  for (const p of options.initialPositions ?? []) {
    holdings.set(holdingKey(p.symbol, p.market), {
      symbol: p.symbol,
      market: p.market,
      currency: p.currency,
      quantity: p.quantity,
      lastPrice: 0,
    });
  }

  let opIdx = 0;
  const snaps: BackfillSnapshot[] = [];

  for (const day of days) {
    while (opIdx < accepted.length && accepted[opIdx].dateKey <= day) {
      const op = accepted[opIdx++];
      const key = holdingKey(op.symbol, op.market);
      const h = holdings.get(key) ?? {
        symbol: op.symbol,
        market: op.market,
        currency: op.currency,
        quantity: 0,
        lastPrice: 0,
      };
      const delta = op.type === "buy" || op.type === "subscription" ? op.quantity : -op.quantity;
      h.quantity += delta;
      if (h.quantity === 0) holdings.delete(key);
      else holdings.set(key, h);
    }

    const positions: BackfillPosition[] = [];
    let ars = 0;
    let usd = 0;
    for (const h of holdings.values()) {
      const close = getClose(h.symbol, h.market, day);
      if (close != null) h.lastPrice = close;
      const price = h.lastPrice;
      const value = h.quantity * price;
      positions.push({
        symbol: h.symbol,
        market: h.market,
        quantity: h.quantity,
        price,
        value,
        currency: h.currency,
      });
      if (h.currency === "ARS") ars += value;
      else usd += value;
    }

    snaps.push({
      date: day,
      positions,
      positionsValueArs: ars,
      positionsValueUsd: usd,
      cashArs: 0,
      cashUsd: 0,
      totalValue: ars,
      totalValueUsd: usd,
      currency: "ARS",
      source: "reconstructed",
    });
  }

  return snaps;
}

// ============================================================
// walkCashBackwards — cash hacia atrás desde el saldo actual
// cash(d-1) = cash(d) − netFlow(d)
// ============================================================

export function walkCashBackwards(
  lastCashArs: number,
  lastCashUsd: number,
  flows: DailyNetFlow[]
): Map<string, { cashArs: number; cashUsd: number }> {
  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const result = new Map<string, { cashArs: number; cashUsd: number }>();
  let ars = lastCashArs;
  let usd = lastCashUsd;
  for (let i = sorted.length - 1; i >= 0; i--) {
    result.set(sorted[i].date, { cashArs: ars, cashUsd: usd });
    ars = ars - sorted[i].netFlowArs;
    usd = usd - sorted[i].netFlowUsd;
  }
  return result;
}

// ============================================================
// buildNetFlows — flujo neto diario (ops + movimientos confirmed)
// ============================================================

export function buildNetFlows(
  operations: OperationInput[],
  movements: MovementInput[],
  from: string,
  to: string
): DailyNetFlow[] {
  const days = enumerateDays(from, to);
  const map = new Map<string, { netFlowArs: number; netFlowUsd: number }>();
  for (const d of days) map.set(d, { netFlowArs: 0, netFlowUsd: 0 });

  for (const op of operations) {
    if (op.status !== "accepted") continue;
    const dk = op.date.slice(0, 10);
    const bucket = map.get(dk);
    if (!bucket) continue;
    const isInflow = op.type === "sell" || op.type === "redemption";
    const net = isInflow ? op.total : -op.total - op.commission;
    if (op.currency === "ARS") bucket.netFlowArs += net;
    else bucket.netFlowUsd += net;
  }

  for (const mv of movements) {
    if (mv.status !== "confirmed") continue;
    const bucket = map.get(mv.date);
    if (!bucket) continue;
    if (mv.currency === "ARS") bucket.netFlowArs += mv.amount;
    else bucket.netFlowUsd += mv.amount;
  }

  return days.map((d) => ({ date: d, ...map.get(d)! }));
}
