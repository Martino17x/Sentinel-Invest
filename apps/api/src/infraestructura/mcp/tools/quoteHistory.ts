import { z } from "zod";
import { getIolProvider } from "../../../services/iol/index.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// get_quote_history â€” histÃ³rico de precios por sÃ­mbolo
// Thin-wrapper parity a GET /api/quotes/:symbol/history.
// Llama directo a IolProvider.getQuoteHistory (no fetch a propia API).
// Propaga ctx.signal 15s via Promise.race, never throws,
// capa output para no desbordar contexto.
// ============================================================

const marketSchema = z.enum(["bcba", "nyse", "nasdaq", "bonds", "fci", "crypto"]);

function fmtPrice(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

const MAX_LINES = 150;

export const getQuoteHistoryTool: ToolDefinition = {
  name: "get_quote_history",
  description:
    "HistÃ³rico de precios de un instrumento (serie ajustada). Parity a GET /api/quotes/:symbol/history. Params: symbol (ticker), market default bcba, days 1-365 default 90. Devuelve serie {date, close} para grÃ¡fico/valoraciÃ³n.",
  inputSchema: z.object({
    symbol: z.string().min(1, "SÃ­mbolo requerido").max(12, "SÃ­mbolo muy largo").toUpperCase(),
    market: marketSchema.default("bcba"),
    days: z.coerce.number().int().min(1).max(365).optional().default(90),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { symbol: string; market: string; days: number };
    const symbol = args.symbol.toUpperCase().trim();
    const market = args.market ?? "bcba";
    const days = Math.min(args.days ?? 90, 365);
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: `HistÃ³rico ${symbol}: down â€” timeout 15s` };
      }

      const provider = getIolProvider();

      const abortPromise = new Promise<never>((_, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });

      const history = await Promise.race([
        provider.getQuoteHistory(ctx.creds, symbol, market, days),
        abortPromise,
      ]);

      if (!history || history.length === 0) {
        return {
          ok: true,
          message: `HistÃ³rico ${symbol} (${market}, ${days}d): sin datos â€” la fuente no devolviÃ³ serie histÃ³rica para este sÃ­mbolo/mercado.`,
        };
      }

      const total = history.length;
      const capped = total > MAX_LINES;
      const slice = capped ? history.slice(-MAX_LINES) : history;

      // Formato compacto: primera/Ãºltima + sample si muchos puntos
      const lines = slice.map((p) => {
        const d = new Date(p.date).toISOString().slice(0, 10);
        return `- ${d} | close ${fmtPrice(p.close)}`;
      });

      const first = history[0];
      const last = history[history.length - 1];
      const changePct = first.close !== 0 ? ((last.close - first.close) / first.close) * 100 : 0;
      const changeStr = `${changePct > 0 ? "+" : ""}${changePct.toFixed(2)}%`;
      const suffix = capped ? ` (mostrando Ãºltimos ${slice.length} de ${total})` : ` (total ${total})`;
      const rangeStr = `${new Date(first.date).toISOString().slice(0, 10)} â†’ ${new Date(last.date).toISOString().slice(0, 10)}`;

      return {
        ok: true,
        message: `HistÃ³rico ${symbol} (${market}, ${days}d) ${rangeStr} â€” variaciÃ³n perÃ­odo ${changeStr}${suffix}:\n${lines.join("\n")}`,
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: `HistÃ³rico ${symbol}: down â€” timeout 15s` };
      }
      return {
        ok: false,
        message: `HistÃ³rico ${symbol}: error â€” ${err instanceof Error ? err.message : "Error al consultar el histÃ³rico"}`,
      };
    }
  },
};
