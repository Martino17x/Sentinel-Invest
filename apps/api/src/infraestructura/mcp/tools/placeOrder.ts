import { z } from "zod";
import { getIolProvider } from "../../../services/iol/index.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";
import type { OrderRequest } from "../../../services/iol/types.js";
import { tradingGate, maybePendingChat } from "./tradingGates.js";
import { MarketCode, SettlementType } from "@sentinel/domain";

// ============================================================
// place_order â€” compra/venta contra IOL (gateada)
//
// El trading se activa SOLO cuando TODO esto se cumple:
//   1. El server corre con IOL_TRADING_ENABLED=true.
//   2. La llamada viene de una API key MCP con scope "trade"
//      (el scope read NO ve este tool: proposeOnly lo oculta).
//   3. En modo api, el usuario tiene credenciales IOL conectadas.
//
// Si algo falta, devuelve un error claro SIN efectos laterales.
// ============================================================

const IOL_MARKET_CODES: Record<string, MarketCode> = {
  bcba: MarketCode.BCBA,
  nyse: MarketCode.NYSE,
  nasdaq: MarketCode.NASDAQ,
  bonds: MarketCode.BONDS,
};

export const placeOrderTool: ToolDefinition = {
  name: "place_order",
  description:
    "Ejecuta una orden de compra/venta en la cuenta IOL del usuario (mercado local BCBA, NYSE, NASDAQ, bonos, o MEP con specie D). Requiere una API key MCP con scope trade y el server con IOL_TRADING_ENABLED=true. Para órdenes limit pasá price; para market se usa el último precio como referencia.",
  inputSchema: z.object({
    symbol: z.string().min(1).max(10).toUpperCase(),
    side: z.enum(["buy", "sell"]),
    qty: z.number().positive("La cantidad debe ser mayor a cero"),
    priceType: z.enum(["market", "limit"]).default("market"),
    price: z.number().positive("El precio debe ser mayor a cero").optional(),
    market: z.enum(["bcba", "nyse", "nasdaq", "bonds"]).default("bcba"),
    term: z.enum(["t0", "t1", "t2"]).optional(),
    specie: z.nativeEnum(SettlementType).optional().describe("Especie MEP (dólar): D opera en el mercado de especie D (solo bCBA)"),
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
      specie?: SettlementType;
    };

    // MEP (especie D) solo opera en el mercado local BCBA — SettlementType.D + MarketCode
    if (args.specie === SettlementType.D && args.market !== "bcba") {
      return {
        ok: false,
        message: "Las Ã³rdenes en especie D (MEP) solo operan en el mercado bcba.",
      };
    }

    // Gate D: precio
    if (args.priceType === "limit" && (args.price === undefined || args.price <= 0)) {
      return {
        ok: false,
        message: "Las Ã³rdenes limit requieren un precio por unidad (price).",
      };
    }

    const provider = getIolProvider();

    // Resolver precio de referencia para Ã³rdenes a mercado
    let price = args.price;
    if ((price === undefined || price <= 0) && args.priceType === "market") {
      const quote = await provider.getQuote(ctx.creds, args.symbol, args.market);
      if (quote.lastPrice <= 0) {
        return {
          ok: false,
          message: `No se pudo resolver un precio de referencia para ${args.symbol} (${args.market}). PasÃ¡ un price explÃ­cito.`,
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
      message: `${result.message ?? "Orden enviada"} â€” ${sideLabel} de ${args.qty} u. de ${args.symbol} @ ${price}. Estado: ${result.status} (operaciÃ³n ${result.iolOperationId}).`,
    };
  },
};
