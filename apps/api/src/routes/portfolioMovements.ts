import express, { Router, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getAccountForUser } from "../services/agent/account.js";
import { db, schema } from "../db/index.js";
import {
  getConfirmedMovements,
  getSnapshotPair,
  fetchOperationsLike,
  type ReconcileAccount,
} from "../services/reports/reconciliationData.js";
import { reconcileDay } from "../services/reports/reconciliation.js";
import { parseIolMovements } from "../services/reports/iolMovementsParser.js";

const router = Router();
router.use(requireAuth);

// getAccountForUser vive en services/agent/account.ts (helper compartido
// con los tools del agente): mismo gate multitenant en toda la app.

// ============================================================
// Helpers de mapeo
// ============================================================

type MovementRow = {
  id: string;
  dateKey: string;
  amount: number | string;
  currency: string;
  type: string;
  source: string;
  status: string;
  description: string | null;
  iolReference: string | null;
  createdAt: Date;
  decidedAt: Date | null;
};

const movementColumns = {
  id: schema.cashMovements.id,
  dateKey: sql<string>`to_char(${schema.cashMovements.date}, 'YYYY-MM-DD')`,
  amount: schema.cashMovements.amount,
  currency: schema.cashMovements.currency,
  type: schema.cashMovements.type,
  source: schema.cashMovements.source,
  status: schema.cashMovements.status,
  description: schema.cashMovements.description,
  iolReference: schema.cashMovements.iolReference,
  createdAt: schema.cashMovements.createdAt,
  decidedAt: schema.cashMovements.decidedAt,
};

function toMovementRow(row: MovementRow) {
  return {
    id: row.id,
    date: row.dateKey,
    amount: Number(row.amount),
    currency: row.currency,
    type: row.type,
    source: row.source,
    status: row.status,
    description: row.description,
    iolReference: row.iolReference,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

// ============================================================
// GET /api/portfolio/movements — lista cash_movements (multitenant)
// Filtros opcionales: from, to, source, status, currency, type.
// ============================================================

const listQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from debe ser YYYY-MM-DD").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to debe ser YYYY-MM-DD").optional(),
  source: z.enum(["manual", "imported", "detected"]).optional(),
  status: z.enum(["confirmed", "pending", "rejected"]).optional(),
  currency: z.enum(["ARS", "USD"]).optional(),
  type: z.enum(["deposit", "withdrawal", "dividend", "caucion", "adjustment"]).optional(),
});

router.get("/movements", async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
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
    const conditions = [eq(schema.cashMovements.accountId, result.account.id)];
    if (parsed.data.from) conditions.push(sql`${schema.cashMovements.date} >= ${parsed.data.from}`);
    if (parsed.data.to) conditions.push(sql`${schema.cashMovements.date} <= ${parsed.data.to}`);
    if (parsed.data.source) conditions.push(eq(schema.cashMovements.source, parsed.data.source));
    if (parsed.data.status) conditions.push(eq(schema.cashMovements.status, parsed.data.status));
    if (parsed.data.currency) conditions.push(eq(schema.cashMovements.currency, parsed.data.currency));
    if (parsed.data.type) conditions.push(eq(schema.cashMovements.type, parsed.data.type));

    const rows = await db
      .select(movementColumns)
      .from(schema.cashMovements)
      .where(and(...conditions))
      .orderBy(desc(schema.cashMovements.date), desc(schema.cashMovements.createdAt));

    res.json({ movements: rows.map(toMovementRow) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al listar los movimientos";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// POST /api/portfolio/movements — registro manual
// source='manual', status='confirmed' por defecto (spec F3-B6).
// ============================================================

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe ser YYYY-MM-DD"),
  amount: z.number({ message: "amount debe ser un número (firmado)" }),
  currency: z.enum(["ARS", "USD"]),
  type: z.enum(["deposit", "withdrawal", "dividend", "caucion", "adjustment"]),
  description: z.string().max(500).optional(),
});

router.post("/movements", async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const [inserted] = await db
      .insert(schema.cashMovements)
      .values({
        accountId: result.account.id,
        date: sql`${parsed.data.date}::date`,
        amount: String(parsed.data.amount),
        currency: parsed.data.currency,
        type: parsed.data.type,
        source: "manual",
        status: "confirmed",
        description: parsed.data.description ?? null,
      })
      .returning(movementColumns);

    res.status(201).json({ movement: toMovementRow(inserted as MovementRow) });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      res.status(409).json({ error: "Ese movimiento ya existe (movimiento duplicado)" });
      return;
    }
    const message = err instanceof Error ? err.message : "Error al crear el movimiento";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// PATCH /api/portfolio/movements/:id — decidir un movimiento
// Solo pending → confirm/reject (setea decided_at). spec F3-B6.
// ============================================================

const patchSchema = z.object({
  status: z.enum(["confirmed", "rejected"]),
  description: z.string().max(500).optional(),
});

router.patch("/movements/:id", async (req: Request, res: Response) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  const id = req.params.id as string;
  try {
    const [existing] = await db
      .select(movementColumns)
      .from(schema.cashMovements)
      .where(
        and(
          eq(schema.cashMovements.accountId, result.account.id),
          eq(schema.cashMovements.id, id)
        )
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Movimiento no encontrado" });
      return;
    }
    if (existing.status !== "pending") {
      res.status(409).json({ error: "Solo los movimientos pendientes pueden modificarse" });
      return;
    }

    const [updated] = await db
      .update(schema.cashMovements)
      .set({
        status: parsed.data.status,
        description: parsed.data.description ?? existing.description,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.cashMovements.id, id))
      .returning(movementColumns);

    res.json({ movement: toMovementRow(updated as MovementRow) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al actualizar el movimiento";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// DELETE /api/portfolio/movements/:id — eliminar
// Solo pending/rejected (spec: "solo pending/rejected").
// ============================================================

router.delete("/movements/:id", async (req: Request, res: Response) => {
  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  const id = req.params.id as string;
  try {
    const [existing] = await db
      .select(movementColumns)
      .from(schema.cashMovements)
      .where(
        and(
          eq(schema.cashMovements.accountId, result.account.id),
          eq(schema.cashMovements.id, id)
        )
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Movimiento no encontrado" });
      return;
    }
    if (existing.status !== "pending" && existing.status !== "rejected") {
      res.status(409).json({ error: "Solo los movimientos pendientes o rechazados pueden eliminarse" });
      return;
    }

    await db
      .delete(schema.cashMovements)
      .where(eq(schema.cashMovements.id, id));

    res.status(204).end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al eliminar el movimiento";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// POST /api/portfolio/reconcile — reconciliación on-demand (preview)
// Devuelve las sugerencias por moneda SIN insertar (spec F3-B6:
// el detected se crea en el job diario o se confirma manual). Usa
// el snapshot pair (prev,hoy) y las operaciones/movimientos del rango.
// ============================================================

const reconcileSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe ser YYYY-MM-DD").optional(),
});

router.post("/reconcile", async (req: Request, res: Response) => {
  const parsed = reconcileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    // Necesitamos userId + iolAccountNumber para las operaciones IOL.
    const [acctRow] = await db
      .select({
        userId: schema.accounts.userId,
        iolAccountNumber: schema.accounts.iolAccountNumber,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, result.account.id))
      .limit(1);

    const account: ReconcileAccount = {
      id: result.account.id,
      userId: acctRow?.userId ?? result.account.id,
      iolAccountNumber: acctRow?.iolAccountNumber ?? result.account.iolAccountNumber,
    };

    const { prev, today } = await getSnapshotPair(account.id, parsed.data.date);
    if (!prev || !today) {
      res.json({ date: parsed.data.date ?? null, suggestions: [] });
      return;
    }

    const from = prev.date;
    const to = today.date;
    const [operations, movements] = await Promise.all([
      fetchOperationsLike(account, from, to),
      getConfirmedMovements(account.id, from, to),
    ]);

    const suggestions = (["ARS", "USD"] as const)
      .map((currency) => {
        const r = reconcileDay({
          currency,
          prevSnapshot: prev,
          todaySnapshot: today,
          operations,
          movements,
        });
        return {
          currency: r.currency,
          deltaCash: r.deltaCash,
          expected: r.expected,
          unexplained: r.unexplained,
          thresholdExceeded: r.thresholdExceeded,
          movement: r.movement,
        };
      });

    res.json({ date: today.date, suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al reconciliar";
    res.status(502).json({ error: message });
  }
});

// ============================================================
// POST /api/portfolio/movements/import — PREVIEW del export IOL (F3-6)
// El cuerpo es el HTML CRUDO del export (se acepta texto plano, no
// multipart/multer: el archivo IOL es HTML de texto y el spec pedía
// multipart solo si xlsx lo exigía — no aplica). NO inserta: devuelve
// las filas parseadas + flags de validación para revisión humana.
// ============================================================

router.post(
  "/movements/import",
  express.text({ type: "*/*", limit: "10mb" }),
  async (req: Request, res: Response) => {
    const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
    if (!result.ok) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    const html = typeof req.body === "string" ? req.body : "";
    const parsed = parseIolMovements(html);
    res.json({
      preview: parsed.movements.map((mv) => ({
        row: mv.row,
        parsed: mv,
        valid: mv.valid,
        errors: mv.validationError ? [mv.validationError] : [],
      })),
      summary: parsed.summary,
      errors: parsed.errors,
    });
  }
);

// ============================================================
// POST /api/portfolio/movements/import/confirm — inserta con hash dedup
// Cuerpo: { rows: [...] } (las filas validadas a importar). Dedup por
// (account_id, date, amount, currency, type, source) → las ya existentes
// se cuentan como skipped (spec F3-C1).
// ============================================================

const importConfirmSchema = z.object({
  rows: z
    .array(
      z.object({
        nroMov: z.string(),
        liquidDate: z.string().nullable(),
        monto: z.number(),
        currency: z.enum(["ARS", "USD"]),
        tipo: z.enum(["deposit", "withdrawal", "dividend", "caucion", "adjustment"]),
        tipoMov: z.string().optional(),
      })
    )
    .default([]),
});

router.post("/movements/import/confirm", async (req: Request, res: Response) => {
  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  const parsed = importConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", details: parsed.error.flatten() });
    return;
  }
  const accountId = result.account.id;
  let imported = 0;
  let skipped = 0;

  for (const mv of parsed.data.rows) {
    if (!mv.liquidDate) {
      skipped++;
      continue;
    }
    const [existing] = await db
      .select({ id: schema.cashMovements.id })
      .from(schema.cashMovements)
      .where(
        and(
          eq(schema.cashMovements.accountId, accountId),
          eq(schema.cashMovements.date, sql`${mv.liquidDate}::date`),
          eq(schema.cashMovements.amount, String(mv.monto)),
          eq(schema.cashMovements.currency, mv.currency),
          eq(schema.cashMovements.type, mv.tipo),
          eq(schema.cashMovements.source, "imported")
        )
      )
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(schema.cashMovements).values({
      accountId,
      date: sql`${mv.liquidDate}::date`,
      amount: String(mv.monto),
      currency: mv.currency,
      type: mv.tipo,
      source: "imported",
      status: "pending",
      description: mv.tipoMov ?? null,
      iolReference: mv.nroMov,
    });
    imported++;
  }

  res.json({ imported, skipped });
});

export default router;
