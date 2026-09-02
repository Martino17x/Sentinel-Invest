import { z } from "zod";
import { getRadar, DISCLAIMER } from "../../../services/market/radar.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// get_radar_ccl â€” Radar CCL implÃ­cito CEDEARs
//
// Thin-wrapper sobre getRadar (services/market/radar.ts) con
// SwrCache 15min + stale-serve + disclaimer/isMarketClosed/generatdAt.
// Reusa ctx.signal (15s AbortController del executor).
// ============================================================

export const getRadarCclTool: ToolDefinition = {
  name: "get_radar_ccl",
  description:
    "Radar CCL implÃ­cito CEDEARs: ccl, spreadVsAvg, cclPromedio. Muestra brecha vs promedio. Filtros opcionales q, source, sort y paginaciÃ³n.",
  inputSchema: z.object({
    q: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    sort: z.enum(["spread", "symbol"]).default("spread"),
    source: z.enum(["all", "byma_usd", "yahoo"]).default("all"),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as {
      q?: string;
      page: number;
      limit: number;
      sort: "spread" | "symbol";
      source: "all" | "byma_usd" | "yahoo";
    };

    const data = await getRadar({
      q: args.q,
      page: args.page,
      limit: args.limit,
      sort: args.sort,
      source: args.source,
      signal: ctx.signal,
    });

    if (data.items.length === 0) {
      const closedNote = data.isMarketClosed ? "\nMercado cerrado â€” Ãºltimo cierre." : "";
      return {
        ok: true,
        message: `Radar CCL vacÃ­o (total ${data.total}, pÃ¡gina ${data.page}/${Math.ceil(data.total / data.limit) || 1})${closedNote}\nGenerado: ${data.generatedAt}\n${DISCLAIMER}`,
      };
    }

    const lines = data.items.map((r) => {
      const cclStr = r.ccl != null ? r.ccl.toFixed(2) : "â€”";
      const spreadStr = r.spreadVsAvg != null ? `${r.spreadVsAvg > 0 ? "+" : ""}${r.spreadVsAvg.toFixed(2)}%` : "â€”";
      const src = r.cclSource ? ` [${r.cclSource}]` : "";
      return `- ${r.symbol} | ${r.name} | CEDEAR ARS ${r.cedearPrice} | US$ ${r.underlyingPrice ?? "â€”"} | ratio ${r.ratio} | CCL ${cclStr}${src} | spread ${spreadStr} | ${r.status}${r.stale ? " (stale)" : ""}`;
    });

    const promedioStr = data.cclPromedio != null ? `CCL promedio: ${data.cclPromedio.toFixed(2)}` : "CCL promedio: â€”";
    const closedNote = data.isMarketClosed ? "\nMercado cerrado â€” Ãºltimo cierre." : "";
    const staleNote = data.status === "partial" ? "\n(Nota: datos parciales â€” algunos sÃ­mbolos no disponibles.)" : "";

    return {
      ok: true,
      message: `Radar CCL (${promedioStr}, total ${data.total}, pÃ¡gina ${data.page}, ${data.status}) â€” generado ${data.generatedAt}${closedNote}${staleNote}\n${lines.join("\n")}\n${DISCLAIMER}`,
    };
  },
};
