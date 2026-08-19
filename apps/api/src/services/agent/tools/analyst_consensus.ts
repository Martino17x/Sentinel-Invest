import { z } from "zod";
import { getAnalysisService } from "../../analysis/index.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// analyst_consensus — consenso TradingView (recomendación,
// distribución, precio objetivo + próxima fecha earnings)
// Thin wrapper → getConsensus → {ok,message} es-AR, ctx.signal.
// ============================================================

const marketSchema = z.enum(["bcba", "nyse", "nasdaq"]);

const esAr = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function fmtNum(n: number | null, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return n.toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "n/d";
  return `$${esAr.format(n)}`;
}

const recLabel: Record<string, string> = {
  buy: "Compra",
  overweight: "Sobreponderar",
  hold: "Mantener",
  underweight: "Infraponderar",
  sell: "Venta",
};

function countdown(nextDate: string | null): string {
  if (!nextDate) return "";
  try {
    const target = new Date(nextDate + "T00:00:00Z");
    if (Number.isNaN(target.getTime())) return "";
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const t0 = today.getTime();
    const t1 = target.getTime();
    const diff = Math.ceil((t1 - t0) / 86400000);
    if (diff === 0) return " (hoy)";
    if (diff === 1) return " (mañana, en 1 día)";
    if (diff > 1) return ` (en ${diff} días)`;
    if (diff === -1) return " (ayer, hace 1 día)";
    return ` (hace ${Math.abs(diff)} días)`;
  } catch {
    return "";
  }
}

export const analystConsensusTool: ToolDefinition = {
  name: "analyst_consensus",
  description:
    "Consenso de analistas (recomendación, distribución compra/mantener/vender, precio objetivo alto/bajo/promedio) de un instrumento. Usalo para opinión de mercado sobre un símbolo.",
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
      res = await svc.consensus(args.symbol, { market: args.market, signal: ctx.signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, message: `Consenso de ${args.symbol.toUpperCase()} no disponible: ${msg}` };
    }

    if (res.status !== "ok" || !res.data) {
      const detail = res.error ?? "Fuente no responde";
      const src = res.source ? ` (fuente: ${res.source})` : "";
      if (res.status === "symbol_not_found" || detail.toLowerCase().includes("no encontrado")) {
        return { ok: false, message: `Consenso de ${args.symbol.toUpperCase()} no disponible: Símbolo no encontrado${src}. Verificá el símbolo y el mercado.` };
      }
      if (res.status === "rate_limited") {
        return { ok: false, message: `Consenso de ${args.symbol.toUpperCase()} no disponible: Rate limit${src}. Probá de nuevo en unos segundos.` };
      }
      return { ok: false, message: `Consenso de ${args.symbol.toUpperCase()} no disponible: ${detail}${src}.` };
    }

    const d = res.data;
    const cachedNote = res.cached ? "cacheado" : "actualizado";
    const parts: string[] = [];
    parts.push(`Consenso de ${args.symbol.toUpperCase()} — fuente: ${res.source} (${cachedNote}):`);

    const rec = d.recommendation ? (recLabel[d.recommendation] ?? d.recommendation) : "n/d";
    parts.push(`Recomendación: ${rec}${d.recommendation ? ` (${d.recommendation})` : ""}.`);

    if (d.rating) {
      const buys = d.rating.buys ?? 0;
      const holds = d.rating.holds ?? 0;
      const sells = d.rating.sells ?? 0;
      const anyVal = d.rating.buys != null || d.rating.holds != null || d.rating.sells != null;
      if (anyVal) {
        parts.push(`Distribución: ${fmtNum(buys, 0)} compra, ${fmtNum(holds, 0)} mantener, ${fmtNum(sells, 0)} venta.`);
      } else {
        parts.push(`Distribución: n/d.`);
      }
    } else {
      parts.push(`Distribución: n/d.`);
    }

    parts.push(`Precio objetivo: alto ${fmtPrice(d.targetHigh)}, promedio ${fmtPrice(d.targetAvg)}, bajo ${fmtPrice(d.targetLow)}.`);

    if (d.nextEarningsDate) {
      parts.push(`Próximo earnings: ${d.nextEarningsDate}${countdown(d.nextEarningsDate)}.`);
    } else {
      parts.push(`Próximo earnings: n/d.`);
    }

    if (d.currency) parts.push(`Moneda: ${d.currency}.`);

    return { ok: true, message: parts.join(" ") };
  },
};
