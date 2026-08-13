import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth); // TODAS las rutas de acá requieren auth

// ============================================================
// Validación
// ============================================================

const createAccountSchema = z.object({
  iolAccountNumber: z.string().min(1, "El número de cuenta es obligatorio"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
  currency: z.enum(["ARS", "USD"]).default("ARS"),
});

// ============================================================
// GET /api/accounts — cuentas del usuario autenticado
// ============================================================

router.get("/", async (req: Request, res: Response) => {
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, req.user!.id));

  res.json({ accounts });
});

// ============================================================
// POST /api/accounts — registrar una cuenta comitente de IOL
// ============================================================

router.post("/", async (req: Request, res: Response) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { iolAccountNumber, name, currency } = parsed.data;

  // El UNIQUE(user_id, iol_account_number) de la BD evita duplicados,
  // pero chequeamos antes para dar un mensaje claro
  const existing = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.userId, req.user!.id),
        eq(schema.accounts.iolAccountNumber, iolAccountNumber)
      )
    );

  if (existing.length > 0) {
    res.status(409).json({ error: "Ya tenés esa cuenta registrada" });
    return;
  }

  const [account] = await db
    .insert(schema.accounts)
    .values({
      userId: req.user!.id,
      iolAccountNumber,
      name: name ?? `Cuenta ${iolAccountNumber}`,
      currency,
    })
    .returning();

  res.status(201).json({ account });
});

export default router;
