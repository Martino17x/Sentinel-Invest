import { z } from "zod";
import { getIolProvider } from "../../iol/index.js";
import type { ToolDefinition } from "../types.js";
import { tradingGate, maybePendingChat } from "./tradingGates.js";

// ============================================================
// subscribe_fci / rescue_fci — fondos comunes de inversión
// Mismos gates que place_order (ver tradingGates.ts).
// ============================================================

export const subscribeFciTool: ToolDefinition = {
  name: "subscribe_fci",
  description:
    "Suscribe a un fondo común de inversión (FCI) en la cuenta IOL del usuario por un monto en pesos. Requiere API key MCP con scope trade y el server con IOL_TRADING_ENABLED=true.",
  inputSchema: z.object({
    symbol: z.string().min(1).max(20).toUpperCase().describe("Símbolo del FCI"),
    amount: z.number().positive("El monto debe ser mayor a cero").describe("Monto en pesos a invertir"),
  }),
  permission: "allow",
  proposeOnly: true,
  execute: async (ctx, rawArgs) => {
    const gate = tradingGate(ctx);
    if (gate) return gate;
    const args = rawArgs as { symbol: string; amount: number };
    const provider = getIolProvider();

    const pending = await maybePendingChat(ctx, "subscribe_fci", { symbol: args.symbol, amount: args.amount }, `SUSCRIBIR FCI ${args.symbol} por ${args.amount}`);
    if (pending.kind === "pending") return pending.result;

    const result = await provider.subscribeFci(ctx.creds, {
      symbol: args.symbol,
      amount: args.amount,
    });
    return {
      ok: true,
      message: `${result.message ?? "Suscripción enviada"} (operación ${result.iolOperationId}).`,
    };
  },
};

export const rescueFciTool: ToolDefinition = {
  name: "rescue_fci",
  description:
    "Rescata cuotapartes de un fondo común de inversión (FCI) en la cuenta IOL del usuario. Requiere API key MCP con scope trade y el server con IOL_TRADING_ENABLED=true.",
  inputSchema: z.object({
    symbol: z.string().min(1).max(20).toUpperCase().describe("Símbolo del FCI"),
    quantity: z.number().positive("La cantidad debe ser mayor a cero").describe("Cantidad de cuotapartes a rescatar"),
  }),
  permission: "allow",
  proposeOnly: true,
  execute: async (ctx, rawArgs) => {
    const gate = tradingGate(ctx);
    if (gate) return gate;
    const args = rawArgs as { symbol: string; quantity: number };
    const provider = getIolProvider();

    const pending = await maybePendingChat(ctx, "rescue_fci", { symbol: args.symbol, quantity: args.quantity }, `RESCATAR FCI ${args.symbol} (${args.quantity} cuotapartes)`);
    if (pending.kind === "pending") return pending.result;

    const result = await provider.rescueFci(ctx.creds, {
      symbol: args.symbol,
      quantity: args.quantity,
    });
    return {
      ok: true,
      message: `${result.message ?? "Rescate enviado"} (operación ${result.iolOperationId}).`,
    };
  },
};
