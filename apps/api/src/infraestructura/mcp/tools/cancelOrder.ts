import { z } from "zod";
import { getIolProvider } from "../../../services/iol/index.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";
import { tradingGate, maybePendingChat } from "./tradingGates.js";

// ============================================================
// cancel_order â€” cancela una operaciÃ³n pendiente en IOL
// Mismos gates que place_order (ver tradingGates.ts).
// ============================================================

export const cancelOrderTool: ToolDefinition = {
  name: "cancel_order",
  description:
    "Cancela una operaciÃ³n pendiente en la cuenta IOL del usuario. Requiere API key MCP con scope trade y el server con IOL_TRADING_ENABLED=true.",
  inputSchema: z.object({
    operationNumber: z.union([z.number().int().positive(), z.string().min(1)]).describe("NÃºmero de operaciÃ³n a cancelar"),
  }),
  permission: "allow",
  proposeOnly: true,
  execute: async (ctx, rawArgs) => {
    const gate = tradingGate(ctx);
    if (gate) return gate;
    const args = rawArgs as { operationNumber: number | string };
    const provider = getIolProvider();
    const operationNumber = String(args.operationNumber);

    const pending = await maybePendingChat(ctx, "cancel_order", { operationNumber }, `CANCELAR operaciÃ³n ${operationNumber}`);
    if (pending.kind === "pending") return pending.result;

    const result = await provider.cancelOperation(ctx.creds, operationNumber);
    return {
      ok: true,
      message: `${result.message ?? "OperaciÃ³n cancelada"} (operaciÃ³n ${result.iolOperationId}).`,
    };
  },
};
