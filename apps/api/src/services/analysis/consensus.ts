// ============================================================
// consensus.ts — TradingView targets bundle (spec A.3)
// TTL 60min, SwrCache key `consensus:{tvSymbol}`, source "tradingview"
// POST https://scanner.tradingview.com/global/scan
// columns: Recommend.All, price_target_high/low/average,
//          recommendation_buy/hold/sell, number_of_analyst_opinions,
//          earnings_release_next_date (unix int)
// Nunca lanza: cualquier fallo → {status:"down"|"rate_limited", data:null}
// ============================================================

import { resolveAnalysisSymbols } from "./symbol.js";
import { fetchJson } from "./http.js";
import { SwrCache } from "../market/cache.js";
import type { AnalysisEnvelope, ConsensusData, AnalysisMarket, AnalysisOpts } from "./types.js";

const TTL_MS = 60 * 60 * 1000; // 60min canónico spec 0.3

const cache = new SwrCache<ConsensusData>(TTL_MS);

export function resetConsensusCache(): void {
  cache.resetForTests();
}

// Orden canónico — debe coincidir con fixture spec 0.4 / tasks A3-1
// El mock de tests usa este orden exacto para d[]
const CONSENSUS_COLUMNS = [
  "Recommend.All",
  "price_target_high",
  "price_target_low",
  "price_target_average",
  "recommendation_buy",
  "recommendation_hold",
  "recommendation_sell",
  "number_of_analyst_opinions",
  "earnings_release_next_date",
] as const;

const SCANNER_URL = "https://scanner.tradingview.com/global/scan";

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

function mapRecommendation(v: number | null): ConsensusData["recommendation"] {
  if (v === null || v === undefined) return null;
  if (v >= 0.5) return "buy";
  if (v >= 0.1) return "overweight";
  if (v > -0.1) return "hold";
  if (v > -0.5) return "underweight";
  return "sell";
}

function unixToIsoDate(unix: unknown): string | null {
  const n = numOrNull(unix);
  if (n === null || n === 0) return null;
  // TradingView devuelve int unix en segundos
  try {
    const d = new Date(n * 1000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return null;
  }
}

function resolveArgs(
  marketOrOpts?: AnalysisMarket | AnalysisOpts,
  signal?: AbortSignal
): { market?: AnalysisMarket; signal?: AbortSignal } {
  if (!marketOrOpts) return { signal };
  if (typeof marketOrOpts === "string") return { market: marketOrOpts, signal };
  return {
    market: (marketOrOpts as AnalysisOpts).market,
    signal: (marketOrOpts as AnalysisOpts).signal ?? signal,
  };
}

interface ScannerResponse {
  totalCount?: number;
  data?: Array<{ s?: string; d?: unknown[] }>;
}

/**
 * Consenso de analistas vía TradingView scanner `targets` bundle.
 * @param symbol - ticker local (ej "GGAL", "AAPL", "BCBA:GGAL")
 * @param marketOrOpts - "bcba"|"nyse"|"nasdaq" o AnalysisOpts {market, signal}
 * @param signal - AbortSignal opcional (si marketOrOpts es string)
 * @returns AnalysisEnvelope<ConsensusData> — status "ok"|"down"|"rate_limited" con data T|null
 */
export async function getConsensus(
  symbol: string,
  marketOrOpts?: AnalysisMarket | AnalysisOpts,
  signal?: AbortSignal
): Promise<AnalysisEnvelope<ConsensusData>> {
  const { market, signal: resolvedSignal } = resolveArgs(marketOrOpts, signal);

  // resolveAnalysisSymbols lanza si market inválido (spec A.1)
  const { tv } = resolveAnalysisSymbols(symbol, market);
  const key = `consensus:${tv}`;

  const entry = cache.getEntry(key);
  if (entry && cache.isFresh(entry)) {
    return { status: "ok", data: entry.data, cached: true, source: "tradingview" };
  }

  const payload = JSON.stringify({
    symbols: { tickers: [tv] },
    columns: [...CONSENSUS_COLUMNS],
    range: [0, 1],
  });

  let res: { status: number; json: unknown };
  try {
    res = await fetchJson(SCANNER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: resolvedSignal,
    });
  } catch {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }

  if (res.status === 429) {
    return { status: "rate_limited", data: null, cached: false, source: "tradingview", error: "Rate limit" };
  }

  if (res.status === 0) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Fuente no responde" };
  }

  if (res.status >= 400) {
    // 4xx/5xx del scanner — tratar como down (symbol_not_found no aplica para TV scanner vacío)
    // Si quisiera distinguirse, vacío con totalCount 0 ya da down con mensaje
    const msg = res.status === 404 ? "Símbolo no encontrado" : "Fuente no responde";
    const status = res.status === 404 ? "symbol_not_found" as const : "down" as const;
    // Para 404 mapear a symbol_not_found para que route pueda dar 404 si todos son symbol_not_found
    // Pero tasks espera vacío → down, no symbol_not_found, así que solo 404 aquí sería symbol_not_found
    if (status === "symbol_not_found") {
      return { status, data: null, cached: false, source: "tradingview", error: msg };
    }
    return { status: "down", data: null, cached: false, source: "tradingview", error: msg };
  }

  const json = res.json as ScannerResponse | null;
  const row = json?.data?.[0];
  const d = row?.d as unknown[] | undefined;

  // Vacío o totalCount 0 → símbolo sin datos → down con data null (tasks: vacío→down)
  if (!json || !Array.isArray(json.data) || json.data.length === 0 || !d || d.length === 0) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Símbolo no encontrado" };
  }

  // Si toda la fila es null (TV devuelve nulls para símbolo desconocido) → down
  const allNull = d.every((v) => v === null || v === undefined);
  if (allNull) {
    return { status: "down", data: null, cached: false, source: "tradingview", error: "Símbolo no encontrado" };
  }

  // d en orden CONSENSUS_COLUMNS
  // d[0]=Recommend.All, d[1]=high, d[2]=low, d[3]=avg, d[4]=buy, d[5]=hold, d[6]=sell, d[7]=count, d[8]=earnings unix
  const recAll = numOrNull(d[0]);
  const high = numOrNull(d[1]);
  const low = numOrNull(d[2]);
  const avg = numOrNull(d[3]);
  const buys = numOrNull(d[4]);
  const holds = numOrNull(d[5]);
  const sells = numOrNull(d[6]);
  // d[7] number_of_analyst_opinions — no se expone directo, útil para validar rating null
  const earningsUnix = d[8];

  const rating =
    buys === null && holds === null && sells === null
      ? null
      : { buys, holds, sells };

  const data: ConsensusData = {
    source: "tradingview",
    targetHigh: high,
    targetLow: low,
    targetAvg: avg,
    recommendation: mapRecommendation(recAll),
    rating,
    nextEarningsDate: unixToIsoDate(earningsUnix),
    currency: null,
  };

  cache.set(key, data);
  return { status: "ok", data, cached: false, source: "tradingview" };
}

// Alias por si callers esperan nombre alternativo (compat)
export const fetchConsensus = getConsensus;
