import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import type { ToolDefinition } from "../types.js";
import { parseIolMovements } from "../../reports/iolMovementsParser.js";
import {
  fetchOperationsLike,
  getConfirmedMovements,
  getSnapshotPair,
} from "../../reports/reconciliationData.js";
import { reconcileDay } from "../../reports/reconciliation.js";

// ============================================================
// get_movements — cash_movements listing (P1 thin-wrapper)
// Thin-wrapper over drizzle cashMovements, multitenant by ctx.account.
// Parity to GET /api/portfolio/movements (movementColumns/toMovementRow).
// Caps output to avoid context overflow, never throws.
// ============================================================

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá YYYY-MM-DD");

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

function toLine(row: MovementRow): string {
  return `- ${row.id} | ${row.dateKey} | ${Number(row.amount).toLocaleString("es-AR", { maximumFractionDigits: 2 })} ${row.currency} ${row.type} ${row.source} ${row.status}${row.description ? ` | ${row.description}` : ""}`;
}

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

const MAX_MOVEMENTS = 200;

export const getMovementsTool: ToolDefinition = {
  name: "get_movements",
  description:
    "Movimientos de efectivo de la cuenta del usuario (aportes, retiros, dividendos, cauciones) con filtros opcionales por fecha (from/to YYYY-MM-DD), origen (iol/manual), estado (pending/confirmed), moneda y tipo. Parity a GET /api/portfolio/movements, multitenant por accountId.",
  inputSchema: z.object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    source: z.enum(["iol", "manual"]).optional(),
    status: z.enum(["pending", "confirmed"]).optional(),
    currency: z.string().max(10).optional(),
    type: z.string().max(20).optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as {
      from?: string;
      to?: string;
      source?: "iol" | "manual";
      status?: "pending" | "confirmed";
      currency?: string;
      type?: string;
    };

    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Movimientos: down — timeout 15s" };
      }

      // Map spec enums to DB enums: iol -> imported, manual -> manual
      const dbSource = args.source === "iol" ? "imported" : args.source === "manual" ? "manual" : undefined;
      // DB status values: pending | confirmed | rejected ; spec allows pending|confirmed
      const dbStatus = args.status;

      const conditions: ReturnType<typeof eq>[] = [eq(schema.cashMovements.accountId, ctx.account.id) as never];

      if (args.from) conditions.push(sql`${schema.cashMovements.date} >= ${args.from}` as never);
      if (args.to) conditions.push(sql`${schema.cashMovements.date} <= ${args.to}` as never);
      if (dbSource) conditions.push(eq(schema.cashMovements.source, dbSource as never));
      if (dbStatus) conditions.push(eq(schema.cashMovements.status, dbStatus as never));
      if (args.currency) conditions.push(eq(schema.cashMovements.currency, args.currency as never));
      if (args.type) conditions.push(eq(schema.cashMovements.type, args.type as never));

      const rows = (await db
        .select(movementColumns)
        .from(schema.cashMovements)
        .where(and(...(conditions as never[])))
        .orderBy(desc(schema.cashMovements.date), desc(schema.cashMovements.createdAt))) as unknown as MovementRow[];

      const total = rows.length;
      if (total === 0) {
        return { ok: true, message: "Movimientos: sin resultados (total 0)" };
      }

      const capped = total > MAX_MOVEMENTS;
      const slice = capped ? rows.slice(0, MAX_MOVEMENTS) : rows;
      const lines = slice.map(toLine).join("\n");
      const suffix = capped ? ` (mostrando ${slice.length} de ${total} — filtrá por from/to/source/status)` : ` (total ${total})`;
      return { ok: true, message: `Movimientos${suffix}:\n${lines}` };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "Movimientos: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `Movimientos: error — ${err instanceof Error ? err.message : "Error al listar movimientos"}`,
      };
    }
  },
};

// ============================================================
// create_movement — POST /api/portfolio/movements
// Parity a la ruta: source='manual', status='confirmed' por defecto.
// INSERT drizzle con dedup unique; maneja 23505 como duplicado.
// ============================================================

export const createMovementTool: ToolDefinition = {
  name: "create_movement",
  description:
    "Registra un movimiento manual de efectivo (aporte, retiro, dividendo, caución, ajuste). Parity a POST /api/portfolio/movements: inserta en cash_movements con source manual y status confirmed. Requiere date (YYYY-MM-DD), amount firmado, currency ARS|USD, type y description opcional.",
  inputSchema: z.object({
    date: dateSchema,
    amount: z.number({ message: "amount debe ser un número (firmado)" }),
    currency: z.enum(["ARS", "USD"]),
    type: z.enum(["deposit", "withdrawal", "dividend", "caucion", "adjustment"]),
    description: z.string().max(500).optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as {
      date: string;
      amount: number;
      currency: "ARS" | "USD";
      type: "deposit" | "withdrawal" | "dividend" | "caucion" | "adjustment";
      description?: string;
    };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "create_movement: down — timeout 15s" };
      }
      const [inserted] = await db
        .insert(schema.cashMovements)
        .values({
          accountId: ctx.account.id,
          date: sql`${args.date}::date`,
          amount: String(args.amount),
          currency: args.currency,
          type: args.type,
          source: "manual",
          status: "confirmed",
          description: args.description ?? null,
        })
        .returning(movementColumns);

      const row = toMovementRow(inserted as unknown as MovementRow);
      return {
        ok: true,
        message: `Movimiento creado: ${row.id} | ${row.date} | ${row.amount} ${row.currency} ${row.type} ${row.source} ${row.status}${row.description ? ` | ${row.description}` : ""}`,
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "create_movement: down — timeout 15s" };
      }
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        return { ok: false, message: "Ese movimiento ya existe (movimiento duplicado)" };
      }
      return {
        ok: false,
        message: `create_movement: error — ${err instanceof Error ? err.message : "Error al crear el movimiento"}`,
      };
    }
  },
};

// ============================================================
// patch_movement — PATCH /api/portfolio/movements/:id
// Solo pending → confirmed/rejected (setea decided_at). Parity total.
// ============================================================

export const patchMovementTool: ToolDefinition = {
  name: "patch_movement",
  description:
    "Decide un movimiento pendiente (pending → confirmed/rejected). Parity a PATCH /api/portfolio/movements/:id: solo pendientes pueden modificarse, setea decided_at. Requiere id y status confirmed|rejected, description opcional.",
  inputSchema: z.object({
    id: z.string().min(1, "id requerido"),
    status: z.enum(["confirmed", "rejected"]),
    description: z.string().max(500).optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { id: string; status: "confirmed" | "rejected"; description?: string };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "patch_movement: down — timeout 15s" };
      }
      const [existing] = await db
        .select(movementColumns)
        .from(schema.cashMovements)
        .where(and(eq(schema.cashMovements.accountId, ctx.account.id), eq(schema.cashMovements.id, args.id)))
        .limit(1);

      if (!existing) {
        return { ok: false, message: "Movimiento no encontrado" };
      }
      if ((existing as unknown as MovementRow).status !== "pending") {
        return { ok: false, message: "Solo los movimientos pendientes pueden modificarse" };
      }

      const [updated] = await db
        .update(schema.cashMovements)
        .set({
          status: args.status,
          description: args.description ?? (existing as unknown as MovementRow).description,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.cashMovements.id, args.id))
        .returning(movementColumns);

      const row = toMovementRow(updated as unknown as MovementRow);
      return {
        ok: true,
        message: `Movimiento ${row.id} actualizado a ${row.status} | ${row.date} | ${row.amount} ${row.currency} ${row.type}${row.description ? ` | ${row.description}` : ""}`,
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "patch_movement: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `patch_movement: error — ${err instanceof Error ? err.message : "Error al actualizar el movimiento"}`,
      };
    }
  },
};

// ============================================================
// delete_movement — DELETE /api/portfolio/movements/:id
// Solo pending/rejected. Parity a la ruta.
// ============================================================

export const deleteMovementTool: ToolDefinition = {
  name: "delete_movement",
  description:
    "Elimina un movimiento pendiente o rechazado. Parity a DELETE /api/portfolio/movements/:id: solo pending/rejected pueden eliminarse (confirmed no). Requiere id.",
  inputSchema: z.object({
    id: z.string().min(1, "id requerido"),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { id: string };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "delete_movement: down — timeout 15s" };
      }
      const [existing] = await db
        .select(movementColumns)
        .from(schema.cashMovements)
        .where(and(eq(schema.cashMovements.accountId, ctx.account.id), eq(schema.cashMovements.id, args.id)))
        .limit(1);

      if (!existing) {
        return { ok: false, message: "Movimiento no encontrado" };
      }
      const st = (existing as unknown as MovementRow).status;
      if (st !== "pending" && st !== "rejected") {
        return { ok: false, message: "Solo los movimientos pendientes o rechazados pueden eliminarse" };
      }

      await db.delete(schema.cashMovements).where(eq(schema.cashMovements.id, args.id));

      return { ok: true, message: `Movimiento ${args.id} eliminado` };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "delete_movement: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `delete_movement: error — ${err instanceof Error ? err.message : "Error al eliminar el movimiento"}`,
      };
    }
  },
};

// ============================================================
// import_movements_preview — POST /api/portfolio/movements/import
// NO inserta: parsea el HTML crudo del export IOL y devuelve
// preview + summary + errors. El agente pasa htmlContent como string
// (no file upload real: el usuario pega el contenido o el agente lo
// genera). Parity total al parser iolMovementsParser.
// ============================================================

const MAX_PREVIEW_ROWS = 50;

export const importMovementsPreviewTool: ToolDefinition = {
  name: "import_movements_preview",
  description:
    "Preview del export IOL de movimientos (HTML crudo .xls). Parity a POST /api/portfolio/movements/import: parsea sin insertar, devuelve filas parseadas + flags de validación. El contenido del archivo se pasa como string htmlContent (no multipart).",
  inputSchema: z.object({
    htmlContent: z.string().min(1, "htmlContent requerido").max(10_000_000, "htmlContent demasiado grande (max 10MB)"),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { htmlContent: string };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "import_movements_preview: down — timeout 15s" };
      }
      const parsed = parseIolMovements(args.htmlContent);
      const total = parsed.summary.total;
      if (total === 0 && parsed.errors.length > 0) {
        return { ok: false, message: `Preview: sin filas — ${parsed.errors.join(" | ")}` };
      }
      const lines = parsed.movements.slice(0, MAX_PREVIEW_ROWS).map((mv) => {
        const flag = mv.valid ? "valid" : `invalid: ${mv.validationError ?? "error"}`;
        return `- fila ${mv.row} | nroMov ${mv.nroMov || "—"} | ${mv.liquidDate ?? "sin fecha"} | ${mv.monto} ${mv.currency} ${mv.tipo} | ${flag}${mv.tipoMov ? ` | ${mv.tipoMov}` : ""}`;
      });
      const capped = total > MAX_PREVIEW_ROWS ? ` (mostrando ${MAX_PREVIEW_ROWS} de ${total})` : "";
      const header = `Preview import IOL${capped}: total ${parsed.summary.total}, válidos ${parsed.summary.valid}, inválidos ${parsed.summary.invalid} | por tipo ${JSON.stringify(parsed.summary.byType)}${parsed.errors.length ? ` | errores: ${parsed.errors.join(" | ")}` : ""}`;
      const body = lines.length ? `\n${lines.join("\n")}` : "\n(sin filas)";
      return { ok: true, message: `${header}${body}` };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "import_movements_preview: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `import_movements_preview: error — ${err instanceof Error ? err.message : "Error al parsear el export"}`,
      };
    }
  },
};

// ============================================================
// import_movements_confirm — POST /api/portfolio/movements/import/confirm
// Inserta con dedup por (account_id, date, amount, currency, type, source)
// Parity total a la ruta. Rows vienen del preview validado.
// ============================================================

export const importMovementsConfirmTool: ToolDefinition = {
  name: "import_movements_confirm",
  description:
    "Confirma e inserta filas validadas del preview IOL. Parity a POST /api/portfolio/movements/import/confirm: dedup por (accountId, date, amount, currency, type, source imported) — las existentes se cuentan como skipped. Cada fila: nroMov, liquidDate (YYYY-MM-DD o null), monto firmado, currency ARS|USD, tipo, tipoMov opcional.",
  inputSchema: z.object({
    rows: z
      .array(
        z.object({
          nroMov: z.string().min(1),
          liquidDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "liquidDate debe ser YYYY-MM-DD")
            .nullable(),
          monto: z.number(),
          currency: z.enum(["ARS", "USD"]),
          tipo: z.enum(["deposit", "withdrawal", "dividend", "caucion", "adjustment"]),
          tipoMov: z.string().optional(),
        })
      )
      .min(1, "rows debe tener al menos 1 fila")
      .max(2000, "demasiadas filas (max 2000)"),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as {
      rows: Array<{
        nroMov: string;
        liquidDate: string | null;
        monto: number;
        currency: "ARS" | "USD";
        tipo: "deposit" | "withdrawal" | "dividend" | "caucion" | "adjustment";
        tipoMov?: string;
      }>;
    };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "import_movements_confirm: down — timeout 15s" };
      }
      let imported = 0;
      let skipped = 0;
      for (const mv of args.rows) {
        if (!mv.liquidDate) {
          skipped++;
          continue;
        }
        const [existing] = await db
          .select({ id: schema.cashMovements.id })
          .from(schema.cashMovements)
          .where(
            and(
              eq(schema.cashMovements.accountId, ctx.account.id),
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
          accountId: ctx.account.id,
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

      return { ok: true, message: `Import confirm: ${imported} importados, ${skipped} omitidos (duplicados o sin fecha)` };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "import_movements_confirm: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `import_movements_confirm: error — ${err instanceof Error ? err.message : "Error al confirmar el import"}`,
      };
    }
  },
};

// ============================================================
// reconcile — POST /api/portfolio/reconcile (preview, sin insertar)
// Parity a la ruta: snapshot pair (prev,hoy) + ops/movimientos del
// rango → suggestions por moneda (ARS/USD) con deltaCash, expected,
// unexplained, thresholdExceeded, movement.
// ============================================================

export const reconcileTool: ToolDefinition = {
  name: "reconcile",
  description:
    "Reconciliación de efectivo on-demand (preview, no inserta). Parity a POST /api/portfolio/reconcile: usa el par de snapshots (previo, hoy) y operaciones/movimientos del rango para sugerir movimientos detected pendientes por moneda (ARS/USD) si |unexplained| supera el umbral. Param date opcional YYYY-MM-DD para elegir el snapshot hoy.",
  inputSchema: z.object({
    date: dateSchema.optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { date?: string };
    try {
      if (ctx.signal.aborted) {
        return { ok: false, message: "reconcile: down — timeout 15s" };
      }
      const { prev, today } = await getSnapshotPair(ctx.account.id, args.date);
      if (!prev || !today) {
        return { ok: true, message: `Reconcile: sin snapshots suficientes para ${args.date ?? "hoy"} (se necesitan al menos 2)` };
      }

      const from = prev.date;
      const to = today.date;
      const account = {
        id: ctx.account.id,
        userId: ctx.userId,
        iolAccountNumber: ctx.account.iolAccountNumber,
      };

      const [operations, movements] = await Promise.all([
        fetchOperationsLike(account, from, to),
        getConfirmedMovements(ctx.account.id, from, to),
      ]);

      const suggestions = (["ARS", "USD"] as const).map((currency) =>
        reconcileDay({
          currency,
          prevSnapshot: prev,
          todaySnapshot: today,
          operations,
          movements,
        })
      );

      const lines = suggestions.map((r) => {
        const mv = r.movement
          ? ` → sugerencia ${r.movement.type} ${r.movement.amount} ${r.movement.currency} | ${r.movement.message}${r.movement.suggestedType ? ` (sugerido: ${r.movement.suggestedType})` : ""}`
          : " → sin movimiento sugerido";
        return `- ${r.currency}: deltaCash ${r.deltaCash}, expected ${r.expected}, unexplained ${r.unexplained}, umbral ${r.thresholdExceeded ? "superado" : "ok"}${mv}`;
      });

      return {
        ok: true,
        message: `Reconcile ${today.date} (rango ${from} → ${to}):\n${lines.join("\n")}`,
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: "reconcile: down — timeout 15s" };
      }
      return {
        ok: false,
        message: `reconcile: error — ${err instanceof Error ? err.message : "Error al reconciliar"}`,
      };
    }
  },
};
