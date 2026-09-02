import { z } from "zod";
import { getDollarRates } from "../../../services/rates.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// get_dollar_rates â€” cotizaciones del dÃ³lar (dolarapi.com)
//
// Comparte la cache de 60s con la ruta HTTP /api/rates:
// si la ruta consultÃ³ hace menos de un minuto, el tool sirve
// el MISMO valor cacheado (1 llamada upstream por minuto).
// ============================================================

export const getDollarRatesTool: ToolDefinition = {
  name: "get_dollar_rates",
  description:
    "Cotizaciones actuales del dÃ³lar en Argentina: oficial, blue, bolsa (CCL), contado con liqui, mayorista, cripto y tarjeta (compra/venta). Sin argumentos.",
  inputSchema: z.object({}),
  permission: "allow",
  execute: async (ctx) => {
    const rates = await getDollarRates(ctx.signal);
    if (rates.dolares.length === 0) {
      return { ok: false, message: "No hay cotizaciones de dÃ³lar disponibles en este momento." };
    }

    const lines = rates.dolares.map(
      (d) => `- ${d.nombre}: compra ${d.compra}, venta ${d.venta}`
    );
    const staleNote = rates.stale ? "\n(Nota: datos del Ãºltimo minuto disponible, el proveedor no respondiÃ³.)" : "";

    return {
      ok: true,
      message: `Cotizaciones del dÃ³lar (${rates.cached ? "cache" : "actualizado"}):\n${lines.join("\n")}${staleNote}`,
    };
  },
};
