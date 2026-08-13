import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// ============================================================
// GET /api/rates/dolares — cotizaciones del dólar (dolarapi.com)
//
// Fuente: https://dolarapi.com (gratis, sin auth, JSON limpio).
// Casas: oficial, blue, bolsa (CCL), contadoconliqui, mayorista,
//        cripto, tarjeta — cada una con compra/venta/fechaActualizacion.
// Cache en memoria de 60s para no pegarle a la API en cada request.
// ============================================================

interface DolarQuote {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

const DOLARAPI_URL = "https://dolarapi.com/v1/dolares";
const CACHE_TTL_MS = 60_000;

let cache: { data: DolarQuote[]; expiresAt: number } | null = null;

router.get("/dolares", async (_req: Request, res: Response) => {
  // 1. Cache válida → devolverla
  if (cache && cache.expiresAt > Date.now()) {
    res.json({ dolares: cache.data, source: "dolarapi.com", cached: true });
    return;
  }

  // 2. Fetch a dolarapi.com con timeout
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(DOLARAPI_URL, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!r.ok) {
      throw new Error(`dolarapi.com respondió ${r.status}`);
    }

    const dolares = (await r.json()) as DolarQuote[];
    cache = { data: dolares, expiresAt: Date.now() + CACHE_TTL_MS };
    res.json({ dolares, source: "dolarapi.com", cached: false });
  } catch (err) {
    // 3. Cache vencida pero existente → servirla como último recurso
    if (cache) {
      res.json({ dolares: cache.data, source: "dolarapi.com (cache)", cached: true, stale: true });
      return;
    }
    res.status(502).json({
      error: err instanceof Error ? err.message : "No se pudieron obtener las cotizaciones",
    });
  }
});

export default router;
