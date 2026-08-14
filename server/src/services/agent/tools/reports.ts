import { z } from "zod";
import { getIolProvider } from "../../iol/index.js";
import { buildMonthlyCloses, buildMonthlyReport } from "../../reports/reportBuilder.js";
import type { ToolDefinition } from "../types.js";
import { fmtArs, fmtPct } from "./format.js";

// ============================================================
// get_monthly_reports — reportes mensuales de la cuenta
//
// Reusa el reportBuilder existente (snapshots diarios):
// - sin `month` → comparativa de cierres mensuales.
// - con `month` ("YYYY-MM") → reporte mensual completo.
// Scoped a la cuenta del usuario (ctx.account).
// ============================================================

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Usá el formato YYYY-MM (ej: 2026-07)");

function formatCloses(closes: Awaited<ReturnType<typeof buildMonthlyCloses>>): string {
  const lines = closes.map(
    (c) =>
      `- ${c.month}: cierre ${fmtArs(c.closingValueArs)} | TWR ${fmtPct(c.twrPct)} | variación bruta ${fmtArs(c.grossChangeArs)}`
  );
  return `Cierres mensuales (${closes.length}):\n${lines.join("\n")}`;
}

function formatMonthlyReport(report: Awaited<ReturnType<typeof buildMonthlyReport>>): string {
  const bestDay = report.bestDay ? `${report.bestDay.date} (${fmtPct(report.bestDay.pct)})` : "—";
  const worstDay = report.worstDay ? `${report.worstDay.date} (${fmtPct(report.worstDay.pct)})` : "—";
  return [
    `Reporte mensual ${report.month}:`,
    `Cierre: ${fmtArs(report.closingValueArs)} | anterior ${fmtArs(report.previousClosingValueArs)}`,
    `Rendimiento: bruto ${fmtPct(report.grossChangePct)} | TWR ${fmtPct(report.twrPct)} | realizado ${fmtArs(report.realizedGainArs)} | no realizado ${fmtArs(report.unrealizedGainArs)}`,
    `Actividad: compras ${fmtArs(report.totalBuysArs)} | ventas ${fmtArs(report.totalSellsArs)} | aportes netos ${fmtArs(report.netContributionsArs)} | comisiones ${fmtArs(report.commissionsArs)}`,
    `Mejor día: ${bestDay} | Peor día: ${worstDay}`,
    `Benchmark Merval: ${fmtPct(report.benchmarkPct)} | FX: ${fmtPct(report.fxChangePct)}`,
  ].join("\n");
}

export const getMonthlyReportsTool: ToolDefinition = {
  name: "get_monthly_reports",
  description:
    "Reportes mensuales de la cuenta del usuario, generados desde los snapshots diarios de cartera. Sin `month` devuelve la comparativa de cierres mensuales; con `month` (formato YYYY-MM, ej: 2026-07) devuelve el reporte completo de ese mes: rendimiento, actividad, mejor/peor día y benchmark.",
  inputSchema: z.object({
    month: monthSchema.optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { month?: string };
    const provider = getIolProvider();

    if (!args.month) {
      const closes = await buildMonthlyCloses(ctx.account.id, ctx.creds, provider);
      if (closes.length === 0) {
        return {
          ok: false,
          message:
            "Todavía no hay cierres mensuales para esta cuenta: los reportes se generan a partir de los snapshots diarios de cartera (se crean al consultar el portfolio).",
        };
      }
      return { ok: true, message: formatCloses(closes) };
    }

    try {
      const report = await buildMonthlyReport(ctx.account.id, ctx.creds, provider, args.month);
      return { ok: true, message: formatMonthlyReport(report) };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : `No pude generar el reporte de ${args.month}`,
      };
    }
  },
};
