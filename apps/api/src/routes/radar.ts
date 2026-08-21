import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { DISCLAIMER, getRadar, radarCache } from "../services/market/radar.js";
import { isMarketHours } from "../services/market/isMarketHours.js";

const router = Router();

// All radar routes require auth
router.use(requireAuth);

const querySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  sort: z.enum(["spread", "symbol"]).optional().default("spread"),
  source: z.enum(["all", "byma_usd", "yahoo"]).optional().default("all"),
});

/**
 * GET /api/radar/ccl?q=&page=&limit=&sort=
 * - q: case-insensitive substring on symbol/name (server-side, before paginate)
 * - page >=1 default 1
 * - limit 1..100 default 50 (clamped)
 * - sort spread|symbol default spread
 */
router.get("/ccl", async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }

  // Clamp limit explicitly in case zod transform misses edge
  const page = Math.max(1, parsed.data.page);
  const limit = Math.min(100, Math.max(1, parsed.data.limit));
  const sort = parsed.data.sort;
  const source = parsed.data.source ?? "all";
  const q = parsed.data.q?.trim() || undefined;

  // Cache-Control: no-store — SWR is server-side, client must revalidate
  res.setHeader("Cache-Control", "no-store");

  try {
    const data = await getRadar({ q, page, limit, sort, source });
    // Si BYMA devolvió vacío fuera de horario pero había cache stale, getRadar ya sirvió stale.
    // Si sigue vacío y es mercado cerrado, enriquecer mensaje sin convertir en error.
    if (data.items.length === 0 && data.isMarketClosed) {
      res.json(data);
      return;
    }
    res.json(data);
  } catch (err) {
    // Stale fallback (SwrCache 15min) — preferir datos al cierre
    const staleEntry = radarCache.getEntry("radar:ccl:v1");
    if (staleEntry) {
      res.json(staleEntry.data);
      return;
    }
    // Mercado cerrado sin cache (primer arranque sin datos) → 200 honesto, no 404 ni 502
    if (!isMarketHours(new Date())) {
      res.json({
        status: "ok",
        generatedAt: new Date().toISOString(),
        cclPromedio: null,
        disclaimer: DISCLAIMER,
        isMarketClosed: true,
        items: [],
        total: 0,
        page,
        limit,
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Error al consultar radar CCL";
    res.status(502).json({ error: message });
  }
});

export default router;
