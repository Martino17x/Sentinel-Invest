/**
 * Gate único de trading — fuente canónica (SDD8).
 * Centraliza IOL_TRADING_ENABLED y el bypass IOL_PROVIDER=mock.
 * Reemplaza el duplicado infra/mcp/tools/tradingGates.ts + check inline
 * en interfaces/http/routes/orders.ts (refactor en commit 3).
 *
 * No importa infraestructura/interfaces — capa aplicación pura.
 */
import type { IolCredentials } from "../../services/iol/types.js";
import type { ToolContext, ToolResult } from "../agente/types.js";
import { createPendingOrder } from "../agente/pendingOrders.js";

/**
 * Kill-switch de trading. Solo "true" | "1" habilita.
 * Lee env en cada call para respetar cambios en tests.
 */
export function isTradingEnabled(): boolean {
  const v = (process.env.IOL_TRADING_ENABLED ?? "").toLowerCase();
  return v === "true" || v === "1";
}

/**
 * Gate HTTP — devuelve null si se puede operar o el error 403.
 * Usado por OrdersService.placeOrder / routes delegadas.
 */
export function tradingGate(): { ok: true } | { ok: false; code: 403; message: string } {
  if (!isTradingEnabled()) {
    return {
      ok: false,
      code: 403,
      message: "El trading está deshabilitado en este server (IOL_TRADING_ENABLED=true).",
    };
  }
  return { ok: true };
}

/**
 * Gate de credenciales — solo exige creds en modo api.
 * En mock las ignora (tests/CI).
 */
export function requireCreds(
  creds: IolCredentials,
): { ok: true } | { ok: false; code: 403; message: string } {
  const isApiMode = (process.env.IOL_PROVIDER ?? "mock") === "api";
  if (isApiMode && (!creds.username || !creds.password)) {
    return {
      ok: false,
      code: 403,
      message: "No hay credenciales IOL conectadas. Conectá tu cuenta IOL primero.",
    };
  }
  return { ok: true };
}

/**
 * Gate MCP/Tool — devuelve null si se puede operar o ToolResult de error.
 * Mantiene compatibilidad con infra/mcp/tools/* que esperan ToolResult.
 */
export function tradingGateTool(ctx: ToolContext): ToolResult | null {
  const gate = tradingGate();
  if (!gate.ok) {
    return { ok: false, message: gate.message };
  }
  if (ctx.scope !== "trade" && ctx.scope !== "chat") {
    return {
      ok: false,
      message: "Este tool solo está disponible vía MCP con scope trade o el chat de Sentinel.",
    };
  }
  const credsGate = requireCreds(ctx.creds);
  if (!credsGate.ok) {
    return { ok: false, message: credsGate.message };
  }
  return null;
}

/**
 * En scope "chat" la orden NO se ejecuta: se guarda como pending_orders.
 * En scope "trade" (MCP) devuelve { kind: "execute" }.
 * Re-exportado desde aquí para unificar la fuente.
 */
export async function maybePendingChat(
  ctx: ToolContext,
  toolName: string,
  args: Record<string, unknown>,
  summary: string,
): Promise<{ kind: "execute" } | { kind: "pending"; result: ToolResult }> {
  if (ctx.scope !== "chat") return { kind: "execute" };
  const { id } = await createPendingOrder({ userId: ctx.userId, tool: toolName, args, summary });
  return {
    kind: "pending",
    result: {
      ok: true,
      message: `Orden preparada: ${summary}. Esperando tu confirmación.`,
      pendingApproval: { id, summary },
    },
  };
}
