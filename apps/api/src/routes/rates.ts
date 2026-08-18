import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDollarRates } from "../services/rates.js";

const router = Router();
router.use(requireAuth);

// ============================================================
// GET /api/rates/dolares — cotizaciones del dólar (dolarapi.com)
//
// Delega en services/rates.ts (cache 60s compartida con el tool
// get_dollar_rates del agente). API pública sin cambios.
// ============================================================

router.get("/dolares", async (_req: Request, res: Response) => {
  try {
    const result = await getDollarRates();
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : "No se pudieron obtener las cotizaciones",
    });
  }
});

export default router;
