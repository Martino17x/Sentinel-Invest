import { z } from "zod";
import { getDollarRates } from "../../rates.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_dollar_rates — cotizaciones del dólar (dolarapi.com)
//
// Comparte la cache de 60s con la ruta HTTP /api/rates:
// si la ruta consultó hace menos de un minuto, el tool sirve
// el MISMO valor cacheado (1 llamada upstream por minuto).
// ============================================================

export const getDollarRatesTool: ToolDefinition = {
  name: "get_dollar_rates",
  description:
    "Cotizaciones actuales del dólar en Argentina: oficial, blue, bolsa (CCL), contado con liqui, mayorista, cripto y tarjeta (compra/venta). Sin argumentos.",
  inputSchema: z.object({}),
  permission: "allow",
  execute: async (ctx) => {
    const rates = await getDollarRates(ctx.signal);
    if (rates.dolares.length === 0) {
      return { ok: false, message: "No hay cotizaciones de dólar disponibles en este momento." };
    }

    const lines = rates.dolares.map(
      (d) => `- ${d.nombre}: compra ${d.compra}, venta ${d.venta}`
    );
    const staleNote = rates.stale ? "\n(Nota: datos del último minuto disponible, el proveedor no respondió.)" : "";

    return {
      ok: true,
      message: `Cotizaciones del dólar (${rates.cached ? "cache" : "actualizado"}):\n${lines.join("\n")}${staleNote}`,
    };
  },
};
