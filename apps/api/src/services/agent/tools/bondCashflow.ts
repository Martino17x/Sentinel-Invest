import { z } from "zod";
import { BONDS_ANALYTICS_ENABLED } from "../../../config.js";
import { DISCLAIMER, fetchCashflow } from "../../market/bonds/bondsQueries.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_bond_cashflow — Flujo proyectado de la cartera de bonos
//
// Thin-wrapper sobre fetchCashflow (bondsQueries.ts) que usa
// exclusivamente ctx.account.id (multitenant). No acepta
// accountId del LLM. Soporta filtrado opcional por symbol y
// ventana monthsAhead 1..12. Reusa ctx.signal (15s).
// Paridad con GET /bonds/cashflow + spec R4.
// ============================================================

export const getBondCashflowTool: ToolDefinition = {
  name: "get_bond_cashflow",
  description:
    "Flujo futuro de bonos de tu cartera: renta+amortización por mes (CashflowMonth). Usa tu cuenta (ctx.account.id) — no acepta accountId del LLM. Filtros opcionales: symbol y monthsAhead 1..12. Paridad con GET /bonds/cashflow.",
  inputSchema: z.object({
    symbol: z
      .string()
      .min(1, "Símbolo requerido")
      .max(12, "Símbolo muy largo")
      .regex(/^[A-Z0-9]{2,12}$/, "Símbolo inválido: usar 2-12 caracteres A-Z y 0-9 en mayúsculas")
      .transform((s) => s.toUpperCase())
      .optional(),
    monthsAhead: z.coerce.number().int().min(1).max(12).optional().default(12),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    if (!BONDS_ANALYTICS_ENABLED) {
      return { ok: false, message: "Renta fija no habilitada" };
    }

    const args = rawArgs as { symbol?: string; monthsAhead?: number };
    const symbolFilter = args.symbol ? args.symbol.toUpperCase().trim() : undefined;
    const monthsAhead = args.monthsAhead ?? 12;

    // Multitenant: cuenta del contexto, nunca del LLM
    const accountId = ctx.account.id;

    const months = await fetchCashflow(accountId, ctx.signal);

    // Aplicar monthsAhead si el servicio retornó 12 fijos: cortar por cutoff
    let filtered = months;
    if (monthsAhead < 12) {
      const from = new Date();
      const cutoff = new Date(from);
      cutoff.setUTCMonth(cutoff.getUTCMonth() + monthsAhead);
      const cutoffKey = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}`;
      filtered = months.filter((m) => m.month <= cutoffKey);
    }

    // Filtrar por símbolo si se pidió — R4 spec scenario symbol
    if (symbolFilter) {
      const bySymbol: typeof filtered = [];
      for (const m of filtered) {
        const itemsFiltered = m.items.filter((it) => it.symbol.toUpperCase() === symbolFilter);
        if (itemsFiltered.length === 0) continue;
        const totalArs = itemsFiltered.filter((i) => i.currency === "ARS").reduce((s, i) => s + i.renta + i.amort, 0);
        // For filtered view, recompute totals from filtered items
        const totalArsAll = itemsFiltered.reduce((s, i) => (i.currency === "ARS" ? s + i.renta + i.amort : s), 0);
        const totalUsdAll = itemsFiltered.reduce((s, i) => (i.currency === "USD" ? s + i.renta + i.amort : s), 0);
        bySymbol.push({
          ...m,
          items: itemsFiltered,
          totalArs: totalArsAll,
          totalUsd: totalUsdAll,
          label: m.label,
        });
      }
      filtered = bySymbol;
    }

    const generatedAt = new Date().toISOString();

    if (filtered.length === 0) {
      const symNote = symbolFilter ? ` ${symbolFilter}` : "";
      return {
        ok: true,
        message: `Cashflow${symNote} vacío — sin pagos futuros en próximos ${monthsAhead} meses (cuenta ${accountId.slice(0, 8)}…). Generado ${generatedAt}\n${DISCLAIMER}`,
      };
    }

    // Orden cronológico ya garantizado por projectCashflow (month ASC)
    const lines = filtered.map((m) => {
      const itemsStr = m.items.map((it) => `${it.symbol} renta ${it.renta.toFixed(2)}+amort ${it.amort.toFixed(2)} ${it.currency}`).join(", ");
      const totals: string[] = [];
      if (m.totalArs > 0) totals.push(`ARS ${m.totalArs.toFixed(2)}`);
      if (m.totalUsd > 0) totals.push(`USD ${m.totalUsd.toFixed(2)}`);
      const totalStr = totals.length ? ` | total ${totals.join(" + ")}` : "";
      return `- ${m.month} | ${m.label}${totalStr} | ${itemsStr}`;
    });

    const symNote = symbolFilter ? ` ${symbolFilter}` : "";
    return {
      ok: true,
      message: `Cashflow${symNote} (${filtered.length} meses, próximos ${monthsAhead} meses, cuenta ${accountId.slice(0, 8)}…) — generado ${generatedAt}\n${lines.join("\n")}\n${DISCLAIMER}`,
    };
  },
};
