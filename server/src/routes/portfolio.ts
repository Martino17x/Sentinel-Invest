import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getIolProvider } from "../services/iol/index.js";
import { getIolCredentials } from "../lib/iol-credentials.js";
import { saveDailySnapshot } from "../services/reports/reportBuilder.js";

const router = Router();
router.use(requireAuth);

type AccountResult =
  | { ok: true; account: { id: string; iolAccountNumber: string; currency: string } }
  | { ok: false; status: number; message: string };

/**
 * Helper: busca la cuenta del usuario.
 * - En modo MOCK: si no hay cuenta, usa "demo" para mostrar datos.
 * - En modo API: usa la cuenta real del usuario.
 */
async function getAccountForUser(userId: string, accountId?: string): Promise<AccountResult> {
  if (accountId) {
    const [account] = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.id, accountId));
    if (!account || account.userId !== userId) {
      return { ok: false, status: 404, message: "Cuenta no encontrada" };
    }
    return { ok: true, account };
  }

  const accounts = await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId));
  if (accounts.length === 0) {
    if (process.env.IOL_PROVIDER !== "api") {
      return { ok: true, account: { id: "demo", iolAccountNumber: "demo-0001", currency: "ARS" } };
    }
    return { ok: false, status: 404, message: "No tenés cuentas registradas. Conectá tu cuenta IOL primero." };
  }

  // En modo API, preferir la cuenta con posiciones (la de EEUU donde viven CEDEARs/bonos)
  if (process.env.IOL_PROVIDER === "api") {
    const withPositions = accounts.find((a) => a.iolAccountNumber.includes("-EEUU"));
    return { ok: true, account: withPositions ?? accounts[0] };
  }
  return { ok: true, account: accounts[0] };
}

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
// GET /api/portfolio/history?days=90 — evolución del valor
// ============================================================

router.get("/history", async (req: Request, res: Response) => {
  const days = Math.min(Number(req.query.days ?? 90), 365);

  const result = await getAccountForUser(req.user!.id, req.query.accountId as string | undefined);
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  try {
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const history = await provider.getPortfolioHistory(
      creds,
      result.account.iolAccountNumber,
      days
    );
    res.json({ history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar el historial";
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
