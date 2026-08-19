// ============================================================
// fundamentals.ts — Yahoo-first provider (spec A.2, D1)
// TTL 60min, SwrCache key `yahoo:{yahooSymbol}`, source "yahoo"
// SimplyWallSt OFF in v1 — documented as future fallback only.
// Envuelve market/yahoo.ts fetchFundamentals (crumb flow) con
// envelope AnalysisEnvelope<FundamentalsData> (ok | down).
// Nunca lanza por red: cualquier fallo → {status:"down", data:null}.
// SWS fallback: solo si Yahoo null Y existe snapshot cacheada
// (nunca on-demand ~30s) → source:"simplywallst". Desactivado v1.
// ============================================================

import { fetchFundamentals as fetchYahooFundamentals } from "../market/yahoo.js";
import { resolveAnalysisSymbols } from "./symbol.js";
import { SwrCache } from "../market/cache.js";
import type { AnalysisEnvelope, FundamentalsData, AnalysisMarket, AnalysisOpts } from "./types.js";

const TTL_MS = 60 * 60 * 1000; // 60min canónico spec 0.3

const cache = new SwrCache<FundamentalsData>(TTL_MS);

/** Solo para tests: vacía la cache de fundamentals */
export function resetFundamentalsCache(): void {
  cache.resetForTests();
}

function toFundamentalsData(
  raw: { pe: number | null; eps: number | null; beta: number | null; margin: number | null; roe: number | null; debtEquity: number | null; dividendYield: number | null; marketCap: number | null },
  source: FundamentalsData["source"] = "yahoo"
): FundamentalsData {
  return {
    source,
    pe: raw.pe,
    eps: raw.eps,
    beta: raw.beta,
    margin: raw.margin,
    roe: raw.roe,
    debtEquity: raw.debtEquity,
    dividendYield: raw.dividendYield,
    marketCap: raw.marketCap,
  };
}

function resolveArgs(
  marketOrOpts?: AnalysisMarket | AnalysisOpts,
  signal?: AbortSignal
): { market?: AnalysisMarket; signal?: AbortSignal } {
  if (!marketOrOpts) return { signal };
  if (typeof marketOrOpts === "string") return { market: marketOrOpts, signal };
  // object form AnalysisOpts
  return { market: (marketOrOpts as AnalysisOpts).market, signal: (marketOrOpts as AnalysisOpts).signal ?? signal };
}

/**
 * Fundamentales Yahoo-first.
 * @param symbol - ticker local (ej "GGAL", "AAPL", "GGAL.BA", "BCBA:GGAL")
 * @param marketOrOpts - "bcba"|"nyse"|"nasdaq" o AnalysisOpts {market, signal}
 * @param signal - AbortSignal opcional (si marketOrOpts es string)
 * @returns AnalysisEnvelope<FundamentalsData> — status "ok" | "down" (v1: Yahoo null→down, nunca symbol_not_found)
 *          y para compat con prompt A2 InsightBlock, "down" equivale a externo "error" con data:null
 */
export async function getFundamentals(
  symbol: string,
  marketOrOpts?: AnalysisMarket | AnalysisOpts,
  signal?: AbortSignal
): Promise<AnalysisEnvelope<FundamentalsData>> {
  const { market, signal: resolvedSignal } = resolveArgs(marketOrOpts, signal);

  // resolveAnalysisSymbols lanza si market inválido (spec A.1)
  const { yahoo } = resolveAnalysisSymbols(symbol, market);
  const key = `yahoo:${yahoo}`;

  const entry = cache.getEntry(key);
  if (entry && cache.isFresh(entry)) {
    return { status: "ok", data: entry.data, cached: true, source: entry.data.source };
  }

  // SWR ligero: si hay entry vencida la seguimos sirviendo mientras refrescamos?
  // Para v1 fundamentals STALE no se sirve como fresco; solo fresco se cachea.
  // Si hay stale, igual hacemos fetch nuevo pero no devolvemos stale (menos complejidad).

  let raw: Awaited<ReturnType<typeof fetchYahooFundamentals>>;
  try {
    raw = await fetchYahooFundamentals(yahoo, resolvedSignal);
  } catch {
    return { status: "down", data: null, cached: false, source: "yahoo", error: "Fuente no responde" };
  }

  if (!raw) {
    // Yahoo null → down (v1). SWS fallback OFF: no on-demand.
    // Futuro: if (swsSnapshotCache.get(key)) return {status:"ok", data: swsData, cached:true, source:"simplywallst"}
    return { status: "down", data: null, cached: false, source: "yahoo", error: "Fuente no responde" };
  }

  const data = toFundamentalsData(raw, "yahoo");
  cache.set(key, data);
  return { status: "ok", data, cached: false, source: "yahoo" };
}

// Alias para compat con enunciado batch A2 que pide export fetchFundamentals
export const fetchFundamentals = getFundamentals;

// Re-export para callers que esperan InsightBlock externo (mapeo ok→ok, down→error se hace en analysis-service insights())
// Esta capa mantiene status interno AnalysisStatus; el facade insights() mapea a "ok"|"error".
