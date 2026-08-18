import { z } from "zod";
import type { ToolDefinition } from "../types.js";

// ============================================================
// place_order — CONTRATO de trading (stub, NUNCA ejecuta)
//
// El trading real está FUERA DE ALCANCE (spec sección 5).
// Este tool existe como contrato con el LLM: permiso `exclude`
// + `proposeOnly` → el executor lo bloquea ANTES de llamar a
// execute (verifica en executor.ts, gate 2) y devuelve
// "no permitido" sin ningún efecto lateral.
//
// DISEÑO DEL FLUJO DE CONFIRMACIÓN HUMANA (NO implementado):
//   - tabla pending_orders (userId, symbol, side, qty, priceType,
//     status pending|approved|rejected, createdAt) + user_trading_limits
//   - lugar_order → inserta pending_order → evento de aprobación
//     en la UI (ask + needs_approval) → approve/reject por el usuario
//     → recién ahí la ejecución real contra IOL con los limits chequeados.
// ============================================================

export const placeOrderTool: ToolDefinition = {
  name: "place_order",
  description:
    "Ejecuta una orden de compra/venta en la cuenta IOL del usuario. CONTRATO: el trading real no está implementado todavía — pedir confirmación al usuario y avisarle que la ejecución de órdenes llega en una próxima versión.",
  inputSchema: z.object({
    symbol: z.string().min(1).max(10).toUpperCase(),
    side: z.enum(["buy", "sell"]),
    qty: z.number().positive("La cantidad debe ser mayor a cero"),
    priceType: z.enum(["market", "limit"]).default("market"),
    price: z.number().positive().optional(),
  }),
  permission: "exclude",
  proposeOnly: true,
  execute: async () => {
    return {
      ok: false,
      message:
        "place_order no está implementado: el trading está fuera de alcance en esta versión (solo contrato). La confirmación humana (pending_orders + approve/reject) está diseñada pero no implementada.",
    };
  },
};
