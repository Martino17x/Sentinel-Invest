import { z } from "zod";
import { BONDS_PANEL_ENABLED } from "../../../config.js";
import {
  DISCLAIMER,
  fetchBondPanel,
  inferSegment,
  sortRowsNullsLast,
  VALID_SEGMENTS,
} from "../../market/bonds/bondsQueries.js";
import { isMarketHours } from "../../market/isMarketHours.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_bond_panel — Panel completo de bonos
//
// Thin-wrapper sobre fetchBondPanel (bondsQueries.ts) con
// filtrado por segment, orden y paginación local.
// Paridad con GET /bonds/panel (spec R5).
// Reusa ctx.signal (15s AbortController).
// ============================================================

const segmentEnum = z.enum(VALID_SEGMENTS as unknown as [string, ...string[]]);

export const getBondPanelTool: ToolDefinition = {
  name: "get_bond_panel",
  description:
    "Panel de bonos: precio, TIR, paridad, duration y market data. Filtros opcionales segment, sort, order, page, pageSize. Paridad con GET /bonds/panel.",
  inputSchema: z.object({
    segment: segmentEnum.optional(),
    sort: z.enum(["tir", "md", "duration", "paridad", "precio", "vencimiento", "volumeEfectivo"]).default("tir"),
    order: z.enum(["desc", "asc"]).default("desc"),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    if (!BONDS_PANEL_ENABLED) {
      return { ok: false, message: "Renta fija no habilitada" };
    }

    const args = rawArgs as {
      segment?: string;
      sort: "tir" | "md" | "duration" | "paridad" | "precio" | "vencimiento" | "volumeEfectivo";
      order: "desc" | "asc";
      page: number;
      pageSize: number;
    };

    const segment = args.segment;
    const sort = args.sort ?? "tir";
    const order = args.order ?? "desc";
    const page = args.page ?? 1;
    const pageSize = args.pageSize ?? 25;

    if (segment && !VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
      return { ok: false, message: `Segmento inválido: ${segment}. Válidos: ${VALID_SEGMENTS.join(", ")}` };
    }

    const { rows: fullRows, generatedAt } = await fetchBondPanel(ctx.signal);

    let rows = fullRows;

    if (segment) {
      rows = rows.filter((r) => inferSegment(r as unknown as import("../../market/bonds/types.js").BondAnalytics) === segment);
    }

    rows = sortRowsNullsLast(rows, sort, order as "asc" | "desc");

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paginated = rows.slice(start, start + pageSize);

    const isClosed = !isMarketHours(new Date());
    const closedNote = isClosed ? "\nMercado cerrado — último cierre." : "";

    if (paginated.length === 0) {
      return {
        ok: true,
        message: `Panel bonos vacío (total ${total}, página ${page}/${totalPages}, sort ${sort} ${order}${segment ? `, segment ${segment}` : ""}) — generado ${generatedAt}${closedNote}\n${DISCLAIMER}`,
      };
    }

    const lines = paginated.map((r) => {
      const tirStr = r.tir != null ? `${(r.tir * 100).toFixed(2)}%` : "—";
      const mdStr = r.md != null ? r.md.toFixed(3) : "—";
      const paridadStr = r.paridad != null ? `${r.paridad.toFixed(2)}%` : (r.cuadroTecnico?.paridad != null ? `${r.cuadroTecnico.paridad.toFixed(2)}%` : "—");
      const precioStr = r.precio != null ? r.precio.toFixed(2) : "—";
      const venc = r.vencimiento ?? r.schedule?.vencimiento ?? "—";
      const moneda = r.moneda ?? r.schedule?.moneda ?? "—";
      return `- ${r.symbol} | ${moneda} | venc ${venc} | precio ${precioStr} | TIR ${tirStr} | MD ${mdStr} | paridad ${paridadStr} | ${r.source}${r.isRealtime === false ? " (stale)" : ""}`;
    });

    return {
      ok: true,
      message: `Panel bonos (${total} total, página ${page}/${totalPages}, sort ${sort} ${order}${segment ? `, segment ${segment}` : ""}) — generado ${generatedAt}${closedNote}\n${lines.join("\n")}\n${DISCLAIMER}`,
    };
  },
};
