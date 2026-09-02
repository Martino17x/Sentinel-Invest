import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getBrokerProvider } from "../../../infraestructura/providers/registry.js";
import { getBrokerCredentials } from "../../../lib/broker-credentials.js";
import { BrokerNotEnabled } from "../../../services/iol/types.js";
import type { BrokerType } from "../../../services/iol/ports.js";

function parseBrokerType(req: Request): BrokerType {
  const raw =
    (req.query.broker as string) ||
    (req.body?.brokerType as string) ||
    (req.headers["x-broker-type"] as string) ||
    "iol";
  return (raw.toLowerCase() === "ppi" ? "ppi" : "iol") as BrokerType;
}

const router = Router();
router.use(requireAuth);

// ============================================================
// GET /api/operations — historial de operaciones
// ============================================================

router.get("/", async (req: Request, res: Response) => {
  const accountId = req.query.accountId as string | undefined;

  if (accountId) {
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));

    if (!account || account.userId !== req.user!.id) {
      res.status(404).json({ error: "Cuenta no encontrada" });
      return;
    }
  }

  try {
    const brokerType = parseBrokerType(req);
    const creds = await getBrokerCredentials(req.user!.id, brokerType);
    const provider = await getBrokerProvider(brokerType, req.user!.id);
    // accountId → accountNumber resolution mantiene compat iolAccountNumber
    let accountNumber = accountId ?? "";
    if (accountId) {
      const [acc] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, accountId));
      accountNumber = (acc as any)?.brokerAccountNumber ?? acc?.iolAccountNumber ?? accountId;
    }
    const filters: Record<string, string> = {};
    if (typeof req.query.from === "string" && req.query.from) filters.from = req.query.from;
    if (typeof req.query.fechaDesde === "string" && req.query.fechaDesde) filters.from = req.query.fechaDesde as string;
    if (typeof req.query.to === "string" && req.query.to) filters.to = req.query.to as string;
    if (typeof req.query.fechaHasta === "string" && req.query.fechaHasta) filters.to = req.query.fechaHasta as string;
    if (typeof req.query.status === "string" && req.query.status) filters.status = req.query.status as string;
    if (typeof req.query.estado === "string" && req.query.estado) filters.status = req.query.estado as string;
    if (typeof req.query.numero === "string" && req.query.numero) (filters as Record<string, string>).numero = req.query.numero as string;
    if (typeof req.query.pais === "string" && req.query.pais) (filters as Record<string, string>).pais = req.query.pais as string;
    const hasFilters = Object.keys(filters).length > 0;
    const operations = await provider.getOperations(creds, accountNumber, hasFilters ? (filters as never) : undefined);
    res.json({ operations });
  } catch (err) {
    if (err instanceof BrokerNotEnabled) {
      res.status(503).json({ error: err.message, code: "broker_not_enabled" });
      return;
    }
    const message = err instanceof Error ? err.message : "Error al consultar operaciones";
    res.status(502).json({ error: message });
  }
});

export default router;
