import { z } from "zod";
import { getIolProvider } from "../../iol/index.js";
import type { ToolDefinition } from "../types.js";
import type { OrderRequest } from "../../iol/types.js";
import { tradingGate, maybePendingChat } from "./tradingGates.js";

// ============================================================
// place_order — compra/venta contra IOL (gateada)
//
// El trading se activa SOLO cuando TODO esto se cumple:
//   1. El server corre con IOL_TRADING_ENABLED=true.
//   2. La llamada viene de una API key MCP con scope "trade"
//      (el scope read NO ve este tool: proposeOnly lo oculta).
//   3. En modo api, el usuario tiene credenciales IOL conectadas.
//
// Si algo falta, devuelve un error claro SIN efectos laterales.
// ============================================================

const IOL_MARKET_CODES: Record<string, string> = {
  bcba: "bCBA",
  nyse: "nYSE",
  nasdaq: "nASDAQ",
  bonds: "bCBA",
};

export const placeOrderTool: ToolDefinition = {
  name: "place_order",
  description:
    "Ejecuta una orden de compra/venta en la cuenta IOL del usuario (mercado local bCBA, NYSE, NASDAQ, bonos, o MEP con specie=\"D\"). Requiere una API key MCP con scope trade y el server con IOL_TRADING_ENABLED=true. Para órdenes limit pasá price; para market se usa el último precio como referencia.",
  inputSchema: z.object({
    symbol: z.string().min(1).max(10).toUpperCase(),
    side: z.enum(["buy", "sell"]),
    qty: z.number().positive("La cantidad debe ser mayor a cero"),
    priceType: z.enum(["market", "limit"]).default("market"),
    price: z.number().positive("El precio debe ser mayor a cero").optional(),
    market: z.enum(["bcba", "nyse", "nasdaq", "bonds"]).default("bcba"),
    term: z.enum(["t0", "t1", "t2"]).optional(),
    specie: z.enum(["D"]).optional().describe("Especie MEP (dólar): D opera en el mercado de especie D (solo bCBA)"),
  }),
  permission: "allow",
  proposeOnly: true, // scope read no lo ve; trade lo lista (isTradeTool)
  execute: async (ctx, rawArgs) => {
    const gate = tradingGate(ctx);
    if (gate) return gate;

    const args = rawArgs as {
      symbol: string;
      side: "buy" | "sell";
      qty: number;
      priceType: "market" | "limit";
      price?: number;
      market: "bcba" | "nyse" | "nasdaq" | "bonds";
      term?: "t0" | "t1" | "t2";
      specie?: "D";
    };

    // MEP (especie D) solo opera en el mercado local bCBA
    if (args.specie === "D" && args.market !== "bcba") {
      return {
        ok: false,
        message: "Las órdenes en especie D (MEP) solo operan en el mercado bcba.",
      };
    }

    // Gate D: precio
    if (args.priceType === "limit" && (args.price === undefined || args.price <= 0)) {
      return {
        ok: false,
        message: "Las órdenes limit requieren un precio por unidad (price).",
      };
    }

    const provider = getIolProvider();

    // Resolver precio de referencia para órdenes a mercado
    let price = args.price;
    if ((price === undefined || price <= 0) && args.priceType === "market") {
      const quote = await provider.getQuote(ctx.creds, args.symbol, args.market);
      if (quote.lastPrice <= 0) {
        return {
          ok: false,
          message: `No se pudo resolver un precio de referencia para ${args.symbol} (${args.market}). Pasá un price explícito.`,
        };
      }
      price = quote.lastPrice;
    }

    const order: OrderRequest = {
      side: args.side,
      symbol: args.symbol,
      market: IOL_MARKET_CODES[args.market],
      quantity: args.qty,
      priceType: args.priceType,
      price,
      term: args.term,
      specie: args.specie,
    };

    // En scope chat la orden se prepara como pending (no ejecuta)
    const sideLabel = args.side === "buy" ? "compra" : "venta";
    const summary = `${sideLabel.toUpperCase()} ${args.qty} ${args.symbol} @ ${price} (${args.market}${args.specie ? " MEP" : ""})`;
    const pending = await maybePendingChat(ctx, "place_order", { ...args, price }, summary);
    if (pending.kind === "pending") return pending.result;

    const result = await provider.placeOrder(ctx.creds, ctx.account.iolAccountNumber, order);
    return {
      ok: true,
      message: `${result.message ?? "Orden enviada"} — ${sideLabel} de ${args.qty} u. de ${args.symbol} @ ${price}. Estado: ${result.status} (operación ${result.iolOperationId}).`,
    };
  },
};
