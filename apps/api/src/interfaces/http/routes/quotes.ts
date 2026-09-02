import { Router, type Request, type Response } from "express";
import { z } from "zod";
import pLimit from "p-limit";
import { requireAuth } from "../middleware/auth.js";
import { getBrokerProvider, isBrokerEnabled } from "../../../infraestructura/providers/registry.js";
import { getBrokerCredentials } from "../../../lib/broker-credentials.js";
import { BrokerNotEnabled } from "../../../services/iol/types.js";
import type { BrokerType } from "../../../services/iol/ports.js";
import { getCacheConfig } from "../../../config/env.js";
import { BymaClient } from "../../../infraestructura/providers/byma/BymaClient.js";
import { BymaFichaClient } from "../../../infraestructura/providers/byma/BymaFichaClient.js";
import { QuoteService } from "../../../aplicacion/cotizaciones/QuoteService.js";

function parseBrokerType(req: Request): BrokerType {
  const raw =
    (req.query.broker as string) ||
    (req.headers["x-broker-type"] as string) ||
    "iol";
  return (String(raw).toLowerCase() === "ppi" ? "ppi" : "iol") as BrokerType;
}

function setCacheHeaders(
  res: Response,
  payload: { cacheHit?: boolean; source?: string; fetchedAt?: string; summary?: { cacheHit?: boolean; source?: string; fetchedAt?: string } } | null
): void {
  const cfg = getCacheConfig();
  if (!cfg.enabled) {
    res.setHeader("X-Cache", "BYPASS");
    res.setHeader("Age", "0");
    return;
  }
  const summaryHit = (payload as { summary?: { cacheHit?: boolean } })?.summary?.cacheHit;
  const hit = Boolean(payload?.cacheHit ?? summaryHit);
  res.setHeader("X-Cache", hit ? "HIT" : "MISS");
  const source = (payload as { source?: string })?.source ?? (payload as { summary?: { source?: string } })?.summary?.source;
  if (source) res.setHeader("X-Cache-Source", String(source));
  const fetchedAt = (payload as { fetchedAt?: string })?.fetchedAt ?? (payload as { summary?: { fetchedAt?: string } })?.summary?.fetchedAt;
  if (fetchedAt && hit) {
    const age = Math.max(0, Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000));
    res.setHeader("Age", String(age));
  } else {
    res.setHeader("Age", "0");
  }
}
import {
  formatSnapshotDate,
  getCachedQuoteBySymbol,
  getLatestQuotesSnapshot,
} from "../../../services/market/quotesSnapshotStore.js";
import { isMarketHours } from "../../../services/market/isMarketHours.js";
import { getInstrumentDisplayName } from "@sentinel/domain";
import type { PanelQuote, PanelSummary } from "../../../services/iol/types.js";

const router = Router();
router.use(requireAuth);

// ============================================================
// GET /api/quotes/compare/:symbol?providers=iol,ppi,byma&market=bcba
// Fan-out N providers con p-limit(3) + AbortSignal 4s, cache vía decorator.
// 200 all-ok, 207 parcial, 502 all-rejected. [Req6]
// ============================================================
const compareParamsSchema = z.object({
  symbol: z.string().min(1).max(30).toUpperCase(),
});
const ALLOWED_COMPARE_PROVIDERS = ["iol", "ppi", "byma"] as const;

router.get("/compare/:symbol", async (req: Request, res: Response) => {
  const parsed = compareParamsSchema.safeParse({ symbol: req.params.symbol });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Símbolo inválido" });
    return;
  }
  const symbol = parsed.data.symbol;
  const market = (req.query.market as string) ?? "bcba";
  const rawProviders = (req.query.providers as string | undefined)?.trim();
  let providers: string[];
  if (rawProviders) {
    providers = rawProviders
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => ALLOWED_COMPARE_PROVIDERS.includes(s as (typeof ALLOWED_COMPARE_PROVIDERS)[number]));
    if (providers.length === 0) {
      res.status(400).json({ error: "providers inválido. Usá iol,ppi,byma separados por comas" });
      return;
    }
    providers = [...new Set(providers)];
  } else {
    // default: todos habilitados con flag BROKER_*_ENABLED + byma siempre si ningún broker habilitado
    const enabled: string[] = [];
    if (isBrokerEnabled("iol")) enabled.push("iol");
    if (isBrokerEnabled("ppi")) enabled.push("ppi");
    // byma como MarketData directo siempre disponible como fallback comparativa
    enabled.push("byma");
    providers = [...new Set(enabled)];
  }

  const limit = pLimit(3);
  const fetchedAt = new Date().toISOString();
  const userId = req.user!.id;

  const tasks = providers.map((provider) =>
    limit(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const acSignal = controller.signal;
      try {
        // promise con timeout 4s via race contra abort signal
        const quotePromise = (async () => {
          if (provider === "byma") {
            const byma = new QuoteService(new BymaClient(), new BymaFichaClient());
            // QuoteService.getQuote ignora creds; pasar dummy
            return byma.getQuote({ username: "", password: "" } as unknown as never, symbol, market);
          }
          // test hook: globalThis.__mockBrokerCreds per test
          const mockMap = (globalThis as unknown as { __mockBrokerCreds?: Record<string, { username: string; password: string }> }).__mockBrokerCreds;
          const creds = mockMap?.[provider]
            ? mockMap[provider]
            : await getBrokerCredentials(userId, provider as BrokerType);
          if (!creds.username || !creds.password) {
            const err = new Error("missing credentials");
            (err as unknown as Record<string, string>).code = "no_credentials";
            throw err;
          }
          const brokerProvider = await getBrokerProvider(provider as BrokerType, userId);
          // carrera contra abort signal: si signal aborta, rechazamos con timeout
          const getQuoteWithAbort = brokerProvider.getQuote(creds, symbol, market);
          if (acSignal.aborted) throw Object.assign(new Error("timeout"), { code: "timeout" });
          const abortPromise = new Promise<never>((_, reject) => {
            acSignal.addEventListener("abort", () => reject(Object.assign(new Error("timeout"), { code: "timeout" })), { once: true });
          });
          return await Promise.race([getQuoteWithAbort, abortPromise]);
        })();
        const quote = await quotePromise;
        return { provider, status: "fulfilled" as const, quote };
      } catch (err: unknown) {
        const e = err as Error & { code?: string; name?: string };
        const codeRaw = (e as { code?: string })?.code ?? (e?.name === "AbortError" ? "timeout" : undefined);
        const msg = e?.message ?? "Error al consultar cotización";
        const code = codeRaw === "timeout" || /timeout|aborted/i.test(msg) ? "timeout" : codeRaw ?? (msg === "missing credentials" ? "no_credentials" : "unknown");
        // normalizar mensaje timeout
        const error = code === "timeout" ? "timeout" : msg;
        return { provider, status: "rejected" as const, error, code };
      } finally {
        clearTimeout(timeout);
      }
    })
  );

  const settled = await Promise.all(tasks);

  const results: Record<string, unknown> = {};
  let fulfilled = 0;
  let rejected = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      fulfilled++;
      const q = (r as { quote: unknown }).quote as Record<string, unknown>;
      results[r.provider] = {
        quote: q,
        source: (q as { source?: string })?.source ?? r.provider,
        fetchedAt: (q as { fetchedAt?: string })?.fetchedAt ?? fetchedAt,
      };
    } else {
      rejected++;
      const er = r as { error: string; code: string; provider: string };
      results[er.provider] = { error: er.error, code: er.code };
    }
  }

  const status = fulfilled === providers.length ? 200 : rejected === providers.length ? 502 : 207;
  res.status(status).json({ symbol, results, fetchedAt });
});

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
    const brokerType = parseBrokerType(req);
    const creds = await getBrokerCredentials(req.user!.id, brokerType);
    const provider = await getBrokerProvider(brokerType, req.user!.id);
    const history = await provider.getQuoteHistory(creds, symbol.toUpperCase(), market, days);
    // history cache: BYPASS si disabled else MISS (decorator no stamping hit para arrays)
    setCacheHeaders(res, { cacheHit: false });
    res.json({ history });
  } catch (err) {
    if (err instanceof BrokerNotEnabled) {
      res.status(503).json({ error: err.message, code: "broker_not_enabled" });
      return;
    }
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
    const brokerType = parseBrokerType(req);
    const creds = await getBrokerCredentials(req.user!.id, brokerType);
    const provider = await getBrokerProvider(brokerType, req.user!.id);
    const quote = await provider.getQuote(creds, parsed.data.symbol, parsed.data.market);
    // Fallback vacío: si IOL/BYMA devolvió lastPrice 0, intentar snapshot
    if (quote.lastPrice === 0) {
      const cached = await tryServeCachedQuote(parsed.data.symbol, parsed.data.market);
      if (cached) {
        setCacheHeaders(res, { cacheHit: false, source: "snapshot" });
        res.json(cached);
        return;
      }
      if (!isMarketHours()) {
        setCacheHeaders(res, quote as unknown as { cacheHit?: boolean; source?: string; fetchedAt?: string });
        res.json({
          quote,
          cached: false,
          message: "El mercado está cerrado",
        });
        return;
      }
    }
    setCacheHeaders(res, quote as unknown as { cacheHit?: boolean; source?: string; fetchedAt?: string });
    res.json({ quote });
  } catch (err) {
    if (err instanceof BrokerNotEnabled) {
      res.status(503).json({ error: (err as Error).message, code: "broker_not_enabled" });
      return;
    }
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
    const brokerType = parseBrokerType(req);
    const creds = await getBrokerCredentials(req.user!.id, brokerType);
    const provider = await getBrokerProvider(brokerType, req.user!.id);
    const panel = await provider.getPanel(creds, market, assetType, page, pageSize, q);
    // Si BYMA devuelve panel vacío fuera de horario con mercado cerrado,
    // intentar servir snapshot del cierre antes de devolver vacío.
    if (panel.quotes.length === 0) {
      const cached = await tryServeCachedPanel(market, assetType, page, pageSize, q);
      if (cached) {
        setCacheHeaders(res, { cacheHit: false, source: "snapshot" });
        res.json(cached);
        return;
      }
    }
    setCacheHeaders(res, panel.summary as unknown as { cacheHit?: boolean; source?: string; fetchedAt?: string });
    res.json(panel);
  } catch (err) {
    if (err instanceof BrokerNotEnabled) {
      res.status(503).json({ error: err.message, code: "broker_not_enabled" });
      return;
    }
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
