import { z } from "zod";
import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { buildMonthCalendar } from "../../../aplicacion/portafolio/reportBuilder.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// get_calendar â€” calendario mensual de valores (F2)
// Thin-wrapper parity a GET /api/portfolio/calendar/:month.
// Deriva de portfolio_snapshots: todos los dÃ­as del mes,
// con snapshot poblado o null â€” nunca inventa datos.
// MatemÃ¡tica pura buildMonthCalendar (testeada sin BD).
// ============================================================

function fmtMoney(n: number | null): string {
  if (n == null) return "n/d";
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return "n/d";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Formato de mes invÃ¡lido. UsÃ¡ YYYY-MM (ej: 2026-07)")
  .refine((m) => {
    const mon = Number(m.split("-")[1]);
    return mon >= 1 && mon <= 12;
  }, "Mes invÃ¡lido (debe ser 01-12)");

export const getCalendarTool: ToolDefinition = {
  name: "get_calendar",
  description:
    "Calendario mensual de valores del portafolio (F2). Parity a GET /api/portfolio/calendar/:month. Param month YYYY-MM. Devuelve todos los dÃ­as del mes con valor, variaciÃ³n diaria y conteo de movimientos â€” dÃ­as sin snapshot en null, nunca inventa datos.",
  inputSchema: z.object({
    month: monthSchema,
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { month: string };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Calendario: down â€” timeout 15s" };
      }

      const month = args.month;
      const [year, mon] = month.split("-").map(Number);
      const nextMonth = new Date(Date.UTC(year, mon - 1, 1));
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const nextMonthKey = nextMonth.toISOString().slice(0, 7);

      const snapshots = await db
        .select()
        .from(schema.portfolioSnapshots)
        .where(
          and(
            eq(schema.portfolioSnapshots.accountId, ctx.account.id),
            gte(schema.portfolioSnapshots.capturedAt, new Date(`${month}-01T03:00:00Z`)),
            lt(schema.portfolioSnapshots.capturedAt, new Date(`${nextMonthKey}-01T03:00:00Z`))
          )
        )
        .orderBy(asc(schema.portfolioSnapshots.capturedAt));

      const movementRows = await db
        .select({
          dateKey: sql<string>`to_char(${schema.cashMovements.date}, 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(schema.cashMovements)
        .where(
          and(
            eq(schema.cashMovements.accountId, ctx.account.id),
            gte(sql`${schema.cashMovements.date}::text`, `${month}-01`),
            lt(sql`${schema.cashMovements.date}::text`, `${nextMonthKey}-01`)
          )
        )
        .groupBy(schema.cashMovements.date);

      const movementCountByDate = new Map(movementRows.map((r) => [r.dateKey, Number(r.count)]));

      const calendar = buildMonthCalendar(month, snapshots as never, movementCountByDate);

      const headerLines: string[] = [];
      headerLines.push(`Calendario ${calendar.month}: ${calendar.days.length} dÃ­as | retorno mes ${fmtPct(calendar.monthReturn)}`);
      if (calendar.bestDay) headerLines.push(`Mejor dÃ­a: ${calendar.bestDay.date} (${fmtPct(calendar.bestDay.pct)})`);
      if (calendar.worstDay) headerLines.push(`Peor dÃ­a: ${calendar.worstDay.date} (${fmtPct(calendar.worstDay.pct)})`);

      const dayLines = calendar.days.map((d) => {
        const hasValue = d.totalValue != null;
        const valStr = fmtMoney(d.totalValue);
        const pctStr = fmtPct(d.dayChangePct);
        const movStr = d.movementCount > 0 ? ` | movs ${d.movementCount}` : "";
        const srcStr = d.source ? ` ${d.source}` : "";
        if (!hasValue) return `- ${d.date} | sin datos${movStr}`;
        return `- ${d.date} | ${valStr} | dÃ­a ${pctStr} | cash ${fmtMoney(d.cashArs)} ARS / ${d.cashUsd != null ? d.cashUsd.toFixed(2) : "n/d"} USD${movStr}${srcStr}`;
      });

      return {
        ok: true,
        message: `${headerLines.join(" | ")}\n${dayLines.join("\n")}`,
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Calendario: down â€” timeout 15s" };
      }
      return {
        ok: false,
        message: `Calendario: error â€” ${err instanceof Error ? err.message : "Error al consultar el calendario"}`,
      };
    }
  },
};
