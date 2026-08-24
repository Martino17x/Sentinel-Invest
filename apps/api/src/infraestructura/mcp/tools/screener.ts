import { z } from "zod";
import { getScreener } from "../../../services/analysis/screener.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// get_screener â€” TradingView screener (P1 thin-wrapper)
// Thin-wrapper over services/analysis/screener.ts getScreener.
// Reuses 15min SwrCache, never throws, propagates ctx.signal 15s.
// Parity to GET /api/analysis/screener.
// ============================================================

function fmtPrice(n: number | null): string {
  if (n == null) return "n/d";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function fmtPct(n: number | null): string {
  if (n == null) return "n/d";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function formatRows(
  market: string,
  rows: Awaited<ReturnType<typeof getScreener>> extends { data: infer D } ? D : never,
  cached: boolean,
): string {
  const list = (rows ?? []) as import("../../../services/analysis/types.js").ScreenerRow[];
  const count = list.length;
  if (count === 0) {
    return `Screener ${market}: sin resultados${cached ? " (cache)" : ""}`;
  }
  const lines = list.map(
    (r) =>
      `- ${r.symbol}${r.name ? ` | ${r.name}` : ""} | ${fmtPrice(r.price)} | ${fmtPct(r.changePct)} | vol ${r.volume ?? "n/d"} | mCap ${r.marketCap ?? "n/d"} | PE ${r.pe ?? "n/d"}`,
  );
  const staleFlag = cached ? " (cache)" : "";
  return `Screener ${market}: ${count} resultados${staleFlag}\n${lines.join("\n")}`;
}

export const getScreenerTool: ToolDefinition = {
  name: "get_screener",
  description:
    "Screener de mercado TradingView: escanea acciones/CEDEARs por mercado (bcba|us) con filtro opcional por sÃ­mbolo/nombre. Reusa cache 15min, cap 150 filas. Parity a GET /api/analysis/screener.",
  inputSchema: z.object({
    market: z.enum(["bcba", "us"]),
    query: z.string().max(60).optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { market: "bcba" | "us"; query?: string };
    try {
      const result = await getScreener(args.market, {
        query: args.query,
        signal: ctx.signal,
      });

      if (result.status === "ok" && result.data) {
        // Cap 150 (service already caps, but enforce)
        const capped = result.data.slice(0, 150);
        return {
          ok: true,
          message: formatRows(args.market, capped as never, result.cached),
        };
      }

      if (result.status === "rate_limited") {
        return {
          ok: false,
          message: `Screener ${args.market}: rate_limited â€” ${result.error ?? "Rate limit"} (reintentÃ¡ en unos minutos)`,
        };
      }

      // down or empty
      return {
        ok: false,
        message: `Screener ${args.market}: down â€” ${result.error ?? "Fuente no responde"}`,
      };
    } catch (err) {
      // Abort / timeout propagated via ctx.signal â€” map to down, never throw
      if (ctx.signal.aborted) {
        return { ok: false, message: `Screener ${args.market}: down â€” timeout 15s` };
      }
      return {
        ok: false,
        message: `Screener ${args.market}: down â€” ${err instanceof Error ? err.message : "Error desconocido"}`,
      };
    }
  },
};
