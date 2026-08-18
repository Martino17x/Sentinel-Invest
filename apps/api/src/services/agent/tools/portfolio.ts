import { z } from "zod";
import { getIolProvider } from "../../iol/index.js";
import type { PortfolioSummary } from "../../iol/types.js";
import type { ToolDefinition } from "../types.js";
import { fmtArs, fmtPct, fmtQty, fmtUsd } from "./format.js";

// ============================================================
// get_portfolio — resumen completo de la cartera del usuario
//
// El contexto ya trae la cuenta resuelta por el executor
// (gate multitenant: SOLO los datos del usuario autenticado).
// Formato texto plano, compacto, listo para el contexto LLM.
// ============================================================

function formatPortfolio(p: PortfolioSummary): string {
  const lines: string[] = [];

  lines.push(`Cuenta: ${p.accountNumber}`);
  lines.push(`Total: ${fmtArs(p.totalArs)} | ${fmtUsd(p.totalUsd)}`);
  lines.push(`Efectivo disponible: ${fmtArs(p.cashArs)} ARS | ${fmtUsd(p.cashUsd)} USD`);
  lines.push(`Valor de posiciones: ${fmtArs(p.positionsValueArs)} ARS | ${fmtUsd(p.positionsValueUsd)} USD`);
  lines.push(`Ganancia/pérdida total: ${fmtArs(p.gainLossArs)} (${fmtPct(p.dayChangePct)} el día)`);

  if (p.positions.length === 0) {
    lines.push("Posiciones: (vacío — no hay activos en cartera)");
  } else {
    lines.push(`Posiciones (${p.positions.length}):`);
    for (const pos of p.positions) {
      const detail = pos.assetType === "fci" ? "FCI" : pos.market;
      lines.push(
        `- ${pos.symbol} (${detail}): ${fmtQty(pos.quantity)} u. @ ${fmtArs(pos.lastPrice)} | valor ${fmtArs(pos.totalValue)} | PPC ${fmtArs(pos.avgPrice)} | ${fmtPct(pos.gainLossPct)}`
      );
    }
  }

  if (p.distribution.length > 0) {
    lines.push("Distribución: " + p.distribution.map((d) => `${d.label} ${d.pct.toFixed(1)}%`).join(", "));
  }

  return lines.join("\n");
}

export const getPortfolioTool: ToolDefinition = {
  name: "get_portfolio",
  description:
    "Resumen completo de la cartera del usuario autenticado: totales ARS/USD, efectivo disponible, posiciones con cantidad, precio, valor y rendimiento, y distribución por activo. Sin argumentos.",
  inputSchema: z.object({}),
  permission: "allow",
  execute: async (ctx) => {
    const provider = getIolProvider();
    const portfolio = await provider.getPortfolio(ctx.creds, ctx.account.iolAccountNumber);
    return { ok: true, message: formatPortfolio(portfolio) };
  },
};
