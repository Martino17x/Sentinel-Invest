import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getIolProvider } from "../services/iol/index.js";
import { getIolCredentials } from "../lib/iol-credentials.js";

const router = Router();
router.use(requireAuth);

const quoteParamsSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  market: z.enum(["bcba", "nyse", "nasdaq", "bonds", "fci", "crypto"]).default("bcba"),
});

// ============================================================
// GET /api/quotes/:symbol/history?days=90&market=bcba
// — histórico de precios para el gráfico del detalle
// ============================================================

router.get("/:symbol/history", async (req: Request, res: Response) => {
  const symbolParam = req.params.symbol;
  const symbol = Array.isArray(symbolParam) ? symbolParam[0] : symbolParam;
  const days = Math.min(Number(req.query.days ?? 90), 365);
  const market = (req.query.market as string) ?? "bcba";

  try {
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const history = await provider.getQuoteHistory(creds, symbol.toUpperCase(), market, days);
    res.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el histórico";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/quotes/:symbol?market=bcba — cotización puntual
// ============================================================

router.get("/:symbol", async (req: Request, res: Response) => {
  const parsed = quoteParamsSchema.safeParse({
    symbol: req.params.symbol,
    market: req.query.market,
  });

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }

  try {
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const quote = await provider.getQuote(creds, parsed.data.symbol, parsed.data.market);
    res.json({ quote });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar la cotización";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/quotes/panel/:market/:assetType — panel completo
// ============================================================

router.get("/panel/:market/:assetType", async (req: Request, res: Response) => {
  const marketParam = req.params.market;
  const assetTypeParam = req.params.assetType;
  const market = Array.isArray(marketParam) ? marketParam[0] : marketParam;
  const assetType = Array.isArray(assetTypeParam) ? assetTypeParam[0] : assetTypeParam;

  if (!["bcba", "nyse", "nasdaq", "bonds", "fci", "crypto"].includes(market)) {
    res.status(400).json({ error: "Mercado inválido" });
    return;
  }

  if (
    !["accion", "cedear", "bono", "on", "caucion", "fci", "futuro", "opcion", "moneda"].includes(
      assetType
    )
  ) {
    res.status(400).json({ error: "Tipo de activo inválido" });
    return;
  }

  // Paginación: page empieza en 1, pageSize entre 10 y 100
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize ?? 25)));

  try {
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const panel = await provider.getPanel(creds, market, assetType, page, pageSize);
    res.json(panel);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el panel";
    res.status(502).json({ error: message });
  }
});

export default router;
