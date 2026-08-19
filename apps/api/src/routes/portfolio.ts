import { Router, type Request, type Response } from "express";
import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getIolProvider } from "../services/iol/index.js";
import { getIolCredentials } from "../lib/iol-credentials.js";
import { getAccountForUser } from "../services/agent/account.js";
import {
  buildMonthCalendar,
  fetchYahooDaily,
  saveDailySnapshot,
} from "../services/reports/reportBuilder.js";
import {
  annualizedVolatility,
  correlation,
  dailyReturns,
  maxDrawdown,
  periodReturn,
  sharpe,
  ytdReturn,
} from "../services/reports/metrics.js";
import { addArtDays, artDateKeyFromUtc, artStartOfDay } from "../services/reports/art-time.js";
import { db, schema } from "../db/index.js";

const router = Router();
router.use(requireAuth);

// getAccountForUser vive en services/agent/account.ts (helper compartido
// con los tools del agente): mismo gate multitenant en toda la app.

// ============================================================
// GET /api/portfolio — resumen del portafolio
// ============================================================

router.get("/", async (req: Request, res: Response) => {
  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const portfolio = await provider.getPortfolio(creds, result.account.iolAccountNumber);

    // Snapshot del día (uno por día local por cuenta) — solo con cuentas
    // reales en BD: en modo mock la cuenta es "demo" y no existe en la BD.
    // El sync nunca debe romper la respuesta del portfolio.
    if (process.env.IOL_PROVIDER === "api") {
      await saveDailySnapshot(result.account.id, portfolio).catch((err) => {
        console.warn("⚠️ snapshot sync:", err instanceof Error ? err.message : err);
      });
    }

    res.json({ portfolio });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el portafolio";
    if (message.includes("autenticación") || message.includes("401")) {
      res.status(401).json({ error: "Credenciales de IOL inválidas o expiradas. Reconectá tu cuenta." });
      return;
    }
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/portfolio/history?days=90|from=YYYY-MM-DD|to=YYYY-MM-DD
// — evolución del valor REAL desde portfolio_snapshots
// (F1-R4: nunca inventar datos; sin snapshots → 200 []).
// Shape aditivo {history:[...]} (D9): DashboardPage.tsx consume
// capturedAt/totalValue — no romper el contrato.
// ============================================================

router.get("/history", async (req: Request, res: Response) => {
  const fromParam = typeof req.query.from === "string" ? req.query.from : undefined;
  const toParam = typeof req.query.to === "string" ? req.query.to : undefined;

  if (
    (fromParam && !/^\d{4}-\d{2}-\d{2}$/.test(fromParam)) ||
    (toParam && !/^\d{4}-\d{2}-\d{2}$/.test(toParam))
  ) {
    res.status(400).json({ error: "Formato de fecha inválido. Usá YYYY-MM-DD" });
    return;
  }

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const days = Math.min(Number(req.query.days ?? 90), 365);

    // Rango en días ART (PREREQ-1): "hoy" se deriva de art-time, nunca
    // de la hora local del server (que suele correr en UTC).
    const to = toParam ? new Date(`${toParam}T03:00:00Z`) : addArtDays(artStartOfDay(), 1);
    const from = fromParam
      ? new Date(`${fromParam}T03:00:00Z`)
      : addArtDays(artStartOfDay(), -(days - 1));

    const snapshots = await db
      .select()
      .from(schema.portfolioSnapshots)
      .where(
        and(
          eq(schema.portfolioSnapshots.accountId, result.account.id),
          gte(schema.portfolioSnapshots.capturedAt, from),
          lt(schema.portfolioSnapshots.capturedAt, to)
        )
      )
      .orderBy(asc(schema.portfolioSnapshots.capturedAt));

    // Numerics PG → Number() SIEMPRE (regla reportBuilder.ts:17)
    const history = snapshots.map((s) => ({
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

    res.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el historial";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/portfolio/series?from=YYYY-MM-DD&to=YYYY-MM-DD&includePositions=true
// — serie diaria + composición opcional desde portfolio_snapshots
// (F1-R5, contrato /series: zod, from requerido, to opcional).
// ============================================================

const seriesQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from debe ser YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to debe ser YYYY-MM-DD").optional(),
  includePositions: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

router.get("/series", async (req: Request, res: Response) => {
  const parsed = seriesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const { from, to, includePositions } = parsed.data;
    const fromDate = new Date(`${from}T03:00:00Z`);
    // to es inclusivo en el contrato → el límite exclusivo es +1 día ART
    const toDate = to ? new Date(`${to}T03:00:00Z`) : fromDate;
    const toExclusive = addArtDays(toDate, 1);

    const snapshots = await db
      .select()
      .from(schema.portfolioSnapshots)
      .where(
        and(
          eq(schema.portfolioSnapshots.accountId, result.account.id),
          gte(schema.portfolioSnapshots.capturedAt, fromDate),
          lt(schema.portfolioSnapshots.capturedAt, toExclusive)
        )
      )
      .orderBy(asc(schema.portfolioSnapshots.capturedAt));

    const days = snapshots.map((s) => ({
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

    let positions: {
      date: string;
      symbol: string;
      market: string;
      quantity: number;
      lastPrice: number | null;
      totalValue: number;
    }[] | undefined;
    if (includePositions && snapshots.length > 0) {
      const dateBySnapshot = new Map(snapshots.map((s) => [s.id, artDateKeyFromUtc(s.capturedAt)]));
      const rows = await db
        .select()
        .from(schema.snapshotPositions)
        .where(inArray(schema.snapshotPositions.snapshotId, snapshots.map((s) => s.id)))
        .orderBy(asc(schema.snapshotPositions.snapshotId));
      positions = rows.map((p) => ({
        date: dateBySnapshot.get(p.snapshotId)!,
        symbol: p.symbol,
        market: p.market,
        quantity: Number(p.quantity),
        lastPrice: p.lastPrice != null ? Number(p.lastPrice) : null,
        totalValue: Number(p.totalValue),
      }));
    }

    res.json({ days, ...(positions ? { positions } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar la serie";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/portfolio/calendar/:month — calendario mensual de
// valores (F2, contrato calendar). :month = YYYY-MM (zod).
//
// Deriva de portfolio_snapshots: devuelve TODOS los días del mes,
// con los que tienen snapshot poblados y el resto en null — nunca
// inventar datos (F1-R4/F2-R3). movementCount por día sale de
// cash_movements (count). La matemática vive en buildMonthCalendar
// (pura, testeada sin BD).
// ============================================================

const monthParamSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Formato de mes inválido. Usá YYYY-MM (ej: 2026-07)")
  .refine((m) => {
    const [, mon] = m.split("-").map(Number);
    return mon >= 1 && mon <= 12;
  }, "Mes inválido (debe ser 01-12)");

router.get("/calendar/:month", async (req: Request, res: Response) => {
  const parsed = monthParamSchema.safeParse(req.params.month);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Mes inválido" });
    return;
  }
  const month = parsed.data;

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    // Rango del mes en días ART: [YYYY-MM-01, primer día del mes siguiente)
    const [year, mon] = month.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, mon - 1, 1));
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const nextMonthKey = nextMonth.toISOString().slice(0, 7);

    const snapshots = await db
      .select()
      .from(schema.portfolioSnapshots)
      .where(
        and(
          eq(schema.portfolioSnapshots.accountId, result.account.id),
          gte(schema.portfolioSnapshots.capturedAt, new Date(`${month}-01T03:00:00Z`)),
          lt(schema.portfolioSnapshots.capturedAt, new Date(`${nextMonthKey}-01T03:00:00Z`))
        )
      )
      .orderBy(asc(schema.portfolioSnapshots.capturedAt));

    // Movimientos por día. cash_movements.date es DATE sin hora:
    // comparar contra strings YYYY-MM-DD vía to_char evita toda
    // ambigüedad de zona horaria (regla PREREQ-1).
    const movementRows = await db
      .select({
        dateKey: sql<string>`to_char(${schema.cashMovements.date}, 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(schema.cashMovements)
      .where(
        and(
          eq(schema.cashMovements.accountId, result.account.id),
          gte(sql`${schema.cashMovements.date}::text`, `${month}-01`),
          lt(sql`${schema.cashMovements.date}::text`, `${nextMonthKey}-01`)
        )
      )
      .groupBy(schema.cashMovements.date);

    const movementCountByDate = new Map(
      movementRows.map((r) => [r.dateKey, Number(r.count)])
    );

    res.json(buildMonthCalendar(month, snapshots, movementCountByDate));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el calendario";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/portfolio/metrics — métricas de cartera (F3-A1, D11)
//
// Calcula, desde portfolio_snapshots del usuario: volatilidad
// anualizada, Sharpe (rf ANUAL, default 0), máxima caída, retorno
// del período y YTD — usando las funciones PURAS de metrics.ts.
// La correlación vs Merval (^MERV) se alinea por fecha contra la
// serie diaria de Yahoo (fetchYahooDaily: nunca lanza → si Yahoo
// falla queda null, degradando sin romper).
//
// Query: days (default 90, max 365) | from | to | rf (default 0).
// ============================================================

const metricsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from debe ser YYYY-MM-DD").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to debe ser YYYY-MM-DD").optional(),
  days: z.coerce.number().int().positive().max(365).optional(),
  rf: z.coerce.number().optional(), // tasa libre de riesgo ANUAL; default 0 (D11)
});

router.get("/metrics", async (req: Request, res: Response) => {
  const parsed = metricsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const days = Math.min(parsed.data.days ?? 90, 365);

    // Rango en días ART (misma convención que /history, PREREQ-1).
    const to = parsed.data.to
      ? new Date(`${parsed.data.to}T03:00:00Z`)
      : addArtDays(artStartOfDay(), 1);
    const from = parsed.data.from
      ? new Date(`${parsed.data.from}T03:00:00Z`)
      : addArtDays(artStartOfDay(), -(days - 1));

    const snapshots = await db
      .select()
      .from(schema.portfolioSnapshots)
      .where(
        and(
          eq(schema.portfolioSnapshots.accountId, result.account.id),
          gte(schema.portfolioSnapshots.capturedAt, from),
          lt(schema.portfolioSnapshots.capturedAt, to)
        )
      )
      .orderBy(asc(schema.portfolioSnapshots.capturedAt));

    const values = snapshots.map((s) => Number(s.totalValue));
    const points = snapshots.map((s) => ({
      date: artDateKeyFromUtc(s.capturedAt),
      value: Number(s.totalValue),
    }));
    const returns = dailyReturns(values);
    const rf = parsed.data.rf ?? 0;

    // Benchmark Merval (^MERV) alineado por fecha a los snapshots.
    const merval = await fetchYahooDaily("^MERV");
    const alignedValues: number[] = [];
    const alignedMerval: number[] = [];
    for (const s of snapshots) {
      const key = artDateKeyFromUtc(s.capturedAt);
      // cierre en o antes de la fecha del snapshot (serie Yahoo ordenada)
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
    const message = err instanceof Error ? err.message : "Error al calcular las métricas";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/portfolio/reports — cierres mensuales (comparativa)
// ============================================================

router.get("/reports", async (req: Request, res: Response) => {
  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const closes = await provider.getMonthlyCloses(creds, result.account.iolAccountNumber);
    res.json({ closes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar los reportes";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// GET /api/portfolio/reports/:month — reporte mensual completo
// ============================================================

router.get("/reports/:month", async (req: Request, res: Response) => {
  const monthParam = req.params.month;
  const month = Array.isArray(monthParam) ? monthParam[0] : monthParam;

  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Formato de mes inválido. Usá YYYY-MM (ej: 2026-07)" });
    return;
  }

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const report = await provider.getMonthlyReport(creds, result.account.iolAccountNumber, month);
    res.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el reporte";
    res.status(502).json({ error: message });
  }
});

export default router;
