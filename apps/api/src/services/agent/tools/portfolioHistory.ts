import { z } from "zod";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { addArtDays, artStartOfDay } from "../../reports/art-time.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_portfolio_history — evolución REAL desde portfolio_snapshots
// Thin-wrapper parity a GET /api/portfolio/history.
// Lee portfolio_snapshots filtrado por cuenta + rango ART,
// nunca inventa datos (F1-R4). Propaga ctx.signal, never throws,
// capa output para no desbordar contexto.
// ============================================================

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá YYYY-MM-DD");

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

const MAX_POINTS = 365;

export const getPortfolioHistoryTool: ToolDefinition = {
  name: "get_portfolio_history",
  description:
    "Evolución histórica del valor del portafolio (portfolio_snapshots reales, nunca inventados). Parity a GET /api/portfolio/history. Params opcionales: days (1-365, default 90) o rango from/to YYYY-MM-DD. Devuelve hasta 365 puntos con total, cash y variación diaria.",
  inputSchema: z.object({
    days: z.coerce.number().int().min(1).max(365).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { days?: number; from?: string; to?: string };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Historial: down — timeout 15s" };
      }

      const days = Math.min(args.days ?? 90, 365);

      // Rango en días ART (PREREQ-1): mismo que route portfolio.ts
      const to = args.to ? new Date(`${args.to}T03:00:00Z`) : addArtDays(artStartOfDay(), 1);
      const from = args.from
        ? new Date(`${args.from}T03:00:00Z`)
        : addArtDays(artStartOfDay(), -(days - 1));

      const snapshots = await db
        .select()
        .from(schema.portfolioSnapshots)
        .where(
          and(
            eq(schema.portfolioSnapshots.accountId, ctx.account.id),
            gte(schema.portfolioSnapshots.capturedAt, from),
            lt(schema.portfolioSnapshots.capturedAt, to)
          )
        )
        .orderBy(asc(schema.portfolioSnapshots.capturedAt));

      const total = snapshots.length;
      if (total === 0) {
        return {
          ok: true,
          message: `Historial: sin snapshots en el rango solicitado (total 0). Los snapshots se generan al consultar el portfolio o vía cron diario.`,
        };
      }

      const capped = total > MAX_POINTS;
      const slice = capped ? snapshots.slice(0, MAX_POINTS) : snapshots;

      const lines = slice.map((s) => {
        const date = s.capturedAt.toISOString().slice(0, 10);
        const totalValue = Number(s.totalValue);
        const cashArs = Number(s.cashArs);
        const cashUsd = Number(s.cashUsd);
        const dayChangePct = Number(s.dayChangePct);
        const src = (s.source as string) ?? "real";
        return `- ${date} | total ${fmtMoney(totalValue)} | cash ${fmtMoney(cashArs)} ARS / USD ${cashUsd.toFixed(2)} | día ${fmtPct(dayChangePct)} | ${src}`;
      });

      const suffix = capped
        ? ` (mostrando ${slice.length} de ${total} — filtrá por from/to o days)`
        : ` (total ${total})`;
      return {
        ok: true,
        message: `Historial portafolio${suffix} — rango ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}:\n${lines.join("\n")}`,
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Historial: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `Historial: error — ${err instanceof Error ? err.message : "Error al consultar el historial"}`,
      };
    }
  },
};
