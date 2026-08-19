import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

// ============================================================
// pending_orders — órdenes preparadas por el agente (scope chat)
// que esperan confirmación explícita del usuario antes de
// ejecutarse contra IOL (approve/reject).
// ============================================================

export type PendingOrderStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface PendingOrder {
  id: string;
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  status: PendingOrderStatus;
  createdAt: Date;
  decidedAt: Date | null;
}

export async function createPendingOrder(input: {
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(schema.pendingOrders)
    .values({
      userId: input.userId,
      tool: input.tool,
      args: input.args,
      summary: input.summary,
    })
    .returning({ id: schema.pendingOrders.id });
  return { id: row.id };
}

export async function getPendingOrder(id: string, userId: string): Promise<PendingOrder | null> {
  const [row] = await db
    .select()
    .from(schema.pendingOrders)
    .where(and(eq(schema.pendingOrders.id, id), eq(schema.pendingOrders.userId, userId)));
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    tool: row.tool,
    args: row.args,
    summary: row.summary,
    status: row.status,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

export async function setPendingOrderStatus(id: string, status: PendingOrderStatus): Promise<void> {
  await db
    .update(schema.pendingOrders)
    .set({ status, decidedAt: new Date() })
    .where(eq(schema.pendingOrders.id, id));
}
