import { z } from "zod";
import { getAnalysisService } from "../../../services/analysis/index.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// backtest_strategy â€” backtest analÃ­tico buy&hold (Yahoo chart
// + metrics.ts). Puramente analÃ­tico, NO ejecuta operaciones.
// Thin wrapper â†’ analysisService.runBacktest â†’ {ok,message} es-AR.
// ============================================================

const marketSchema = z.enum(["bcba", "nyse", "nasdaq"]);

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return n.toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export const backtestStrategyTool: ToolDefinition = {
  name: "backtest_strategy",
  description:
    "Backtest analÃ­tico de una estrategia buy&hold sobre un sÃ­mbolo: retorno total, anualizado, volatilidad, Sharpe, max drawdown y comparaciÃ³n contra benchmark (default ^MERV). Puramente analÃ­tico, NO ejecuta operaciones.",
  inputSchema: z.object({
    symbol: z.string().min(1, "EscribÃ­ un sÃ­mbolo (ej: GGAL, AAPL)").max(10, "SÃ­mbolo muy largo").toUpperCase(),
    market: marketSchema.optional(),
    range: z.enum(["1y", "5y"]).optional().default("1y"),
    benchmark: z.string().min(1).max(20).optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { symbol: string; market?: "bcba" | "nyse" | "nasdaq"; range?: "1y" | "5y"; benchmark?: string };
    const svc = getAnalysisService();
    let res;
    try {
      res = await svc.runBacktest(
        {
          symbol: args.symbol,
          market: args.market,
          range: args.range ?? "1y",
          benchmark: args.benchmark ?? undefined,
        },
        ctx.signal,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, message: `Backtest de ${args.symbol.toUpperCase()} no disponible: ${msg}` };
    }

    if (res.status !== "ok" || !res.data) {
      const detail = res.error ?? "Fuente no responde";
      const src = res.source ? ` (fuente: ${res.source})` : "";
      if (res.status === "symbol_not_found" || detail.toLowerCase().includes("no encontrado")) {
        return { ok: false, message: `Backtest de ${args.symbol.toUpperCase()} no disponible: SÃ­mbolo no encontrado${src}. VerificÃ¡ el sÃ­mbolo y el mercado.` };
      }
      if (res.status === "rate_limited") {
        return { ok: false, message: `Backtest de ${args.symbol.toUpperCase()} no disponible: Rate limit${src}.` };
      }
      return { ok: false, message: `Backtest de ${args.symbol.toUpperCase()} no disponible: ${detail}${src}.` };
    }

    const d = res.data;
    const m = d.metrics;
    const range = args.range ?? "1y";
    const cachedNote = res.cached ? "cacheado" : "actualizado";
    const parts: string[] = [];
    parts.push(`Backtest buy&hold de ${args.symbol.toUpperCase()} â€” rango ${range}, fuente: ${res.source} (${cachedNote}), ${d.series.length} puntos:`);
    parts.push(`Retorno total: ${fmtPct(m.totalReturn)} | Anualizado: ${fmtPct(m.annualizedReturn)} | Volatilidad: ${fmtPct(m.volatility)} | Sharpe: ${fmtNum(m.sharpe)} | Max drawdown: ${fmtPct(m.maxDrawdown)}.`);
    if (d.benchmark) {
      const bm = d.benchmark.metrics;
      parts.push(`Benchmark ${d.benchmark.name}: retorno ${fmtPct(bm.totalReturn)}, anualizado ${fmtPct(bm.annualizedReturn)}, vol ${fmtPct(bm.volatility)}, Sharpe ${fmtNum(bm.sharpe)}, drawdown ${fmtPct(bm.maxDrawdown)}.`);
    } else if (args.benchmark) {
      parts.push(`Benchmark ${args.benchmark}: no disponible (dato principal usable igual).`);
    }
    parts.push("Nota: anÃ¡lisis estadÃ­stico basado en datos histÃ³ricos â€” no es asesoramiento financiero.");
    return { ok: true, message: parts.join(" ") };
  },
};
