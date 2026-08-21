import { z } from "zod";
import { getIolProvider } from "../../iol/index.js";
import type { Operation } from "../../iol/types.js";
import type { ToolDefinition } from "../types.js";

// ============================================================
// get_operations — IOL operations listing (P1 thin-wrapper)
// Thin-wrapper over IolProvider.getOperations, no HTTP self-call.
// Maps tool Zod -> OperationFilters, propagates ctx.signal 15s,
// never throws, caps output to avoid context overflow.
// Parity to GET /api/operations.
// ============================================================

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usá YYYY-MM-DD");

function fmtMoney(n: number, currency: string): string {
  const sym = currency === "USD" ? "USD" : "$";
  return `${sym}${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
}

function statusToFilter(status: "pending" | "confirmed" | "cancelled"): Operation["status"] {
  switch (status) {
    case "pending":
      return "pending";
    case "confirmed":
      return "accepted";
    case "cancelled":
      return "cancelled";
  }
}

function matchesMarket(op: Operation, market: "bcba" | "us"): boolean {
  if (market === "bcba") return op.market === "bcba" || op.market === "bonds";
  return op.market === "nyse" || op.market === "nasdaq" || op.market === "crypto";
}

function formatOperations(ops: Operation[], capped: boolean, total: number): string {
  if (ops.length === 0) {
    return `Operaciones: sin resultados (total ${total})`;
  }
  const lines = ops.map(
    (op) =>
      `- ${op.iolOperationId} | ${op.symbol} ${op.market} ${op.type} ${op.status} | ${op.quantity} u. @ ${fmtMoney(op.price, op.currency)} | total ${fmtMoney(op.total, op.currency)} | ${op.date.slice(0, 10)}`,
  );
  const suffix = capped ? ` (mostrando ${ops.length} de ${total} — filtrá por from/to/status/market)` : ` (total ${total})`;
  return `Operaciones${suffix}:\n${lines.join("\n")}`;
}

const MAX_OPS = 150;

export const getOperationsTool: ToolDefinition = {
  name: "get_operations",
  description:
    "Historial de operaciones IOL de la cuenta del usuario: compras/ventas/suscripciones con filtros opcionales por fecha (from/to YYYY-MM-DD), estado (pending/confirmed/cancelled) y mercado (bcba/us). Parity a GET /api/operations.",
  inputSchema: z.object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    status: z.enum(["pending", "confirmed", "cancelled"]).optional(),
    market: z.enum(["bcba", "us"]).optional(),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as {
      from?: string;
      to?: string;
      status?: "pending" | "confirmed" | "cancelled";
      market?: "bcba" | "us";
    };

    // Do not fallback to portfolio history — only getOperations
    try {
      const filters: Record<string, string> = {};
      if (args.from) filters.from = args.from;
      if (args.to) filters.to = args.to;
      if (args.status) filters.status = statusToFilter(args.status);

      const provider = getIolProvider();
      let ops: Operation[];

      // Propagate signal if provider respects AbortSignal via options (best effort).
      // Current IolProvider signature has no signal param — we race with abort.
      if (ctx.signal.aborted) {
        return { ok: false, message: `Operaciones: down — timeout 15s` };
      }

      const abortPromise = new Promise<never>((_, reject) => {
        ctx.signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      });

      ops = await Promise.race([
        provider.getOperations(ctx.creds, ctx.account.iolAccountNumber, filters as never),
        abortPromise,
      ]);

      // Client-side market filter (OperationFilters has no mercado field)
      if (args.market) {
        ops = ops.filter((op) => matchesMarket(op, args.market!));
      }

      const total = ops.length;
      const capped = total > MAX_OPS;
      const slice = capped ? ops.slice(0, MAX_OPS) : ops;

      return {
        ok: true,
        message: formatOperations(slice, capped, total),
      };
    } catch (err) {
      if (ctx.signal.aborted) {
        return { ok: false, message: `Operaciones: down — timeout 15s` };
      }
      return {
        ok: false,
        message: `Operaciones: error — ${err instanceof Error ? err.message : "Error al consultar operaciones"}`,
      };
    }
  },
};
