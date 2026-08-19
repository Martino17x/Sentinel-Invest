import { z } from "zod";
import { getAnalysisService } from "../../analysis/index.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// fundamentals — fundamentales Yahoo-first (PER, EPS, beta…)
// Thin wrapper → analysisService.getFundamentals → {ok,message}
// es-AR, usa ctx.signal, nunca lanza (ok:false con mensaje claro).
// ============================================================

const marketSchema = z.enum(["bcba", "nyse", "nasdaq"]);

const esAr = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return n.toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return `${(n * 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function fmtMarketCap(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return `$${esAr.format(n)}`;
}

export const fundamentalsTool: ToolDefinition = {
  name: "fundamentals",
  description:
    "Fundamentales de una acción/CEDEAR (PER, EPS, beta, margen, ROE, deuda/equity, dividend yield, market cap). Usalo cuando te pidan fundamentales o valuación.",
  inputSchema: z.object({
    symbol: z.string().min(1, "Escribí un símbolo (ej: GGAL, AAPL)").max(10, "Símbolo muy largo").toUpperCase(),
    market: marketSchema.optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { symbol: string; market?: "bcba" | "nyse" | "nasdaq" };
    const svc = getAnalysisService();
    let res;
    try {
      res = await svc.fundamentals(args.symbol, { market: args.market, signal: ctx.signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, message: `Fundamentales de ${args.symbol.toUpperCase()} no disponibles: ${msg}` };
    }

    if (res.status !== "ok" || !res.data) {
      const detail = res.error ?? "Fuente no responde";
      const src = res.source ? ` (fuente: ${res.source})` : "";
      // Mapeo amigable para symbol_not_found
      if (res.status === "symbol_not_found" || detail.toLowerCase().includes("no encontrado")) {
        return { ok: false, message: `Fundamentales de ${args.symbol.toUpperCase()} no disponibles: Símbolo no encontrado${src}. Verificá el símbolo y el mercado (bcba, nyse, nasdaq).` };
      }
      if (res.status === "rate_limited") {
        return { ok: false, message: `Fundamentales de ${args.symbol.toUpperCase()} no disponibles: Rate limit${src}. Probá de nuevo en unos segundos.` };
      }
      return { ok: false, message: `Fundamentales de ${args.symbol.toUpperCase()} no disponibles: ${detail}${src}.` };
    }

    const d = res.data;
    const cachedNote = res.cached ? "cacheado" : "actualizado";
    const srcLabel = d.source === "simplywallst" ? "simplywallst" : res.source || d.source;
    const lines = [
      `Fundamentales de ${args.symbol.toUpperCase()} — fuente: ${srcLabel} (${cachedNote}):`,
      `- PER: ${fmtNum(d.pe)}`,
      `- EPS: ${fmtNum(d.eps)}`,
      `- Beta: ${fmtNum(d.beta)}`,
      `- Margen: ${fmtPct(d.margin)}`,
      `- ROE: ${fmtPct(d.roe)}`,
      `- Deuda/Equity: ${fmtNum(d.debtEquity)}`,
      `- Dividend yield: ${fmtPct(d.dividendYield)}`,
      `- Market cap: ${fmtMarketCap(d.marketCap)}`,
    ];
    return { ok: true, message: lines.join(" ") };
  },
};
