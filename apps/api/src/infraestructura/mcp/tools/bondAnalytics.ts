import { z } from "zod";
import { BONDS_ANALYTICS_ENABLED } from "../../../config.js";
import { DISCLAIMER, fetchBondAnalytics } from "../../../services/market/bonds/bondsQueries.js";
import { fmtPct } from "./format.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// get_bond_analytics â€” Analytics por sÃ­mbolo (TIR, duration, paridad)
// Thin-wrapper sobre fetchBondAnalytics (bondsQueries.ts) con
// validaciÃ³n Zod estricta y disclaimer/stale propagation.
// ============================================================

export const getBondAnalyticsTool: ToolDefinition = {
  name: "get_bond_analytics",
  description:
    "Analytics de un bono: TIR, duration, modified duration, paridad, precio dirty/clean, schedule y disclaimer. Requiere sÃ­mbolo 2-12 chars A-Z0-9.",
  inputSchema: z.object({
    symbol: z
      .string()
      .min(1, "SÃ­mbolo requerido")
      .max(12, "SÃ­mbolo muy largo")
      .regex(/^[A-Z0-9]{2,12}$/, "SÃ­mbolo invÃ¡lido: usar 2-12 caracteres A-Z y 0-9 en mayÃºsculas")
      .transform((s) => s.toUpperCase()),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    if (!BONDS_ANALYTICS_ENABLED) {
      return { ok: false, message: "Renta fija no habilitada" };
    }

    const args = rawArgs as { symbol: string };
    const symbol = args.symbol.toUpperCase().trim();

    const data = await fetchBondAnalytics(symbol, ctx.signal);

    const tirStr = data.tir != null ? fmtPct(data.tir * 100) : "â€”";
    const mdStr = data.md != null ? data.md.toFixed(3) : "â€”";
    const durStr = data.duration != null ? data.duration.toFixed(3) : "â€”";
    const paridadStr = data.paridad != null ? `${data.paridad.toFixed(2)}%` : "â€”";
    const priceStr = data.precio != null ? data.precio.toFixed(2) : "â€”";
    const staleNote = data.isRealtime === false ? "\n(Nota: datos stale â€” snapshot Ãºltimos 7d.)" : "";
    const vencStr = data.schedule?.vencimiento ?? "â€”";
    const moneda = data.schedule?.moneda ?? "â€”";

    return {
      ok: true,
      message: `Analytics ${data.symbol}: precio ${priceStr} (${moneda}), vencimiento ${vencStr}, TIR ${tirStr}, MD ${mdStr}, duration ${durStr}, paridad ${paridadStr}, isRealtime ${data.isRealtime}, source ${data.source}${staleNote}\n${data.disclaimer ?? DISCLAIMER}`,
    };
  },
};
