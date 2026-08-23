import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getIolProvider } from "../services/iol/index.js";
import { getIolCredentials } from "../lib/iol-credentials.js";
import {
  formatSnapshotDate,
  getCachedQuoteBySymbol,
  getLatestQuotesSnapshot,
} from "../services/market/quotesSnapshotStore.js";
import { isMarketHours } from "../services/market/isMarketHours.js";
import { getInstrumentDisplayName } from "../services/iol/instrumentNames.js";
import type { PanelQuote, PanelSummary } from "../services/iol/types.js";

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

function parseRangeToDaysQuote(range: unknown, fallback: number): number {
  if (typeof range === "string" && /^\d+d$/.test(range.trim())) {
    const n = Number(range.trim().slice(0, -1));
    if (Number.isFinite(n) && n > 0) return Math.min(n, 365);
  }
  if (typeof range === "string" && /^\d+m$/.test(range.trim())) {
    const n = Number(range.trim().slice(0, -1));
    if (Number.isFinite(n) && n > 0) return Math.min(n * 30, 365);
  }
  return fallback;
}

router.get("/:symbol/history", async (req: Request, res: Response) => {
  const symbolParam = req.params.symbol;
  const symbol = Array.isArray(symbolParam) ? symbolParam[0] : symbolParam;
  const rangeParam = typeof req.query.range === "string" ? req.query.range : undefined;
  if (rangeParam && !/^\d+[dm]$/.test(rangeParam.trim())) {
    res.status(400).json({ error: "Formato de range inválido. Usá 30d, 90d" });
    return;
  }
  const daysFromRange = rangeParam ? parseRangeToDaysQuote(rangeParam, 90) : null;
  const days = daysFromRange ?? Math.min(Number(req.query.days ?? 90), 365);
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
    // Fallback vacío: si IOL/BYMA devolvió lastPrice 0, intentar snapshot
    if (quote.lastPrice === 0) {
      const cached = await tryServeCachedQuote(parsed.data.symbol, parsed.data.market);
      if (cached) {
        res.json(cached);
        return;
      }
      if (!isMarketHours()) {
        res.json({
          quote,
          cached: false,
          message: "El mercado está cerrado",
        });
        return;
      }
    }
    res.json({ quote });
  } catch (err) {
    const cached = await tryServeCachedQuote(parsed.data.symbol, parsed.data.market);
    if (cached) {
      res.json(cached);
      return;
    }
    if (!isMarketHours()) {
      res.json({
        quote: {
          symbol: parsed.data.symbol,
          market: parsed.data.market,
          lastPrice: 0,
          variationPct: 0,
          currency: parsed.data.market === "bcba" ? "ARS" : "USD",
          updatedAt: new Date().toISOString(),
          name: parsed.data.symbol,
          bid: null,
          ask: null,
          open: null,
          high: null,
          low: null,
          prevClose: null,
          volume: null,
        },
        cached: false,
        message: "El mercado está cerrado",
      });
      return;
    }
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

  // Paginación: BYMA ya trae panel completo con page_size=5000; acá paginamos local.
  // Range amplio (10-5000) para que snapshot y InstrumentPicker puedan pedir 5000 sin clamp a 100.
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(5000, Math.max(10, Number(req.query.pageSize ?? 25)));
  // Búsqueda server-side por símbolo/nombre (filtra ANTES de paginar)
  const q = (req.query.q as string | undefined)?.trim() || undefined;

  try {
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const panel = await provider.getPanel(creds, market, assetType, page, pageSize, q);
    // Si BYMA devuelve panel vacío fuera de horario con mercado cerrado,
    // intentar servir snapshot del cierre antes de devolver vacío.
    if (panel.quotes.length === 0) {
      const cached = await tryServeCachedPanel(market, assetType, page, pageSize, q);
      if (cached) {
        res.json(cached);
        return;
      }
    }
    res.json(panel);
  } catch (err) {
    // BYMA 502/timeout fuera de horario → fallback a snapshot del cierre
    const cached = await tryServeCachedPanel(market, assetType, page, pageSize, q);
    if (cached) {
      res.json(cached);
      return;
    }
    // Sin snapshot y fuera de horario → no contaminar con 502 (tabla aún vacía
    // porque el job 17:05 nunca corrió). Devolver 200 vacío y mensaje cerrado.
    if (!isMarketHours()) {
      res.json({
        summary: {
          market,
          assetType,
          totalVariationPct: 0,
          updatedAt: new Date().toISOString(),
          isRealtime: false,
        },
        quotes: [],
        total: 0,
        cached: false,
        message: "El mercado está cerrado",
      });
      return;
    }
    const message = err instanceof Error ? err.message : "Error al consultar el panel";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// Fallback: snapshot del cierre cuando BYMA falla o devuelve vacío
// ============================================================

/**
 * Re-resuelve `name` contra el catálogo actual (instrumentNames).
 * El catálogo SIEMPRE gana sobre el snapshot: nombres viejos incorrectos
 * guardados en DB (ej. "Apple Inc. CEDEAR" para AALD) se corrigen al vuelo.
 * Si getInstrumentDisplayName retorna == symbol (catálogo no lo conoce),
 * preservamos el nombre cacheado tal cual.
 */
export function resolveSnapshotQuoteName(quote: PanelQuote): PanelQuote {
  const resolved = getInstrumentDisplayName(quote.symbol);
  if (resolved !== quote.symbol) {
    return { ...quote, name: resolved };
  }
  return quote;
}

export function resolveSnapshotQuoteNames(quotes: PanelQuote[]): PanelQuote[] {
  return quotes.map(resolveSnapshotQuoteName);
}

async function tryServeCachedPanel(
  market: string,
  assetType: string,
  page: number,
  pageSize: number,
  q?: string
): Promise<
  | { summary: PanelSummary; quotes: PanelQuote[]; total: number; cached: true; cachedAt: string; message: string }
  | null
> {
  try {
    const snapshot = await getLatestQuotesSnapshot(market, assetType);
    if (!snapshot) return null;
    const payload = snapshot.payload as unknown as { summary: PanelSummary; quotes: PanelQuote[]; total: number };
    if (!payload.quotes || payload.quotes.length === 0) return null;

    const query = q?.trim().toUpperCase();
    const filtered = query
      ? payload.quotes.filter(
          (quote) => quote.symbol.toUpperCase().includes(query) || quote.name.toUpperCase().includes(query)
        )
      : payload.quotes;

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const quotes = resolveSnapshotQuoteNames(filtered.slice(start, start + pageSize));

    const labelDate = formatSnapshotDate(snapshot.capturedAt);
    return {
      summary: {
        ...payload.summary,
        updatedAt: snapshot.capturedAt,
        isRealtime: false,
      },
      quotes,
      total,
      cached: true,
      cachedAt: snapshot.capturedAt,
      message: `Datos al cierre del ${labelDate}`,
    };
  } catch {
    return null;
  }
}

async function tryServeCachedQuote(
  symbol: string,
  market: string
): Promise<{ quote: unknown; cached: true; cachedAt: string; message: string } | null> {
  try {
    const hit = await getCachedQuoteBySymbol(symbol);
    if (!hit) return null;
    const q = hit.quote;
    // Mapear PanelQuote → Quote (forma que espera el frontend en /quotes/:symbol)
    const quote = {
      symbol: q.symbol,
      market: market,
      lastPrice: q.lastPrice,
      variationPct: q.variationPct,
      currency: q.currency,
      updatedAt: hit.capturedAt,
      name: resolveSnapshotQuoteName(q).name,
      bid: q.bid,
      ask: q.ask,
      open: q.open,
      high: q.high,
      low: q.low,
      prevClose: q.close,
      volume: q.volume,
    };
    return { quote, cached: true, cachedAt: hit.capturedAt, message: hit.message };
  } catch {
    return null;
  }
}

export default router;
