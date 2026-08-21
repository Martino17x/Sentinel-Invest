import { z } from "zod";
import { BONDS_ANALYTICS_ENABLED } from "../../../config.js";
import { DISCLAIMER, fetchCurvePoints } from "../../market/bonds/bondsQueries.js";
import { VALID_SEGMENTS } from "../../market/bonds/curve.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_bond_curve — Curva soberana por segmento o moneda
//
// Thin-wrapper sobre fetchCurvePoints (bondsQueries.ts) + MAE.
// Soporta segment (VALID_SEGMENTS) y currency (ARS|USD) para
// parity con spec R3. Reusa ctx.signal (15s).
// ============================================================

const segmentEnum = z.enum(VALID_SEGMENTS as unknown as [string, ...string[]]);

export const getBondCurveTool: ToolDefinition = {
  name: "get_bond_curve",
  description:
    "Curva soberana: puntos {ticker, tir, md, vencimiento, segmento} ordenados por vencimiento. Filtrá por segment (USD-hard-dollar, BOPREAL, LECAP/BONCAP, CER) o currency (ARS, USD).",
  inputSchema: z.object({
    segment: segmentEnum.optional(),
    currency: z.enum(["ARS", "USD"]).optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    if (!BONDS_ANALYTICS_ENABLED) {
      return { ok: false, message: "Renta fija no habilitada" };
    }

    const args = rawArgs as { segment?: string; currency?: "ARS" | "USD" };

    // Resolver segmento: prioridad segment explícito > currency map > default
    let segment: string | undefined = args.segment;
    if (!segment && args.currency) {
      segment = args.currency === "USD" ? "USD-hard-dollar" : "CER";
    }
    // Si no se pasó nada, default USD-hard-dollar (más usado)
    segment = segment ?? "USD-hard-dollar";

    if (!VALID_SEGMENTS.includes(segment as (typeof VALID_SEGMENTS)[number])) {
      return { ok: false, message: `Segmento inválido: ${segment}. Válidos: ${VALID_SEGMENTS.join(", ")}` };
    }

    const points = await fetchCurvePoints(segment, ctx.signal);

    // Spec R3: ordered by vencimiento ascending
    const sorted = [...points].sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));

    const generatedAt = new Date().toISOString();

    if (sorted.length === 0) {
      return {
        ok: true,
        message: `Curva ${segment} vacía — sin puntos disponibles. Generado ${generatedAt}\n${DISCLAIMER}`,
      };
    }

    const lines = sorted.map(
      (p) => `- ${p.ticker} | venc ${p.vencimiento} | TIR ${(p.tir * 100).toFixed(2)}% | MD ${p.md.toFixed(3)} | ${p.segmento}`,
    );

    return {
      ok: true,
      message: `Curva ${segment} (${sorted.length} puntos) — generado ${generatedAt}\n${lines.join("\n")}\n${DISCLAIMER}`,
    };
  },
};
