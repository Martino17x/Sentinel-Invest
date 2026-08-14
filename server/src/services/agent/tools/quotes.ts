import { z } from "zod";
import { getIolProvider } from "../../iol/index.js";
import type { ToolDefinition } from "../types.js";
import { fmtPct } from "./format.js";

// ============================================================
// get_quote + search_instruments — cotizaciones de mercado
//
// Misma validación que routes/quotes.ts (symbol ≤ 10 chars,
// market enum). El provider se resuelve con getIolProvider():
// en modo API entra por el wrapper con fallback a BYMADATA
// (QUOTE_PROVIDER=auto/iol) y en modo mock usa MockIolProvider.
// ============================================================

export const marketSchema = z.enum(["bcba", "nyse", "nasdaq", "bonds", "fci", "crypto"]);

export const assetTypeSchema = z.enum([
  "accion",
  "cedear",
  "bono",
  "on",
  "caucion",
  "fci",
  "futuro",
  "opcion",
  "moneda",
]);

export const getQuoteTool: ToolDefinition = {
  name: "get_quote",
  description:
    "Cotización puntual de un instrumento: último precio, variación diaria, moneda y nombre. Para consultar el precio actual de una acción, CEDEAR, bono o FCI (ej: GGAL, AAPL, AL30).",
  inputSchema: z.object({
    symbol: z.string().min(1).max(10, "Símbolo muy largo").toUpperCase(),
    market: marketSchema.default("bcba"),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { symbol: string; market: string };
    const provider = getIolProvider();
    const quote = await provider.getQuote(ctx.creds, args.symbol, args.market);
    const name = quote.name ? `${quote.name} (${quote.symbol})` : quote.symbol;
    const currency = quote.currency === "USD" ? "USD" : "ARS";
    return {
      ok: true,
      message: `Cotización ${name}: último precio ${currency} ${quote.lastPrice}, variación diaria ${fmtPct(
        quote.variationPct
      )}, actualizado ${quote.updatedAt}`,
    };
  },
};

export const searchInstrumentsTool: ToolDefinition = {
  name: "search_instruments",
  description:
    "Busca instrumentos por símbolo o nombre (ej: 'GGAL', 'Apple', 'bonos 2030') en el panel del mercado elegido. Devuelve hasta `limit` resultados con símbolo, nombre, último precio y variación.",
  inputSchema: z.object({
    q: z.string().min(1, "Escribí algo para buscar").max(60),
    market: marketSchema.default("bcba"),
    assetType: assetTypeSchema.default("accion"),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { q: string; market: string; assetType: string; limit: number };
    const provider = getIolProvider();
    const panel = await provider.getPanel(ctx.creds, args.market, args.assetType, 1, args.limit, args.q);

    // Filtro extra client-side: MockIolProvider no aplica `q` server-side
    const needle = args.q.toUpperCase();
    const hits = panel.quotes.filter(
      (p) => p.symbol.toUpperCase().includes(needle) || p.name.toUpperCase().includes(needle)
    );

    if (hits.length === 0) {
      return {
        ok: false,
        message: `No encontré instrumentos para "${args.q}" en ${args.market} (${args.assetType}). Probá con otro símbolo o mercado.`,
      };
    }

    const lines = hits.map(
      (p) => `- ${p.symbol} | ${p.name} | ${p.currency === "USD" ? "USD" : "ARS"} ${p.lastPrice} | ${fmtPct(p.variationPct)}`
    );
    return {
      ok: true,
      message: `Resultados para "${args.q}" (${args.market}/${args.assetType}):\n${lines.join("\n")}`,
    };
  },
};
