import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { getIolProvider } from "../services/iol/index.js";
import { getIolCredentials } from "../lib/iol-credentials.js";

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
    const creds = await getIolCredentials(req.user!.id);
    const provider = getIolProvider();
    const operations = await provider.getOperations(creds, accountId ?? "");
    res.json({ operations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al consultar operaciones";
    res.status(502).json({ error: message });
  }
});

export default router;
