import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

const router = Router();
router.use(requireAuth);

// ============================================================
// Validación
// ============================================================

const updateProfileSchema = z.object({
  fullName: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(80, "El nombre es demasiado largo")
    .optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "La contraseña actual es obligatoria"),
  newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
});

// ============================================================
// GET /api/profile — datos del perfil
// ============================================================

router.get("/", async (req: Request, res: Response) => {
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      fullName: schema.users.fullName,
      avatarUrl: schema.users.avatarUrl,
      hasGoogle: schema.users.googleId,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, req.user!.id));

  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  res.json({
    profile: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      loginMethod: user.hasGoogle ? "google" : "password",
      createdAt: user.createdAt,
    },
  });
});

// ============================================================
// PATCH /api/profile — actualizar nombre
// ============================================================

router.patch("/", async (req: Request, res: Response) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { fullName } = parsed.data;
  if (fullName === undefined) {
    res.status(400).json({ error: "No hay campos para actualizar" });
    return;
  }

  const [user] = await db
    .update(schema.users)
    .set({ fullName, updatedAt: new Date() })
    .where(eq(schema.users.id, req.user!.id))
    .returning();

  res.json({
    profile: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      loginMethod: user.googleId ? "google" : "password",
      createdAt: user.createdAt,
    },
  });
});

// ============================================================
// POST /api/profile/change-password
// ============================================================

router.post("/change-password", async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, req.user!.id));

  if (!user) {
    res.status(404).json({ error: "Usuario no encontrado" });
    return;
  }

  // Usuarios con Google no tienen contraseña real (es aleatoria)
  // → no pueden cambiar contraseña por este medio
  if (user.googleId) {
    res.status(400).json({
      error: "Tu cuenta usa Google. No tenés contraseña que cambiar.",
    });
    return;
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "La contraseña actual es incorrecta" });
    return;
  }

  const passwordHash = await hashPassword(newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id));

  res.json({ ok: true });
});

export default router;
