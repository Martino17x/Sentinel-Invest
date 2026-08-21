import { z } from "zod";
import { getAnalysisService } from "../../analysis/index.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_news_feed — feed GLOBAL de noticias sin símbolo
// Thin-wrapper parity a GET /api/analysis/news/feed?limit.
// Llama directo a AnalysisService.newsFeed (GNews → Finnhub → TV),
// no fetch a propia API. Propaga ctx.signal, never throws,
// capa output (max 20, cap 10 líneas para contexto LLM).
// ============================================================

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

export const getNewsFeedTool: ToolDefinition = {
  name: "get_news_feed",
  description:
    "Feed global de noticias financieras (sin símbolo). Parity a GET /api/analysis/news/feed. Cascade GNews → Finnhub → TradingView. Param limit 1-20 default 5. Usalo para panorama de mercado sin ticker específico.",
  inputSchema: z.object({
    limit: z.coerce.number().int().min(1).max(20).optional().default(5),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { limit?: number };
    const limit = Math.min(Math.max(args.limit ?? 5, 1), 20);
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "News feed: down — timeout 15s" };
      }

      const svc = getAnalysisService();
      const items = await svc.newsFeed(limit, { signal: ctx.signal });

      if (!items || items.length === 0) {
        return { ok: true, message: `News feed (limit ${limit}): sin noticias recientes — fuentes no devolvieron resultados.` };
      }

      const capped = items.length > limit;
      const slice = capped ? items.slice(0, limit) : items;
      const lines = slice.map((it, idx) => {
        const ago = timeAgo(it.publishedAt);
        const src = it.source ? ` — ${it.source}` : "";
        const when = ago ? ` (${ago})` : "";
        const prov = it.provider ? ` [${it.provider}]` : "";
        const link = it.url ? ` ${it.url}` : "";
        return `${idx + 1}. ${it.title}${src}${prov}${when}${link}`;
      });

      const suffix = capped ? ` (mostrando ${slice.length} de ${items.length})` : "";
      return {
        ok: true,
        message: `News feed — ${slice.length} noticias${suffix}:\n${lines.join("\n")}`,
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "News feed: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `News feed: error — ${err instanceof Error ? err.message : "Error al consultar el feed"}`,
      };
    }
  },
};
