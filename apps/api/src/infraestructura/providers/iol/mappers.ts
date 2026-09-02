import { MarketCode, SettlementType } from "@sentinel/domain";
import type { Position, Operation, Quote } from "../../../services/iol/types.js";

/**
 * Mappers IOL ↔ dominio canónico — Commit 2.
 * Extraído de services/iol/IolApiProvider.ts. Cada broker tiene su
 * mapper (PPI usará ppi/mappers.ts con misma firma).
 */

export function mapMarketToIol(market: string): string {
  const m = market.toLowerCase();
  if (m.includes("nyse")) return MarketCode.NYSE;
  if (m.includes("nasdaq")) return MarketCode.NASDAQ;
  if (m.includes("rofx")) return "rOFX" as MarketCode;
  return MarketCode.BCBA;
}

export function zeroQuote(symbol: string, market: string): Quote {
  return {
    symbol,
    market: mapMarket(market),
    lastPrice: 0,
    variationPct: 0,
    currency: market === "bcba" || market === "bonds" ? "ARS" : "USD",
    updatedAt: new Date().toISOString(),
    open: null,
    high: null,
    low: null,
    prevClose: null,
    volume: null,
  };
}

export function mapMarket(market: string): Position["market"] {
  const m = market.toLowerCase();
  if (m.includes("nyse")) return "nyse";
  if (m.includes("nasdaq")) return "nasdaq";
  if (m.includes("bono") || m.includes("mae")) return "bonds";
  if (m.includes("fci") || m.includes("fondo")) return "fci";
  if (m.includes("crypto")) return "crypto";
  return "bcba";
}

export function mapAssetType(tipo: string): Position["assetType"] {
  const t = tipo.toLowerCase();
  if (t.includes("cedear")) return "cedear";
  if (t.includes("bono") || t.includes("titulo") || t.includes("publico")) return "bono";
  if (t.includes("fci") || t.includes("fondo")) return "fci";
  if (t.includes("caucion")) return "caucion";
  if (t.includes("futuro")) return "futuro";
  if (t.includes("opcion")) return "opcion";
  if (t.includes("moneda")) return "moneda";
  return "accion";
}

export function mapOperationType(tipo: string): Operation["type"] {
  const t = tipo.toLowerCase();
  if (t.includes("venta") || t.includes("sell")) return "sell";
  if (t.includes("rescate") || t.includes("redemption")) return "redemption";
  if (t.includes("suscripcion") || t.includes("subscription")) return "subscription";
  return "buy";
}

export function mapOperationStatus(estado: string): Operation["status"] {
  const s = estado.toLowerCase();
  if (s.includes("pend")) return "pending";
  if (s.includes("rech")) return "rejected";
  if (s.includes("cancel")) return "cancelled";
  return "accepted";
}

export function mapOperationStatusToIol(status: Operation["status"]): string {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "accepted":
      return "Aceptada";
    case "rejected":
      return "Rechazada";
    case "cancelled":
      return "Cancelada";
  }
}

export function buildDistribution(
  positions: Position[],
  cashArs: number,
  cashUsd: number
): { label: string; pct: number }[] {
  const totalArs = cashArs + positions.filter((p) => p.currency === "ARS").reduce((s, p) => s + p.totalValue, 0);
  const totalUsd = cashUsd + positions.filter((p) => p.currency === "USD").reduce((s, p) => s + p.totalValue, 0);
  const total = totalArs + totalUsd;
  if (total === 0) return [];

  const dist: { label: string; pct: number }[] = [];
  if (cashArs > 0) dist.push({ label: "PESOS", pct: (cashArs / total) * 100 });
  if (cashUsd > 0) dist.push({ label: "DOLAR", pct: (cashUsd / total) * 100 });

  for (const p of positions) {
    dist.push({ label: p.symbol, pct: (p.totalValue / total) * 100 });
  }

  const sum = dist.reduce((s, d) => s + d.pct, 0);
  return dist.map((d) => ({ ...d, pct: Number(((d.pct / sum) * 100).toFixed(1)) }));
}
