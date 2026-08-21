import { z } from "zod";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import {
  annualizedVolatility,
  correlation,
  dailyReturns,
  maxDrawdown,
  periodReturn,
  sharpe,
  ytdReturn,
} from "../../reports/metrics.js";
import { fetchYahooDaily } from "../../reports/reportBuilder.js";
import { addArtDays, artDateKeyFromUtc, artStartOfDay } from "../../reports/art-time.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_metrics — métricas de cartera (F3-A1, D11)
// Thin-wrapper parity a GET /api/portfolio/metrics.
// Calcula desde portfolio_snapshots: volatilidad anualizada,
// Sharpe (rf anual, default 0), max drawdown, retorno del
// período y YTD, más correlación vs Merval (^MERV) alineada
// por fecha (Yahoo nunca lanza → null sin romper).
// Propaga ctx.signal, never throws, capa output.
// ============================================================

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá YYYY-MM-DD");

function fmtPct(n: number | null): string {
  if (n == null) return "n/d";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(2)}%`;
}

function fmtPctRaw(n: number | null): string {
  if (n == null) return "n/d";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtNum(n: number | null, digits = 4): string {
  if (n == null) return "n/d";
  return n.toFixed(digits);
}

export const getMetricsTool: ToolDefinition = {
  name: "get_metrics",
  description:
    "Métricas cuantitativas del portafolio (F3-A1). Parity a GET /api/portfolio/metrics. Calcula desde portfolio_snapshots: volatilidad anualizada, Sharpe (rf anual default 0), max drawdown, retorno del período, YTD y correlación vs Merval (^MERV). Params opcionales: days (1-365 default 90) o rango from/to, rf (tasa libre riesgo anual).",
  inputSchema: z.object({
    days: z.coerce.number().int().min(1).max(365).optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    rf: z.coerce.number().optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { days?: number; from?: string; to?: string; rf?: number };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Métricas: down — timeout 15s" };
      }

      const days = Math.min(args.days ?? 90, 365);
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
          message: `Métricas ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}: sin snapshots en el rango (total 0) — no se pueden calcular métricas.`,
        };
      }
      if (total < 2) {
        return {
          ok: true,
          message: `Métricas ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}: solo ${total} snapshot — se necesitan al menos 2 para calcular métricas.`,
        };
      }

      const values = snapshots.map((s) => Number(s.totalValue));
      const points = snapshots.map((s) => ({
        date: artDateKeyFromUtc(s.capturedAt),
        value: Number(s.totalValue),
      }));
      const returns = dailyReturns(values);
      const rf = args.rf ?? 0;

      const volatility = annualizedVolatility(returns);
      const sharpeVal = sharpe(returns, { rf });
      const dd = maxDrawdown(values);
      const pr = periodReturn(values);
      const ytd = ytdReturn(points);

      // Benchmark Merval (^MERV) alineado por fecha a snapshots — misma lógica que route
      const merval = await fetchYahooDaily("^MERV");
      const alignedValues: number[] = [];
      const alignedMerval: number[] = [];
      for (const s of snapshots) {
        const key = artDateKeyFromUtc(s.capturedAt);
        let best: number | null = null;
        for (const p of merval) {
          if (p.date <= key) best = p.close;
          else break;
        }
        if (best == null) continue;
        alignedValues.push(Number(s.totalValue));
        alignedMerval.push(best);
      }
      const corr = correlation(alignedValues, alignedMerval);

      const lines = [
        `Métricas ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} (${total} snapshots, rf ${fmtNum(rf, 4)} anual):`,
        `- Volatilidad anualizada: ${fmtNum(volatility, 4)} (${fmtPctRaw(volatility * 100)})`,
        `- Sharpe (rf ${fmtNum(rf)}): ${fmtNum(sharpeVal)}`,
        `- Max drawdown: ${fmtPct(dd)} (-${fmtNum(dd * 100, 2)}%)`,
        `- Retorno período: ${fmtPct(pr)}`,
        `- YTD: ${ytd != null ? fmtPct(ytd) : "n/d (sin puntos del año en curso)"}`,
        `- Correlación vs Merval (^MERV): ${corr != null ? fmtNum(corr, 4) : "n/d (Yahoo sin datos o serie constante)"}`,
      ];

      return { ok: true, message: lines.join("\n") };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Métricas: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `Métricas: error — ${err instanceof Error ? err.message : "Error al calcular las métricas"}`,
      };
    }
  },
};
