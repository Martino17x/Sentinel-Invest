import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getBrokerProvider } from "../../../infraestructura/providers/registry.js";
import { getBrokerCredentials } from "../../../lib/broker-credentials.js";
import { BrokerNotEnabled } from "../../../services/iol/types.js";
import type { BrokerType } from "../../../services/iol/ports.js";
import { auditAgentAction } from "../../../aplicacion/agente/audit.js";
import { OrdersService, OrderServiceError } from "../../../aplicacion/operar/OrdersService.js";
import { SettlementType } from "@sentinel/domain";
import type { TradingPort, FciPort, MarketDataPort } from "../../../services/iol/ports.js";

function parseBrokerType(req: Request): BrokerType {
  const raw = (req.query.broker as string) || (req.body?.brokerType as string) || (req.body?.broker as string) || (req.headers["x-broker-type"] as string) || "iol";
  return (String(raw).toLowerCase() === "ppi" ? "ppi" : "iol") as BrokerType;
}

const router = Router();
router.use(requireAuth);

// ============================================================
// POST /api/orders — delega a OrdersService (SDD8).
// Ruta es adaptador delgado: Zod parse → service → HTTP.
// Gate, validación D→bcba, limit sin price, credenciales,
// price-ref y audit viven en aplicacion/operar.
// ============================================================

const createOrderSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  side: z.enum(["buy", "sell"]),
  qty: z.number().positive("La cantidad debe ser mayor a cero"),
  priceType: z.enum(["market", "limit"]).default("market"),
  price: z.number().positive("El precio debe ser mayor a cero").optional(),
  market: z.enum(["bcba", "nyse", "nasdaq", "bonds"]).default("bcba"),
  term: z.enum(["t0", "t1", "t2"]).optional(),
  validity: z.enum(["1d", "7d"]).optional(),
  specie: z.nativeEnum(SettlementType).optional(),
});

const fciSubscribeSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  amount: z.number().positive("El monto debe ser mayor a cero"),
});

const fciRescueSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  quantity: z.number().positive("La cantidad debe ser mayor a cero"),
});

async function createOrdersService(brokerType: BrokerType, userId: string): Promise<OrdersService> {
  const provider = await getBrokerProvider(brokerType, userId);
  return new OrdersService({
    tradingPort: provider as unknown as TradingPort,
    fciPort: provider as unknown as FciPort,
    marketDataPort: provider as unknown as MarketDataPort,
    audit: auditAgentAction,
    getCredentials: (uid: string) => getBrokerCredentials(uid, brokerType),
  });
}

function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof BrokerNotEnabled) {
    res.status(503).json({ error: err.message, code: "broker_not_enabled" });
    return;
  }
  if (err instanceof OrderServiceError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Error al ejecutar la orden";
  res.status(502).json({ error: message });
}

// POST /api/orders — crear orden de compra/venta (incluye MEP con specie D)
router.post("/", async (req: Request, res: Response) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    await auditAgentAction({
      userId: req.user!.id,
      tool: "place_order",
      args: req.body,
      resultStatus: "validation_error",
      clientName: "api:orders",
      errorMessage: parsed.error.issues[0]?.message ?? "Parámetros inválidos",
    });
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }

  try {
    const brokerType = parseBrokerType(req);
    const svc = await createOrdersService(brokerType, req.user!.id);
    const result = await svc.placeOrder(parsed.data as never, { id: req.user!.id });
    res.json({ ok: true, orderId: result.iolOperationId, status: result.status, message: result.message });
  } catch (err) {
    handleServiceError(err, res);
  }
});

// POST /api/orders/fci/subscribe — suscribir a un FCI
router.post("/fci/subscribe", async (req: Request, res: Response) => {
  const parsed = fciSubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }
  try {
    const brokerType = parseBrokerType(req);
    const svc = await createOrdersService(brokerType, req.user!.id);
    const result = await svc.subscribeFci(parsed.data, { id: req.user!.id });
    res.json({ ok: true, orderId: result.iolOperationId, status: result.status, message: result.message });
  } catch (err) {
    handleServiceError(err, res);
  }
});

// POST /api/orders/fci/rescue — rescatar cuotapartes de un FCI
router.post("/fci/rescue", async (req: Request, res: Response) => {
  const parsed = fciRescueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }
  try {
    const brokerType = parseBrokerType(req);
    const svc = await createOrdersService(brokerType, req.user!.id);
    const result = await svc.rescueFci(parsed.data, { id: req.user!.id });
    res.json({ ok: true, orderId: result.iolOperationId, status: result.status, message: result.message });
  } catch (err) {
    handleServiceError(err, res);
  }
});

// POST /api/orders/:numero/cancel — cancelar una operación pendiente
router.post("/:numero/cancel", async (req: Request, res: Response) => {
  const numeroParam = req.params.numero;
  const operationNumber = Array.isArray(numeroParam) ? numeroParam[0] : numeroParam;
  if (!operationNumber || operationNumber.trim() === "") {
    res.status(400).json({ error: "Falta el número de operación" });
    return;
  }
  try {
    const brokerType = parseBrokerType(req);
    const svc = await createOrdersService(brokerType, req.user!.id);
    const result = await svc.cancelOrder(operationNumber, { id: req.user!.id });
    res.json({ ok: true, orderId: result.iolOperationId, status: result.status, message: result.message });
  } catch (err) {
    handleServiceError(err, res);
  }
});

export default router;
