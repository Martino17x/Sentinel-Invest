import { z } from "zod";
import { getAnalysisService } from "../../../services/analysis/index.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// earnings â€” REUSA getConsensus (NO hay earnings.ts service,
// per decision D: earnings â†’ earnings_release_next_date vÃ­a TV
// scanner). Render SOLO nextEarningsDate + countdown.
// Thin wrapper, permission allow, ctx.signal, es-AR.
// ============================================================

const marketSchema = z.enum(["bcba", "nyse", "nasdaq"]);

function countdown(nextDate: string): string {
  try {
    const target = new Date(nextDate + "T00:00:00Z");
    if (Number.isNaN(target.getTime())) return "";
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "hoy";
    if (diff === 1) return "maÃ±ana (en 1 dÃ­a)";
    if (diff > 1) return `en ${diff} dÃ­as`;
    if (diff === -1) return "ayer (hace 1 dÃ­a)";
    return `hace ${Math.abs(diff)} dÃ­as`;
  } catch {
    return "";
  }
}

export const earningsTool: ToolDefinition = {
  name: "earnings",
  description:
    "PrÃ³xima fecha de earnings (resultados) de un instrumento y cuenta regresiva. Usalo cuando pregunten cuÃ¡ndo reporta una empresa.",
  inputSchema: z.object({
    symbol: z.string().min(1, "EscribÃ­ un sÃ­mbolo (ej: GGAL, AAPL)").max(10, "SÃ­mbolo muy largo").toUpperCase(),
    market: marketSchema.optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { symbol: string; market?: "bcba" | "nyse" | "nasdaq" };
    const svc = getAnalysisService();
    let res;
    try {
      res = await svc.consensus(args.symbol, { market: args.market, signal: ctx.signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, message: `Earnings de ${args.symbol.toUpperCase()} no disponibles: ${msg}` };
    }

    if (res.status !== "ok" || !res.data) {
      const detail = res.error ?? "Fuente no responde";
      const src = res.source ? ` (fuente: ${res.source})` : "";
      if (res.status === "symbol_not_found" || detail.toLowerCase().includes("no encontrado")) {
        return { ok: false, message: `Earnings de ${args.symbol.toUpperCase()} no disponibles: SÃ­mbolo no encontrado${src}.` };
      }
      if (res.status === "rate_limited") {
        return { ok: false, message: `Earnings de ${args.symbol.toUpperCase()} no disponibles: Rate limit${src}.` };
      }
      return { ok: false, message: `Earnings de ${args.symbol.toUpperCase()} no disponibles: ${detail}${src}.` };
    }

    const next = res.data.nextEarningsDate;
    if (!next) {
      return { ok: false, message: `Sin fecha de earnings disponible para ${args.symbol.toUpperCase()} (fuente: ${res.source}). El proveedor no publicÃ³ la prÃ³xima fecha de resultados.` };
    }

    const cd = countdown(next);
    const when = cd ? `${next} (${cd})` : next;
    const cachedNote = res.cached ? "cacheado" : "actualizado";
    return {
      ok: true,
      message: `PrÃ³ximo earnings de ${args.symbol.toUpperCase()}: ${when} â€” fuente: ${res.source} (${cachedNote}).`,
    };
  },
};
