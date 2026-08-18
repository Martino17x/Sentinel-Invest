// ============================================================
// GET /api/analysis/:symbol?market=bcba|nyse|nasdaq
// — análisis profundo de un instrumento (técnico + fundamental + señal)
//
// requireAuth (consistencia con el resto de la API; los datos son
// públicos, no se usan datos del usuario). Status:
//   200 ok / 400 validación zod / 404 símbolo inexistente /
//   429 rate limit Yahoo / 502 Yahoo caído (degradado)
// ============================================================

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { analyzeStock } from "../services/market/analyze.js";

const router = Router();
router.use(requireAuth);

const analysisParamsSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  market: z.enum(["bcba", "nyse", "nasdaq"]).optional(),
});

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
