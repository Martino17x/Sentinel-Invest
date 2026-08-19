import { z } from "zod";
import { getAnalysisService } from "../../analysis/index.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// news — últimas noticias TradingView headlines (+ Yahoo fallback)
// Thin wrapper → analysisService.news → {ok,message} es-AR,
// usa ctx.signal, permission allow, top 5 items.
// ============================================================

const marketSchema = z.enum(["bcba", "nyse", "nasdaq"]);

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "hace instantes";
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `hace ${days} día${days !== 1 ? "s" : ""}`;
  } catch {
    return "";
  }
}

export const newsTool: ToolDefinition = {
  name: "news",
  description:
    "Últimas noticias de un instrumento (título, fuente, tiempo, link). Usalo cuando pregunten novedades o por qué se mueve un activo.",
  inputSchema: z.object({
    symbol: z.string().min(1, "Escribí un símbolo (ej: GGAL, AAPL)").max(10, "Símbolo muy largo").toUpperCase(),
    market: marketSchema.optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { symbol: string; market?: "bcba" | "nyse" | "nasdaq" };
    const svc = getAnalysisService();
    let res;
    try {
      res = await svc.news(args.symbol, { market: args.market, signal: ctx.signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { ok: false, message: `Noticias de ${args.symbol.toUpperCase()} no disponibles: ${msg}` };
    }

    if (res.status !== "ok" || !res.data) {
      const detail = res.error ?? "Fuente no responde";
      const src = res.source ? ` (fuente: ${res.source})` : "";
      if (res.status === "symbol_not_found" || detail.toLowerCase().includes("no encontrado")) {
        return { ok: false, message: `Noticias de ${args.symbol.toUpperCase()} no disponibles: Símbolo no encontrado${src}.` };
      }
      if (res.status === "rate_limited") {
        return { ok: false, message: `Noticias de ${args.symbol.toUpperCase()} no disponibles: Rate limit${src}.` };
      }
      return { ok: false, message: `Noticias de ${args.symbol.toUpperCase()} no disponibles: ${detail}${src}.` };
    }

    const items = res.data.items ?? [];
    if (items.length === 0) {
      return { ok: true, message: `Noticias de ${args.symbol.toUpperCase()}: Sin noticias recientes (fuente: ${res.source}, ${res.cached ? "cacheado" : "actualizado"}).` };
    }

    const cachedNote = res.cached ? "cacheado" : "actualizado";
    const top = items.slice(0, 5);
    const lines = top.map((it, idx) => {
      const ago = timeAgo(it.publishedAt);
      const src = it.source ? ` — ${it.source}` : "";
      const when = ago ? ` (${ago})` : "";
      const link = it.url ? ` ${it.url}` : "";
      return `${idx + 1}. ${it.title}${src}${when}${link}`;
    });

    return {
      ok: true,
      message: `Noticias de ${args.symbol.toUpperCase()} — fuente: ${res.source} (${cachedNote}):\n${lines.join("\n")}`,
    };
  },
};
