import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import type { ToolDefinition } from "../types.js";

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
