import { Router, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { db, schema } from "../../../db/index.js";
import { BymaClient } from "../../../infraestructura/providers/byma/BymaClient.js";
import { BymaFichaClient } from "../../../infraestructura/providers/byma/BymaFichaClient.js";
import { QuoteService } from "../../../aplicacion/cotizaciones/QuoteService.js";
import {
  buildMonthCalendar,
  fetchYahooDaily,
} from "../../../services/reports/reportBuilder.js";
import {
  annualizedVolatility,
  correlation,
  dailyReturns,
  maxDrawdown,
  periodReturn,
  sharpe,
  ytdReturn,
} from "../../../services/reports/metrics.js";
import { addArtDays, artDateKeyFromUtc, artStartOfDay } from "../../../services/reports/art-time.js";
import {
  createPlan,
  getLatest as getLatestPlan,
  getPlan as getPlanByVersion,
  InvestmentPlanError,
  listPlans,
} from "../../../services/portfolio/InvestmentPlanService.js";

const ENABLE_INVESTMENT_PLAN = process.env.ENABLE_INVESTMENT_PLAN !== "false";

const router = Router();
router.use(requireAuth);

const bymaProvider = new QuoteService(new BymaClient(), new BymaFichaClient());
const dummyCreds = { username: "", password: "" };

// Helper: race con timeout para que una quote lenta no tumbe todo el portafolio
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms)),
  ]);
}

// ============================================================
// Helpers compartidos para reportes virtuales
// Reuso de lógica de portfolio.ts pero sobre virtual_positions.
// Los portafolios virtuales NO tienen portfolio_snapshots ni
// cash_movements: se genera una serie SINTÉTICA flat a partir de
// la valorización actual (proxy). Si no hay posiciones → vacío
// con mensaje, nunca error (contrato F1-R4).
// ============================================================

async function getOwnedVirtualPortfolio(userId: string, portfolioId: string) {
  const [portfolio] = await db
    .select()
    .from(schema.virtualPortfolios)
    .where(and(eq(schema.virtualPortfolios.id, portfolioId), eq(schema.virtualPortfolios.userId, userId)));
  return portfolio ?? null;
}

interface EnrichedVirtualPosition {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currency: string;
  market: string;
  createdAt: Date;
  lastPrice: number | null;
  variationPct: number | null;
  quoteCurrency: string | null;
  totalValue: number;
  costBasis: number;
  gainLossAmount: number;
  gainLossPct: number;
}

async function enrichVirtualPositions(
  positions: (typeof schema.virtualPositions.$inferSelect)[]
): Promise<{ enriched: EnrichedVirtualPosition[]; totals: { totalArs: number; totalUsd: number; costArs: number; costUsd: number } }> {
  const settled = await Promise.allSettled(
    positions.map(async (pos) => {
      const quantity = Number(pos.quantity);
      const avgPrice = Number(pos.avgPrice);
      let lastPrice: number | null = null;
      let variationPct: number | null = null;
      let quoteCurrency: string | null = null;
      try {
        const quote = await withTimeout(bymaProvider.getQuote(dummyCreds, pos.symbol, pos.market), 3000);
        if (quote.lastPrice > 0) {
          lastPrice = quote.lastPrice;
          variationPct = quote.variationPct;
          quoteCurrency = quote.currency;
        }
      } catch {}
      const currentPrice = lastPrice ?? avgPrice;
      const totalValue = quantity * currentPrice;
      const costBasis = quantity * avgPrice;
      const gainLossAmount = totalValue - costBasis;
      const gainLossPct = costBasis > 0 ? (gainLossAmount / costBasis) * 100 : 0;
      return {
        id: pos.id,
        portfolioId: pos.portfolioId,
        symbol: pos.symbol,
        quantity,
        avgPrice,
        currency: pos.currency,
        market: pos.market,
        createdAt: pos.createdAt,
        lastPrice,
        variationPct,
        quoteCurrency,
        totalValue,
        costBasis,
        gainLossAmount,
        gainLossPct,
      } as EnrichedVirtualPosition;
    })
  );
  const enriched = settled.map((r, idx) => {
    if (r.status === "fulfilled") return r.value;
    const pos = positions[idx]!;
    const quantity = Number(pos.quantity);
    const avgPrice = Number(pos.avgPrice);
    return {
      id: pos.id,
      portfolioId: pos.portfolioId,
      symbol: pos.symbol,
      quantity,
      avgPrice,
      currency: pos.currency,
      market: pos.market,
      createdAt: pos.createdAt,
      lastPrice: null,
      variationPct: null,
      quoteCurrency: null,
      totalValue: quantity * avgPrice,
      costBasis: quantity * avgPrice,
      gainLossAmount: 0,
      gainLossPct: 0,
    } as EnrichedVirtualPosition;
  });
  let totalArs = 0;
  let totalUsd = 0;
  let costArs = 0;
  let costUsd = 0;
  for (const p of enriched) {
    if (p.currency === "USD") {
      totalUsd += p.totalValue;
      costUsd += p.costBasis;
    } else {
      totalArs += p.totalValue;
      costArs += p.costBasis;
    }
  }
  return { enriched, totals: { totalArs, totalUsd, costArs, costUsd } };
}

type SyntheticSnap = (typeof schema.portfolioSnapshots.$inferSelect);

function buildVirtualSyntheticSnapshots(
  portfolioCreatedAt: Date,
  totals: { totalArs: number; totalUsd: number; costArs: number; costUsd: number },
  fromArt: Date,
  toArtExclusive: Date,
  positions: EnrichedVirtualPosition[]
): SyntheticSnap[] {
  if (positions.length === 0) return [];
  const portfolioStart = artStartOfDay(portfolioCreatedAt);
  // No generar días anteriores a la creación del portafolio
  const effectiveFrom = fromArt < portfolioStart ? portfolioStart : fromArt;
  if (effectiveFrom >= toArtExclusive) return [];
  const snaps: SyntheticSnap[] = [];
  const totalValue = totals.totalArs;
  const totalValueUsd = totals.totalUsd;
  const positionsValue = totals.totalArs; // aproximación: todo ARS va a positionsValue
  const unrealized = totalValue - totals.costArs;
  // dayChangePct flat 0 — el reporte lo interpretará como sin movimiento,
  // que es honesto: no inventamos volatilidad (F1-R4).
  let cursor = new Date(effectiveFrom);
  while (cursor < toArtExclusive) {
    snaps.push({
      id: `virtual-${artDateKeyFromUtc(cursor)}`,
      accountId: "virtual",
      totalValue: String(totalValue),
      totalValueUsd: String(totalValueUsd),
      cash: String(0),
      cashArs: String(0),
      cashUsd: String(0),
      positionsValue: String(positionsValue),
      unrealizedGain: String(unrealized),
      dayChangePct: String(0),
      currency: "ARS",
      source: "real",
      capturedAt: new Date(cursor),
    } as SyntheticSnap);
    cursor = addArtDays(cursor, 1);
  }
  return snaps;
}

function parseRangeToDays(range: unknown, fallback: number): number {
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

// ============================================================
// Schemas
// ============================================================

const createPortfolioSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido").max(50, "Máximo 50 caracteres"),
  description: z.string().trim().max(500).nullable().optional(),
});

const addPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  quantity: z.coerce.number().positive("Cantidad debe ser > 0"),
  avg_price: z.coerce.number().positive("Precio promedio debe ser > 0"),
  // alias avgPrice también aceptado (frontend camelCase)
  avgPrice: z.coerce.number().positive().optional(),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
  market: z.enum(["bcba", "bonds"]).default("bcba"),
});

// ============================================================
// GET /api/virtual-portfolios — lista del usuario
// ============================================================

router.get("/", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolios = await db
    .select()
    .from(schema.virtualPortfolios)
    .where(eq(schema.virtualPortfolios.userId, userId))
    .orderBy(asc(schema.virtualPortfolios.createdAt));

  res.json({ portfolios });
});

// ============================================================
// POST /api/virtual-portfolios — crear
// ============================================================

router.post("/", async (req: Request, res: Response) => {
  const parsed = createPortfolioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { name, description } = parsed.data;
  const userId = req.user!.id;

  const [created] = await db
    .insert(schema.virtualPortfolios)
    .values({
      userId,
      name: name.trim(),
      description: description?.trim() || null,
    })
    .returning();

  res.status(201).json({ portfolio: created });
});

// ============================================================
// GET /api/virtual-portfolios/:id — detalle con posiciones + quote actual
// ============================================================

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const portfolioId = String(req.params.id);

    const [portfolio] = await db
      .select()
      .from(schema.virtualPortfolios)
      .where(and(eq(schema.virtualPortfolios.id, portfolioId), eq(schema.virtualPortfolios.userId, userId)));

    if (!portfolio) {
      res.status(404).json({ error: "Portafolio no encontrado" });
      return;
    }

    const positions = await db
      .select()
      .from(schema.virtualPositions)
      .where(eq(schema.virtualPositions.portfolioId, portfolioId))
      .orderBy(asc(schema.virtualPositions.createdAt));

    // Enriquecer cada posición con cotización actual vía BYMA.
    // Usa Promise.allSettled + race timeout 3s por quote para que una posición
    // lenta no tumbe todo el portafolio (causa del 502).
    const settled = await Promise.allSettled(
      positions.map(async (pos) => {
        const quantity = Number(pos.quantity);
        const avgPrice = Number(pos.avgPrice);
        let lastPrice: number | null = null;
        let variationPct: number | null = null;
        let quoteCurrency: string | null = null;

        try {
          const quote = await withTimeout(
            bymaProvider.getQuote(dummyCreds, pos.symbol, pos.market),
            3000
          );
          // BYMA devuelve lastPrice 0 cuando no encuentra el símbolo — tratar como null
          if (quote.lastPrice > 0) {
            lastPrice = quote.lastPrice;
            variationPct = quote.variationPct;
            quoteCurrency = quote.currency;
          }
        } catch {
          // best-effort: timeout o error de quote → fallback a avgPrice
        }

        const currentPrice = lastPrice ?? avgPrice;
        const totalValue = quantity * currentPrice;
        const costBasis = quantity * avgPrice;
        const gainLossAmount = totalValue - costBasis;
        const gainLossPct = costBasis > 0 ? (gainLossAmount / costBasis) * 100 : 0;

        return {
          id: pos.id,
          portfolioId: pos.portfolioId,
          symbol: pos.symbol,
          quantity,
          avgPrice,
          currency: pos.currency,
          market: pos.market,
          createdAt: pos.createdAt,
          // Cotización actual
          lastPrice,
          variationPct,
          quoteCurrency,
          // Valorización
          totalValue,
          costBasis,
          gainLossAmount,
          gainLossPct,
        };
      })
    );

    // Promise.allSettled garantiza que aunque una promesa rechace de forma no
    // capturada, el handler no crashee. Mapear fulfilled → valor, rejected → fallback.
    const enriched = settled.map((r, idx) => {
      if (r.status === "fulfilled") return r.value;
      // Fallback: usar avgPrice si la posición falló por completo
      const pos = positions[idx]!;
      const quantity = Number(pos.quantity);
      const avgPrice = Number(pos.avgPrice);
      return {
        id: pos.id,
        portfolioId: pos.portfolioId,
        symbol: pos.symbol,
        quantity,
        avgPrice,
        currency: pos.currency,
        market: pos.market,
        createdAt: pos.createdAt,
        lastPrice: null as number | null,
        variationPct: null as number | null,
        quoteCurrency: null as string | null,
        totalValue: quantity * avgPrice,
        costBasis: quantity * avgPrice,
        gainLossAmount: 0,
        gainLossPct: 0,
      };
    });

    // Totales del portafolio (separados por moneda para no mezclar ARS/USD)
    let totalArs = 0;
    let totalUsd = 0;
    let costArs = 0;
    let costUsd = 0;
    for (const p of enriched) {
      const cur = p.currency as string;
      if (cur === "USD") {
        totalUsd += p.totalValue;
        costUsd += p.costBasis;
      } else {
        totalArs += p.totalValue;
        costArs += p.costBasis;
      }
    }

    res.json({
      portfolio: {
        ...portfolio,
        positions: enriched,
        totals: {
          totalArs,
          totalUsd,
          costArs,
          costUsd,
          gainArs: totalArs - costArs,
          gainUsd: totalUsd - costUsd,
          gainPctArs: costArs > 0 ? ((totalArs - costArs) / costArs) * 100 : 0,
          gainPctUsd: costUsd > 0 ? ((totalUsd - costUsd) / costUsd) * 100 : 0,
        },
      },
    });
  } catch (err) {
    console.error("[virtualPortfolios GET /:id] error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Error al obtener portafolio",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
});

// ============================================================
// POST /api/virtual-portfolios/:id/positions — agregar posición
// ============================================================

router.post("/:id/positions", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);

  // Validar body (soporta avg_price y avgPrice)
  const raw = req.body as Record<string, unknown>;
  const normalized = {
    symbol: raw.symbol,
    quantity: raw.quantity,
    avg_price: raw.avg_price ?? raw.avgPrice,
    avgPrice: raw.avgPrice ?? raw.avg_price,
    currency: raw.currency,
    market: raw.market,
  };

  const parsed = addPositionSchema.safeParse(normalized);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { symbol, quantity, currency, market } = parsed.data;
  const avgPriceVal = parsed.data.avg_price ?? parsed.data.avgPrice!;

  // Ownership check
  const [portfolio] = await db
    .select()
    .from(schema.virtualPortfolios)
    .where(and(eq(schema.virtualPortfolios.id, portfolioId), eq(schema.virtualPortfolios.userId, userId)));

  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }

  try {
    const [created] = await db
      .insert(schema.virtualPositions)
      .values({
        portfolioId,
        symbol: symbol.toUpperCase().trim(),
        quantity: String(quantity),
        avgPrice: String(avgPriceVal),
        currency,
        market,
      })
      .returning();

    // Touch updatedAt del portfolio
    await db
      .update(schema.virtualPortfolios)
      .set({ updatedAt: new Date() })
      .where(eq(schema.virtualPortfolios.id, portfolioId));

    res.status(201).json({ position: created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("virtual_positions_portfolio_symbol_market_unique")) {
      res.status(409).json({ error: `Ya existe una posición para ${symbol} en ${market}` });
      return;
    }
    throw err;
  }
});

// ============================================================
// DELETE /api/virtual-portfolios/:id — eliminar portafolio
// ============================================================

router.delete("/:id", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);

  const [portfolio] = await db
    .select()
    .from(schema.virtualPortfolios)
    .where(and(eq(schema.virtualPortfolios.id, portfolioId), eq(schema.virtualPortfolios.userId, userId)));

  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }

  await db.delete(schema.virtualPortfolios).where(eq(schema.virtualPortfolios.id, portfolioId));

  res.status(204).send();
});

// ============================================================
// DELETE /api/virtual-portfolios/:id/positions/:posId — eliminar posición
// ============================================================

router.delete("/:id/positions/:posId", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);
  const posId = String(req.params.posId);

  const [portfolio] = await db
    .select()
    .from(schema.virtualPortfolios)
    .where(and(eq(schema.virtualPortfolios.id, portfolioId), eq(schema.virtualPortfolios.userId, userId)));

  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }

  const [pos] = await db
    .select()
    .from(schema.virtualPositions)
    .where(and(eq(schema.virtualPositions.id, posId), eq(schema.virtualPositions.portfolioId, portfolioId)));

  if (!pos) {
    res.status(404).json({ error: "Posición no encontrada" });
    return;
  }

  await db.delete(schema.virtualPositions).where(eq(schema.virtualPositions.id, posId));

  await db
    .update(schema.virtualPortfolios)
    .set({ updatedAt: new Date() })
    .where(eq(schema.virtualPortfolios.id, portfolioId));

  res.status(204).send();
});

// ============================================================
// GET /api/virtual-portfolios/:id/history — evolución sintética
// Reuso de lógica de portfolio.ts/history pero con serie SINTÉTICA
// flat (valorización actual como proxy). Sin posiciones → [] con
// mensaje, nunca error (F1-R4).
// ============================================================

router.get("/:id/history", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);
  const portfolio = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }
  try {
    const fromParam = typeof req.query.from === "string" ? req.query.from : undefined;
    const toParam = typeof req.query.to === "string" ? req.query.to : undefined;
    const rangeParam = typeof req.query.range === "string" ? req.query.range : undefined;
    if (
      (fromParam && !/^\d{4}-\d{2}-\d{2}$/.test(fromParam)) ||
      (toParam && !/^\d{4}-\d{2}-\d{2}$/.test(toParam)) ||
      (rangeParam && !/^\d+[dm]$/.test(rangeParam.trim()))
    ) {
      if (rangeParam && !/^\d+[dm]$/.test(rangeParam.trim())) {
        res.status(400).json({ error: "Formato de range inválido. Usá 30d, 90d, 1m, etc." });
        return;
      }
      res.status(400).json({ error: "Formato de fecha inválido. Usá YYYY-MM-DD" });
      return;
    }
    const positions = await db
      .select()
      .from(schema.virtualPositions)
      .where(eq(schema.virtualPositions.portfolioId, portfolioId));
    if (positions.length === 0) {
      res.json({ history: [], message: "Sin posiciones — agregá activos para ver historial" });
      return;
    }
    const { totals: totalsFinal, enriched } = await enrichVirtualPositions(positions);
    const daysFromRange = rangeParam ? parseRangeToDays(rangeParam, 90) : null;
    const days = daysFromRange ?? Math.min(Number(req.query.days ?? 90), 365);
    const to = toParam ? new Date(`${toParam}T03:00:00Z`) : addArtDays(artStartOfDay(), 1);
    const from = fromParam ? new Date(`${fromParam}T03:00:00Z`) : addArtDays(artStartOfDay(), -(days - 1));
    const snaps = buildVirtualSyntheticSnapshots(portfolio.createdAt, totalsFinal, from, to, enriched);
    const history = snaps.map((s) => ({
      capturedAt: s.capturedAt.toISOString(),
      totalValue: Number(s.totalValue),
      totalValueUsd: Number(s.totalValueUsd),
      cashArs: Number(s.cashArs),
      cashUsd: Number(s.cashUsd),
      positionsValue: Number(s.positionsValue),
      dayChangePct: Number(s.dayChangePct),
      unrealizedGain: Number(s.unrealizedGain),
      source: s.source,
    }));
    res.json({ history, message: history.length === 0 ? "Sin historial aún — los datos aparecen desde la creación del portafolio" : undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el historial virtual";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/virtual-portfolios/:id/series — serie diaria sintética
// ============================================================

const seriesQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from debe ser YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to debe ser YYYY-MM-DD").optional(),
  includePositions: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

router.get("/:id/series", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);
  const portfolio = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }
  const parsed = seriesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }
  try {
    const { from, to, includePositions } = parsed.data;
    const fromDate = new Date(`${from}T03:00:00Z`);
    const toDate = to ? new Date(`${to}T03:00:00Z`) : fromDate;
    const toExclusive = addArtDays(toDate, 1);
    const positions = await db.select().from(schema.virtualPositions).where(eq(schema.virtualPositions.portfolioId, portfolioId));
    if (positions.length === 0) {
      res.json({ days: [], message: "Sin posiciones" });
      return;
    }
    const { totals, enriched } = await enrichVirtualPositions(positions);
    const snaps = buildVirtualSyntheticSnapshots(portfolio.createdAt, totals, fromDate, toExclusive, enriched);
    const days = snaps.map((s) => ({
      date: artDateKeyFromUtc(s.capturedAt),
      totalValue: Number(s.totalValue),
      totalValueUsd: Number(s.totalValueUsd),
      cashArs: Number(s.cashArs),
      cashUsd: Number(s.cashUsd),
      positionsValue: Number(s.positionsValue),
      dayChangePct: Number(s.dayChangePct),
      unrealizedGain: Number(s.unrealizedGain),
      source: s.source,
    }));
    let positionsArr: { date: string; symbol: string; market: string; quantity: number; lastPrice: number | null; totalValue: number }[] | undefined;
    if (includePositions && snaps.length > 0) {
      positionsArr = [];
      for (const snap of snaps) {
        const date = artDateKeyFromUtc(snap.capturedAt);
        for (const p of enriched) {
          positionsArr.push({
            date,
            symbol: p.symbol,
            market: p.market,
            quantity: p.quantity,
            lastPrice: p.lastPrice,
            totalValue: p.totalValue,
          });
        }
      }
    }
    res.json({ days, ...(positionsArr ? { positions: positionsArr } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar la serie virtual";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/virtual-portfolios/:id/calendar/:month — calendario mensual
// ============================================================

const virtualMonthParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Formato de mes inválido. Usá YYYY-MM (ej: 2026-07)")
  .refine((m) => {
    const [, mon] = m.split("-").map(Number);
    return mon >= 1 && mon <= 12;
  }, "Mes inválido (debe ser 01-12)");

router.get("/:id/calendar/:month", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);
  const portfolio = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }
  const parsed = virtualMonthParamSchema.safeParse(req.params.month);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Mes inválido" });
    return;
  }
  const month = parsed.data;
  try {
    const positions = await db.select().from(schema.virtualPositions).where(eq(schema.virtualPositions.portfolioId, portfolioId));
    if (positions.length === 0) {
      // sin posiciones → calendario vacío pero válido (F2-R3)
      const emptyCal = buildMonthCalendar(month, [], new Map());
      res.json(emptyCal);
      return;
    }
    const { totals, enriched } = await enrichVirtualPositions(positions);
    const [year, mon] = month.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, mon - 1, 1));
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const nextMonthKey = nextMonth.toISOString().slice(0, 7);
    const from = new Date(`${month}-01T03:00:00Z`);
    const to = new Date(`${nextMonthKey}-01T03:00:00Z`);
    const snaps = buildVirtualSyntheticSnapshots(portfolio.createdAt, totals, from, to, enriched);
    // virtuales no tienen cash_movements → map vacío
    res.json(buildMonthCalendar(month, snaps, new Map()));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el calendario virtual";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/virtual-portfolios/:id/metrics — métricas sintéticas
// ============================================================

const metricsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from debe ser YYYY-MM-DD").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to debe ser YYYY-MM-DD").optional(),
  days: z.coerce.number().int().positive().max(365).optional(),
  rf: z.coerce.number().optional(),
});

router.get("/:id/metrics", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);
  const portfolio = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }
  const parsed = metricsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }
  try {
    const days = Math.min(parsed.data.days ?? 90, 365);
    const to = parsed.data.to ? new Date(`${parsed.data.to}T03:00:00Z`) : addArtDays(artStartOfDay(), 1);
    const from = parsed.data.from ? new Date(`${parsed.data.from}T03:00:00Z`) : addArtDays(artStartOfDay(), -(days - 1));
    const positions = await db.select().from(schema.virtualPositions).where(eq(schema.virtualPositions.portfolioId, portfolioId));
    if (positions.length === 0) {
      res.json({
        volatility: 0,
        sharpe: null,
        maxDrawdown: 0,
        mervalCorrelation: null,
        ytd: null,
        periodReturn: 0,
        rf: parsed.data.rf ?? 0,
        message: "Sin posiciones — agregá activos para calcular métricas",
      });
      return;
    }
    const { totals, enriched } = await enrichVirtualPositions(positions);
    const snaps = buildVirtualSyntheticSnapshots(portfolio.createdAt, totals, from, to, enriched);
    const values = snaps.map((s) => Number(s.totalValue));
    const points = snaps.map((s) => ({ date: artDateKeyFromUtc(s.capturedAt), value: Number(s.totalValue) }));
    const returns = dailyReturns(values);
    const rf = parsed.data.rf ?? 0;
    const merval = await fetchYahooDaily("^MERV");
    const alignedValues: number[] = [];
    const alignedMerval: number[] = [];
    for (const s of snaps) {
      const key = artDateKeyFromUtc(s.capturedAt);
      let best: number | null = null;
      for (const p of merval) {
        if (p.date <= key) best = p.close;
        else break;
      }
      if (best == null) continue;
      alignedValues.push(Number(s.totalValue));
      alignedMerval.push(best);
    }
    res.json({
      volatility: annualizedVolatility(returns),
      sharpe: sharpe(returns, { rf }),
      maxDrawdown: maxDrawdown(values),
      mervalCorrelation: correlation(alignedValues, alignedMerval),
      ytd: ytdReturn(points),
      periodReturn: periodReturn(values),
      rf,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al calcular las métricas virtuales";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/virtual-portfolios/:id/reports — cierres mensuales sintéticos
// ============================================================

router.get("/:id/reports", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);
  const portfolio = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }
  try {
    const positions = await db.select().from(schema.virtualPositions).where(eq(schema.virtualPositions.portfolioId, portfolioId));
    if (positions.length === 0) {
      res.json({ closes: [], message: "Sin posiciones — agregá activos para ver reportes" });
      return;
    }
    const { totals, enriched } = await enrichVirtualPositions(positions);
    // Generar cierres de los últimos 12 meses a partir de snapshots sintéticos
    const nowMonth = artDateKeyFromUtc(artStartOfDay()).slice(0, 7);
    const from = addArtDays(new Date(`${nowMonth}-01T03:00:00Z`), -365);
    const to = addArtDays(artStartOfDay(), 1);
    const snaps = buildVirtualSyntheticSnapshots(portfolio.createdAt, totals, from, to, enriched);
    // Agrupar por mes como en buildMonthlyCloses
    const byMonth = new Map<string, typeof snaps>();
    for (const s of snaps) {
      const mk = artDateKeyFromUtc(s.capturedAt).slice(0, 7);
      const list = byMonth.get(mk) ?? [];
      list.push(s);
      byMonth.set(mk, list);
    }
    const closes: { month: string; closingValueArs: number; closingValueUsd: number; twrPct: number; grossChangeArs: number; netContributionsArs: number }[] = [];
    let prevEmv: number | null = null;
    const sortedMonths = Array.from(byMonth.keys()).sort();
    for (const mk of sortedMonths) {
      const list = byMonth.get(mk)!;
      const emvSnap = list[list.length - 1]!;
      const emv = Number(emvSnap.totalValue);
      const bmv = prevEmv ?? emv;
      const gross = emv - bmv;
      // virtuales: sin aportes reales → cf 0
      const cf = 0;
      const denominator = bmv + cf * 0.5;
      const twrPct = denominator === 0 ? 0 : ((emv - bmv - cf) / denominator) * 100;
      closes.push({
        month: mk,
        closingValueArs: emv,
        closingValueUsd: Number(emvSnap.totalValueUsd),
        twrPct,
        grossChangeArs: gross,
        netContributionsArs: cf,
      });
      prevEmv = emv;
    }
    res.json({ closes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar los reportes virtuales";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/virtual-portfolios/:id/reports/:month — reporte mensual sintético
// ============================================================

router.get("/:id/reports/:month", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const portfolioId = String(req.params.id);
  const month = String(req.params.month);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Formato de mes inválido. Usá YYYY-MM (ej: 2026-07)" });
    return;
  }
  const portfolio = await getOwnedVirtualPortfolio(userId, portfolioId);
  if (!portfolio) {
    res.status(404).json({ error: "Portafolio no encontrado" });
    return;
  }
  try {
    const positions = await db.select().from(schema.virtualPositions).where(eq(schema.virtualPositions.portfolioId, portfolioId));
    if (positions.length === 0) {
      res.status(404).json({ error: "Sin posiciones para generar reporte. Agregá activos primero." });
      return;
    }
    const { totals, enriched } = await enrichVirtualPositions(positions);
    const monthStart = new Date(`${month}-01T03:00:00Z`);
    const nextMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1));
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const nextMonthKey = nextMonth.toISOString().slice(0, 7);
    const monthEnd = new Date(`${nextMonthKey}-01T03:00:00Z`);
    const snaps = buildVirtualSyntheticSnapshots(portfolio.createdAt, totals, monthStart, monthEnd, enriched);
    if (snaps.length === 0) {
      res.status(404).json({ error: `No hay datos para el mes ${month}. El portafolio se creó después.` });
      return;
    }
    const firstSnap = snaps[0]!;
    const lastSnap = snaps[snaps.length - 1]!;
    const bmv = Number(firstSnap.totalValue);
    const emv = Number(lastSnap.totalValue);
    const grossChangeArs = emv - bmv;
    const grossChangePct = bmv !== 0 ? (emv / bmv - 1) * 100 : 0;
    const twrPct = bmv !== 0 ? ((emv - bmv) / bmv) * 100 : 0;
    const twrArs = (twrPct / 100) * bmv;
    // Mejor/peor día: variación flat → 0
    let bestDay: { date: string; pct: number } | null = null;
    let worstDay: { date: string; pct: number } | null = null;
    for (let i = 1; i < snaps.length; i++) {
      const prev = Number(snaps[i - 1]!.totalValue);
      const curr = Number(snaps[i]!.totalValue);
      if (prev === 0) continue;
      const pct = ((curr - prev) / prev) * 100;
      const point = { date: artDateKeyFromUtc(snaps[i]!.capturedAt), pct };
      if (!bestDay || pct > bestDay.pct) bestDay = point;
      if (!worstDay || pct < worstDay.pct) worstDay = point;
    }
    // Benchmark y FX degradados: intentamos Yahoo, si falla plano 0
    const merval = await fetchYahooDaily("^MERV");
    const fx = await fetchYahooDaily("ARS=X");
    const prevDayKey = artDateKeyFromUtc(addArtDays(monthStart, -1));
    const lastDate = artDateKeyFromUtc(lastSnap.capturedAt);
    function closeOnOrBefore(points: { date: string; close: number }[], key: string): number | null {
      let best: number | null = null;
      for (const p of points) {
        if (p.date <= key) best = p.close;
        else break;
      }
      return best;
    }
    function pctBetween(a: number | null, b: number | null): number {
      if (a == null || b == null || a === 0) return 0;
      return ((b - a) / a) * 100;
    }
    const mervalStart = closeOnOrBefore(merval, prevDayKey);
    const mervalEnd = closeOnOrBefore(merval, lastDate);
    const benchmarkPct = pctBetween(mervalStart, mervalEnd);
    const fxStart = closeOnOrBefore(fx, prevDayKey);
    const fxEnd = closeOnOrBefore(fx, lastDate);
    const fxChangePct = pctBetween(fxStart, fxEnd);
    // Serie para gráfico: valor plano + benchmark normalizado
    const firstDate = artDateKeyFromUtc(firstSnap.capturedAt);
    const mervalBase = (() => {
      for (const p of merval) if (p.date >= firstDate) return p.close;
      return merval.length > 0 ? merval[0]!.close : null;
    })();
    let mervalCarry: number | null = null;
    const series = snaps.map((s) => {
      const date = artDateKeyFromUtc(s.capturedAt);
      const close = merval.find((p) => p.date === date)?.close;
      if (close != null) mervalCarry = close;
      const benchmark = mervalBase && (mervalCarry ?? mervalBase) > 0 ? ((mervalCarry ?? mervalBase) / mervalBase) * 1000 : 1000;
      return { date, valueArs: Number(s.totalValue), benchmark: Math.round(benchmark * 100) / 100 };
    });
    // Prev closing: mes anterior flat
    const prevMonthStart = addArtDays(monthStart, -30);
    const prevSnaps = buildVirtualSyntheticSnapshots(portfolio.createdAt, totals, prevMonthStart, monthStart, enriched);
    const prevEmv = prevSnaps.length > 0 ? Number(prevSnaps[prevSnaps.length - 1]!.totalValue) : bmv;
    res.json({
      report: {
        month,
        closingValueArs: emv,
        closingValueUsd: Number(lastSnap.totalValueUsd),
        previousClosingValueArs: prevEmv,
        previousClosingValueUsd: Number(lastSnap.totalValueUsd),
        grossChangeArs,
        grossChangePct,
        twrPct,
        twrArs,
        netContributionsArs: 0,
        realizedGainArs: 0,
        unrealizedGainArs: emv - totals.costArs,
        buys: [],
        sells: [],
        totalBuysArs: 0,
        totalSellsArs: 0,
        commissionsArs: 0,
        dividendsArs: 0,
        bestDay,
        worstDay,
        benchmarkPct,
        fxChangePct,
        series,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el reporte virtual";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// Investment Plans — versionado append-only por portfolio
// Feature-flag ENABLE_INVESTMENT_PLAN (default true). 4 endpoints:
// POST /:id/plans — crear versión+1 transaccional
// GET  /:id/plans — historial DESC
// GET  /:id/plans/latest — última versión
// GET  /:id/plans/:version — versión exacta
// Todos requieren ownership (403 si no owner, 404 si no existe)
// y validación 400/409 (Zod + símbolos + unique violation).
// ============================================================

function handlePlanError(err: unknown, res: Response) {
  if (err instanceof InvestmentPlanError) {
    const body: Record<string, unknown> = { error: err.message, code: err.code };
    if (err.extra) Object.assign(body, err.extra);
    // 409 VERSION_CONFLICT must include retry:true per spec
    if (err.code === "VERSION_CONFLICT") body.retry = true;
    res.status(err.status).json(body);
    return true;
  }
  return false;
}

router.post("/:id/plans", async (req: Request, res: Response) => {
  if (!ENABLE_INVESTMENT_PLAN) {
    res.status(404).json({ error: "No encontrado", code: "NOT_FOUND" });
    return;
  }
  const portfolioId = String(req.params.id);
  const userId = req.user!.id;
  try {
    const plan = await createPlan(portfolioId, userId, req.body, "user");
    res.status(201).json({ plan });
  } catch (err) {
    if (handlePlanError(err, res)) return;
    console.error("[virtualPortfolios POST /:id/plans] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Error al crear plan" });
  }
});

router.get("/:id/plans", async (req: Request, res: Response) => {
  if (!ENABLE_INVESTMENT_PLAN) {
    res.status(404).json({ error: "No encontrado", code: "NOT_FOUND" });
    return;
  }
  const portfolioId = String(req.params.id);
  const userId = req.user!.id;
  try {
    const plans = await listPlans(portfolioId, userId);
    res.json({ plans });
  } catch (err) {
    if (handlePlanError(err, res)) return;
    console.error("[virtualPortfolios GET /:id/plans] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Error al listar planes" });
  }
});

router.get("/:id/plans/latest", async (req: Request, res: Response) => {
  if (!ENABLE_INVESTMENT_PLAN) {
    res.status(404).json({ error: "No encontrado", code: "NOT_FOUND" });
    return;
  }
  const portfolioId = String(req.params.id);
  const userId = req.user!.id;
  try {
    const plan = await getLatestPlan(portfolioId, userId);
    res.json({ plan });
  } catch (err) {
    if (handlePlanError(err, res)) return;
    console.error("[virtualPortfolios GET /:id/plans/latest] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Error al obtener latest" });
  }
});

router.get("/:id/plans/:version", async (req: Request, res: Response) => {
  if (!ENABLE_INVESTMENT_PLAN) {
    res.status(404).json({ error: "No encontrado", code: "NOT_FOUND" });
    return;
  }
  const portfolioId = String(req.params.id);
  const userId = req.user!.id;
  const v = Number(req.params.version);
  if (!Number.isInteger(v) || v <= 0) {
    res.status(400).json({ error: "Versión inválida", code: "INVALID_VERSION" });
    return;
  }
  try {
    const plan = await getPlanByVersion(portfolioId, userId, v);
    res.json({ plan });
  } catch (err) {
    if (handlePlanError(err, res)) return;
    console.error("[virtualPortfolios GET /:id/plans/:version] error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Error al obtener plan" });
  }
});

export default router;
