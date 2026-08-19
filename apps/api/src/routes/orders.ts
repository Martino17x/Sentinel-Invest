import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getIolProvider } from "../services/iol/index.js";
import { getIolCredentials } from "../lib/iol-credentials.js";
import { auditAgentAction } from "../services/agent/audit.js";

const router = Router();
router.use(requireAuth);

// ============================================================
// POST /api/orders — operar contra IOL desde la app (UI).
//
// Mismos switches de seguridad que los tools del agente:
//   IOL_TRADING_ENABLED=true es requisito (403 si falta) y en modo
//   api se exigen credenciales IOL conectadas. En modo mock simula.
// ============================================================

/** Distingue errores del cliente (validación/saldo/permisos de IOL) de fallos del server */
function isIolClientError(message: string): boolean {
  return /Datos de la orden inválidos|rechazó la operación|credenciales de IOL/.test(message);
}

function tradingEnabled(): boolean {
  const v = (process.env.IOL_TRADING_ENABLED ?? "").toLowerCase();
  return v === "true" || v === "1";
}

const IOL_MARKET_CODES: Record<string, string> = {
  bcba: "bCBA",
  nyse: "nYSE",
  nasdaq: "nASDAQ",
  bonds: "bCBA",
};

const createOrderSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  side: z.enum(["buy", "sell"]),
  qty: z.number().positive("La cantidad debe ser mayor a cero"),
  priceType: z.enum(["market", "limit"]).default("market"),
  price: z.number().positive("El precio debe ser mayor a cero").optional(),
  market: z.enum(["bcba", "nyse", "nasdaq", "bonds"]).default("bcba"),
  term: z.enum(["t0", "t1", "t2"]).optional(),
  validity: z.enum(["1d", "7d"]).optional(),
  specie: z.enum(["D"]).optional(),
});

const fciSubscribeSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  amount: z.number().positive("El monto debe ser mayor a cero"),
});

const fciRescueSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
  quantity: z.number().positive("La cantidad debe ser mayor a cero"),
});

/** Gate compartido de la ruta: devuelve el error HTTP o null si se puede operar */
function tradingGateResponse(): { status: number; json: { error: string } } | null {
  if (!tradingEnabled()) {
    return {
      status: 403,
      json: { error: "El trading está deshabilitado en este server (IOL_TRADING_ENABLED=true)." },
    };
  }
  return null;
}

/** Resuelve credenciales y valida el modo api (mock las ignora) */
async function resolveCreds(userId: string): Promise<{ ok: true } | { ok: false; status: number; json: { error: string } }> {
  const creds = await getIolCredentials(userId);
  const isApiMode = (process.env.IOL_PROVIDER ?? "mock") === "api";
  if (isApiMode && (!creds.username || !creds.password)) {
    return {
      ok: false,
      status: 403,
      json: { error: "No hay credenciales IOL conectadas. Conectá tu cuenta IOL primero." },
    };
  }
  return { ok: true };
}

// POST /api/orders — crear orden de compra/venta (incluye MEP con specie D)
router.post("/", async (req: Request, res: Response) => {
  const gate = tradingGateResponse();
  if (gate) { res.status(gate.status).json(gate.json); return; }

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
    const credsCheck = await resolveCreds(req.user!.id);
    if (!credsCheck.ok) { res.status(credsCheck.status).json(credsCheck.json); return; }

    const args = parsed.data;
    if (args.specie === "D" && args.market !== "bcba") {
      res.status(400).json({ error: "Las órdenes en especie D (MEP) solo operan en el mercado bcba." });
      return;
    }
    if (args.priceType === "limit" && (args.price === undefined || args.price <= 0)) {
      res.status(400).json({ error: "Las órdenes limit requieren un precio (price)." });
      return;
    }

    const provider = getIolProvider();
    const creds = await getIolCredentials(req.user!.id);

    // Resolver precio de referencia para órdenes a mercado
    let price = args.price;
    if ((price === undefined || price <= 0) && args.priceType === "market") {
      const quote = await provider.getQuote(creds, args.symbol, args.market);
      if (quote.lastPrice <= 0) {
        res.status(400).json({ error: `No se pudo resolver un precio de referencia para ${args.symbol}.` });
        return;
      }
      price = quote.lastPrice;
    }

    const result = await provider.placeOrder(creds, "", {
      side: args.side,
      symbol: args.symbol,
      market: IOL_MARKET_CODES[args.market],
      quantity: args.qty,
      priceType: args.priceType,
      price,
      term: args.term,
      validity: args.validity,
      specie: args.specie,
    });

    await auditAgentAction({
      userId: req.user!.id,
      tool: "place_order",
      args: { ...args, price },
      resultStatus: "success",
      clientName: "api:orders",
    });
    res.json({ ok: true, orderId: result.iolOperationId, status: result.status, message: result.message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al ejecutar la orden";
    await auditAgentAction({
      userId: req.user!.id,
      tool: "place_order",
      args: req.body,
      resultStatus: "error",
      clientName: "api:orders",
      errorMessage: message.slice(0, 800),
    });
    res.status(isIolClientError(message) ? 400 : 502).json({ error: message });
  }
});

// POST /api/orders/fci/subscribe — suscribir a un FCI
router.post("/fci/subscribe", async (req: Request, res: Response) => {
  const gate = tradingGateResponse();
  if (gate) { res.status(gate.status).json(gate.json); return; }
  const parsed = fciSubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }
  try {
    const credsCheck = await resolveCreds(req.user!.id);
    if (!credsCheck.ok) { res.status(credsCheck.status).json(credsCheck.json); return; }
    const provider = getIolProvider();
    const creds = await getIolCredentials(req.user!.id);
    const result = await provider.subscribeFci(creds, parsed.data);
    await auditAgentAction({
      userId: req.user!.id,
      tool: "subscribe_fci",
      args: parsed.data,
      resultStatus: "success",
      clientName: "api:orders",
    });
    res.json({ ok: true, orderId: result.iolOperationId, status: result.status, message: result.message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al suscribir al FCI";
    await auditAgentAction({ userId: req.user!.id, tool: "subscribe_fci", args: req.body, resultStatus: "error", clientName: "api:orders", errorMessage: message.slice(0, 800) });
    res.status(isIolClientError(message) ? 400 : 502).json({ error: message });
  }
});

// POST /api/orders/fci/rescue — rescatar cuotapartes de un FCI
router.post("/fci/rescue", async (req: Request, res: Response) => {
  const gate = tradingGateResponse();
  if (gate) { res.status(gate.status).json(gate.json); return; }
  const parsed = fciRescueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Parámetros inválidos" });
    return;
  }
  try {
    const credsCheck = await resolveCreds(req.user!.id);
    if (!credsCheck.ok) { res.status(credsCheck.status).json(credsCheck.json); return; }
    const provider = getIolProvider();
    const creds = await getIolCredentials(req.user!.id);
    const result = await provider.rescueFci(creds, parsed.data);
    await auditAgentAction({
      userId: req.user!.id,
      tool: "rescue_fci",
      args: parsed.data,
      resultStatus: "success",
      clientName: "api:orders",
    });
    res.json({ ok: true, orderId: result.iolOperationId, status: result.status, message: result.message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al rescatar del FCI";
    await auditAgentAction({ userId: req.user!.id, tool: "rescue_fci", args: req.body, resultStatus: "error", clientName: "api:orders", errorMessage: message.slice(0, 800) });
    res.status(isIolClientError(message) ? 400 : 502).json({ error: message });
  }
});

// POST /api/orders/:numero/cancel — cancelar una operación pendiente
router.post("/:numero/cancel", async (req: Request, res: Response) => {
  const gate = tradingGateResponse();
  if (gate) { res.status(gate.status).json(gate.json); return; }
  const numeroParam = req.params.numero;
  const operationNumber = Array.isArray(numeroParam) ? numeroParam[0] : numeroParam;
  if (!operationNumber || operationNumber.trim() === "") {
    res.status(400).json({ error: "Falta el número de operación" });
    return;
  }
  try {
    const credsCheck = await resolveCreds(req.user!.id);
    if (!credsCheck.ok) { res.status(credsCheck.status).json(credsCheck.json); return; }
    const provider = getIolProvider();
    const creds = await getIolCredentials(req.user!.id);
    const result = await provider.cancelOperation(creds, operationNumber);
    await auditAgentAction({
      userId: req.user!.id,
      tool: "cancel_order",
      args: { operationNumber },
      resultStatus: "success",
      clientName: "api:orders",
    });
    res.json({ ok: true, orderId: result.iolOperationId, status: result.status, message: result.message });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al cancelar la operación";
    await auditAgentAction({ userId: req.user!.id, tool: "cancel_order", args: { operationNumber }, resultStatus: "error", clientName: "api:orders", errorMessage: message.slice(0, 800) });
    res.status(isIolClientError(message) ? 400 : 502).json({ error: message });
  }
});

export default router;
