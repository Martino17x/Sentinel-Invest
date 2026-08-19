// ============================================================
// GET /api/analysis/* — portfolio-analysis + stock analysis
// ORDEN canónico spec 0.1 / FIX #5: específico antes que param
//   /screener → /news/feed → /news/:newsId (con %2F) → /:symbol/insights → /:symbol
// requireAuth en todo el router (consistencia con resto API)
// Status insights: 400 zod / 404 todos symbol_not_found / 200 ≥1 ok / 502 todos down
// ============================================================

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { analyzeStock } from "../services/market/analyze.js";
import { getAnalysisService } from "../services/analysis/index.js";

const router = Router();
router.use(requireAuth);

// ---------- Schemas ----------

const analysisParamsSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  market: z.enum(["bcba", "nyse", "nasdaq"]).optional(),
});

const insightsParamsSchema = z.object({
  symbol: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9.]+$/i, "Símbolo inválido")
    .transform((s) => s.toUpperCase()),
  market: z.enum(["bcba", "nyse", "nasdaq"]).optional(),
});

const screenerQuerySchema = z.object({
  market: z.enum(["bcba", "us"]).optional().default("bcba"),
  q: z.string().optional(),
});

const newsFeedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

// ---------- Helpers ----------

function extractNewsId(req: Request): string {
  // req.params.newsId (simple) || req.params.splat (Express 5 wildcard) || req.params[0] (regex)
  const p = req.params as Record<string, string | undefined>;
  const raw = p.newsId ?? (p as Record<string, string | undefined>).splat ?? p["0"];
  if (raw) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  // Fallback: parse raw originalUrl (preserva %2F antes de que Express decodifique)
  const original = (req.originalUrl || req.url || "").split("?")[0];
  // original es "/api/analysis/news/<id>" — router está montado en /api/analysis
  const idx = original.indexOf("/news/");
  if (idx !== -1) {
    const enc = original.slice(idx + "/news/".length);
    try {
      return decodeURIComponent(enc);
    } catch {
      return enc;
    }
  }
  return "";
}

// ---------- 1) GET /screener?market=bcba|us&q= ----------
router.get("/screener", async (req: Request, res: Response) => {
  const parsed = screenerQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }
  const { market, q } = parsed.data;
  try {
    const svc = getAnalysisService();
    // getScreener(market, {query}) — facade ahora soporta query, pero route también filtra por si cache hit
    const result = q ? await svc.getScreener(market, { query: q } as never) : await svc.getScreener(market);
    if (result.status === "ok" && result.data) {
      let rows = result.data as import("../services/analysis/types.js").ScreenerRow[];
      // fallback client-side filter si service no filtró (e.g. cache hit sin query pass-through en versiones previas)
      if (q && rows.length > 1) {
        const needle = q.trim().toLowerCase();
        const filtered = rows.filter(
          (r) => r.symbol.toLowerCase().includes(needle) || (r.name ?? "").toLowerCase().includes(needle),
        );
        // si service ya filtró, filtered será igual; si no, ahora sí
        if (filtered.length !== rows.length) rows = filtered;
      }
      res.json({
        market,
        rows,
        count: rows.length,
        cached: result.cached,
        source: result.source,
        // alias compat dashboard spec D.1
        screener: rows,
      });
      return;
    }
    if (result.status === "rate_limited") {
      res.status(429).json({ error: result.error ?? "Rate limit", market, rows: [], count: 0, cached: false });
      return;
    }
    // down o vacío
    res.status(502).json({ error: result.error ?? "Fuente no responde", market, rows: [], count: 0, cached: false });
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en screener";
    res.status(502).json({ error: message, market, rows: [], count: 0, cached: false });
  }
});

// ---------- 2) GET /news/feed?limit=10 ----------
router.get("/news/feed", async (req: Request, res: Response) => {
  const parsed = newsFeedQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }
  const limit = parsed.data.limit;
  try {
    const svc = getAnalysisService();
    const items = await svc.newsFeed(limit);
    res.json({ items, count: items.length, news: items, limit });
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en news feed";
    res.status(502).json({ error: message, items: [], count: 0, news: [] });
  }
});

// ---------- 3) GET /news/:newsId  (con %2F → "/" ) ----------
// Debe estar ANTES de /:symbol para no ser capturado como :symbol="news"
// y DESPUÉS de /news/feed para no capturar "feed" como id.
const newsByIdHandler = async (req: Request, res: Response) => {
  const id = extractNewsId(req);
  if (!id) {
    res.status(400).json({ error: "newsId requerido" });
    return;
  }
  try {
    const svc = getAnalysisService();
    const result = await svc.newsById(id);
    if (result.status === "ok" && result.data) {
      res.json({ news: result.data, item: result.data, id: result.data.id, cached: result.cached, source: result.source });
      return;
    }
    if (result.status === "symbol_not_found") {
      res.status(404).json({ error: result.error ?? "Noticia no encontrada" });
      return;
    }
    if (result.status === "rate_limited") {
      res.status(429).json({ error: result.error ?? "Rate limit" });
      return;
    }
    res.status(404).json({ error: result.error ?? "Noticia no encontrada" });
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al buscar noticia";
    res.status(502).json({ error: message });
  }
};

// Param simple (sin "/") — Express decodifica %3A pero no %2F con este pattern
router.get("/news/:newsId", newsByIdHandler);
// Wildcard Express 5: /news/*splat  → req.params.splat contiene "BCBA:GGAL/abc-123"
router.get("/news/*splat", newsByIdHandler);
// Regex fallback para %2F slash-encoded (Express decodifica a "/" antes de match)
router.get(/^\/news\/(.+)$/, newsByIdHandler as never);

// ---------- 4) GET /:symbol/insights?market= ----------
router.get("/:symbol/insights", async (req: Request, res: Response) => {
  const parsed = insightsParamsSchema.safeParse({
    symbol: req.params.symbol,
    market: req.query.market ?? undefined,
  });

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }

  try {
    const svc = getAnalysisService();
    const data = await svc.insights(parsed.data.symbol, {
      ...(parsed.data.market ? { market: parsed.data.market } : {}),
    });

    const blocks = [data.insights.fundamentals, data.insights.consensus, data.insights.news];
    const hasOk = blocks.some((b) => b.status === "ok");

    if (hasOk) {
      res.json(data);
      return;
    }

    const allNotFound = blocks.every(
      (b) => b.status === "error" && (b.error ?? "").toLowerCase().includes("no encontrad"),
    );

    if (allNotFound) {
      res.status(404).json({ error: `Símbolo ${parsed.data.symbol} no encontrado`, ...data });
      return;
    }

    // todos down / rate_limited / timeout
    res.status(502).json({ error: "Fuentes no responden", ...data });
    return;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al obtener insights";
    res.status(502).json({ error: message });
  }
});

// ---------- 5) GET /:symbol (existente — intacto) ----------
router.get("/:symbol", async (req: Request, res: Response) => {
  const parsed = analysisParamsSchema.safeParse({
    symbol: req.params.symbol,
    market: req.query.market ?? undefined,
  });

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }

  try {
    const analysis = await analyzeStock(parsed.data.symbol, {
      ...(parsed.data.market ? { market: parsed.data.market } : {}),
    });

    switch (analysis.status) {
      case "ok":
        res.json({ analysis });
        return;
      case "symbol_not_found":
        res.status(404).json({ error: `Símbolo ${parsed.data.symbol} no encontrado`, analysis });
        return;
      case "rate_limited":
        res.status(429).json({
          error: "Límite de consultas a Yahoo Finance alcanzado. Probá de nuevo en unos minutos.",
        });
        return;
      case "down":
        res.status(502).json({
          error: "Yahoo Finance no responde en este momento. Probá de nuevo más tarde.",
        });
        return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al analizar el símbolo";
    res.status(502).json({ error: message });
  }
});

export default router;
