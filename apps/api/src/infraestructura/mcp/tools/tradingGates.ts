import type { ToolContext, ToolResult } from "../../../aplicacion/agente/types.js";
import { createPendingOrder } from "../../../aplicacion/agente/pendingOrders.js";

// ============================================================
// Gates compartidos de trading (place_order, cancel_order,
// subscribe_fci, rescue_fci).
//
// Devuelven null si TODO se cumple (se puede operar) o un
// ToolResult de error claro SIN efectos laterales.
//
// Scopes permitidos:
//   - "trade" (MCP) â†’ ejecuta directo
//   - "chat" (agente de Sentinel) â†’ prepara la orden como
//     pending_orders y espera confirmaciÃ³n (maybePendingChat)
//   - "read" â†’ siempre bloqueado (los tools no se exponen ahÃ­)
// ============================================================

export function isTradingEnabled(): boolean {
  const v = (process.env.IOL_TRADING_ENABLED ?? "").toLowerCase();
  return v === "true" || v === "1";
}

export function tradingGate(ctx: ToolContext): ToolResult | null {
  // Gate A: el trading se habilita explÃ­citamente en el server
  if (!isTradingEnabled()) {
    return {
      ok: false,
      message:
        "El trading real estÃ¡ deshabilitado en este server. Para habilitarlo configurÃ¡ IOL_TRADING_ENABLED=true (solo en producciÃ³n con IOL_PROVIDER=api).",
    };
  }

  // Gate B: scope trade (MCP) o chat (con confirmaciÃ³n); read â†’ bloqueado
  if (ctx.scope !== "trade" && ctx.scope !== "chat") {
    return {
      ok: false,
      message: "Este tool solo estÃ¡ disponible vÃ­a MCP con scope trade o el chat de Sentinel.",
    };
  }

  // Gate C: credenciales reales (solo en modo api; el mock las ignora)
  const isApiMode = (process.env.IOL_PROVIDER ?? "mock") === "api";
  if (isApiMode && (!ctx.creds.username || !ctx.creds.password)) {
    return {
      ok: false,
      message: "No hay credenciales IOL conectadas para tu usuario. ConectÃ¡ tu cuenta IOL primero.",
    };
  }

  return null;
}

/**
 * En scope "chat" la orden NO se ejecuta: se guarda como pending_orders y se
 * devuelve un ToolResult con pendingApproval para que la UI pida confirmaciÃ³n.
 * En scope "trade" (MCP) devuelve { kind: "execute" } â†’ el tool ejecuta.
 */
export async function maybePendingChat(
  ctx: ToolContext,
  toolName: string,
  args: Record<string, unknown>,
  summary: string
): Promise<{ kind: "execute" } | { kind: "pending"; result: ToolResult }> {
  if (ctx.scope !== "chat") return { kind: "execute" };
  const { id } = await createPendingOrder({ userId: ctx.userId, tool: toolName, args, summary });
  return {
    kind: "pending",
    result: {
      ok: true,
      message: `Orden preparada: ${summary}. Esperando tu confirmaciÃ³n.`,
      pendingApproval: { id, summary },
    },
  };
}
