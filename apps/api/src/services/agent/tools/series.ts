import { z } from "zod";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { addArtDays, artDateKeyFromUtc } from "../../reports/art-time.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_series — serie diaria + composición opcional
// Thin-wrapper parity a GET /api/portfolio/series.
// Lee portfolio_snapshots + snapshot_positions del rango.
// Propaga ctx.signal, never throws, capa output.
// ============================================================

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá YYYY-MM-DD");

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function fmtPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

const MAX_DAYS = 365;
const MAX_POSITIONS = 300;

export const getSeriesTool: ToolDefinition = {
  name: "get_series",
  description:
    "Serie diaria de valor del portafolio por rango (portfolio_snapshots). Parity a GET /api/portfolio/series. Requiere from YYYY-MM-DD, to opcional inclusivo, includePositions opcional para traer composición por activo. Devuelve hasta 365 días.",
  inputSchema: z.object({
    from: dateSchema,
    to: dateSchema.optional(),
    includePositions: z.boolean().optional().default(false),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { from: string; to?: string; includePositions?: boolean };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Serie: down — timeout 15s" };
      }

      const fromDate = new Date(`${args.from}T03:00:00Z`);
      const toDate = args.to ? new Date(`${args.to}T03:00:00Z`) : fromDate;
      const toExclusive = addArtDays(toDate, 1);

      const snapshots = await db
        .select()
        .from(schema.portfolioSnapshots)
        .where(
          and(
            eq(schema.portfolioSnapshots.accountId, ctx.account.id),
            gte(schema.portfolioSnapshots.capturedAt, fromDate),
            lt(schema.portfolioSnapshots.capturedAt, toExclusive)
          )
        )
        .orderBy(asc(schema.portfolioSnapshots.capturedAt));

      if (snapshots.length === 0) {
        return {
          ok: true,
          message: `Serie ${args.from} → ${args.to ?? args.from}: sin snapshots en el rango (total 0).`,
        };
      }

      const capped = snapshots.length > MAX_DAYS;
      const slice = capped ? snapshots.slice(0, MAX_DAYS) : snapshots;

      const dayLines = slice.map((s) => {
        const date = artDateKeyFromUtc(s.capturedAt);
        return `- ${date} | total ${fmtMoney(Number(s.totalValue))} (USD ${Number(s.totalValueUsd).toFixed(2)}) | cash ${fmtMoney(Number(s.cashArs))} ARS / ${Number(s.cashUsd).toFixed(2)} USD | pos ${fmtMoney(Number(s.positionsValue))} | día ${fmtPct(Number(s.dayChangePct))} | ${s.source}`;
      });

      let positionsBlock = "";
      if (args.includePositions && snapshots.length > 0) {
        const ids = slice.map((s) => s.id);
        const dateBySnapshot = new Map(slice.map((s) => [s.id, artDateKeyFromUtc(s.capturedAt)]));
        const rows = await db
          .select()
          .from(schema.snapshotPositions)
          .where(inArray(schema.snapshotPositions.snapshotId, ids))
          .orderBy(asc(schema.snapshotPositions.snapshotId));

        const totalPos = rows.length;
        if (totalPos === 0) {
          positionsBlock = "\nPosiciones: sin datos de composición en el rango.";
        } else {
          const cappedPos = totalPos > MAX_POSITIONS;
          const posSlice = cappedPos ? rows.slice(0, MAX_POSITIONS) : rows;
          const posLines = posSlice.map((p) => {
            const date = dateBySnapshot.get(p.snapshotId) ?? "?";
            const qty = Number(p.quantity);
            const lastPrice = p.lastPrice != null ? Number(p.lastPrice) : null;
            return `- ${date} | ${p.symbol} ${p.market} | ${qty} u. @ ${lastPrice != null ? fmtMoney(lastPrice) : "n/d"} | total ${fmtMoney(Number(p.totalValue))}`;
          });
          const posSuffix = cappedPos ? ` (mostrando ${posSlice.length} de ${totalPos})` : ` (total ${totalPos})`;
          positionsBlock = `\nPosiciones${posSuffix}:\n${posLines.join("\n")}`;
        }
      }

      const suffix = capped ? ` (mostrando ${slice.length} de ${snapshots.length})` : ` (total ${snapshots.length})`;
      return {
        ok: true,
        message: `Serie ${args.from} → ${args.to ?? args.from}${suffix}:\n${dayLines.join("\n")}${positionsBlock}`,
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Serie: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `Serie: error — ${err instanceof Error ? err.message : "Error al consultar la serie"}`,
      };
    }
  },
};
