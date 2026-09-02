import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { scoreProfile } from "../../../services/investorProfile/scoring.js";
import { db, schema } from "../../../db/index.js";

const router = Router();
router.use(requireAuth);

// Zod: 12 respuestas índice 0..n (tasks exige min(0) + length 12 → 400 si falla)
const investorProfileSchema = z.object({
  answers: z.array(z.number().int().min(0)).length(12),
});

// ============================================================
// POST /api/investor-profile — upsert propio (score + profile_version++)
// ============================================================
router.post("/", async (req: Request, res: Response) => {
  const parsed = investorProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Datos inválidos", issues: parsed.error.issues });
    return;
  }

  const { answers } = parsed.data;
  const scored = scoreProfile(answers);

  const userId = req.user!.id;

  // Upsert 1:1 por user_id PK — profile_version auto-increment
  const existing = await db
    .select({ profileVersion: schema.investorProfiles.profileVersion })
    .from(schema.investorProfiles)
    .where(eq(schema.investorProfiles.userId, userId))
    .limit(1);

  if (existing.length === 0) {
    const [row] = await db
      .insert(schema.investorProfiles)
      .values({
        userId,
        riskTolerance: scored.risk_tolerance,
        horizon: scored.horizon,
        knowledgeLevel: scored.knowledge_level,
        lossTolerancePct: scored.loss_tolerance_pct,
        investmentGoal: scored.investment_goal,
        riskScore: scored.risk_score,
        profileVersion: 1,
      })
      .returning();
    res.status(200).json({ profile: row });
    return;
  }

  const nextVersion = (existing[0].profileVersion ?? 1) + 1;
  const [row] = await db
    .update(schema.investorProfiles)
    .set({
      riskTolerance: scored.risk_tolerance,
      horizon: scored.horizon,
      knowledgeLevel: scored.knowledge_level,
      lossTolerancePct: scored.loss_tolerance_pct,
      investmentGoal: scored.investment_goal,
      riskScore: scored.risk_score,
      profileVersion: nextVersion,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.investorProfiles.userId, userId))
    .returning();

  res.status(200).json({ profile: row });
});

// ============================================================
// GET /api/investor-profile — propio (404 si no existe)
// ============================================================
router.get("/", async (req: Request, res: Response) => {
  const [profile] = await db
    .select()
    .from(schema.investorProfiles)
    .where(eq(schema.investorProfiles.userId, req.user!.id))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "profile_not_found", next: "/investor-profile" });
    return;
  }

  res.json({ profile });
});

// ============================================================
// GET /api/investor-profile/:userId — admin (403 si no admin)
// TODO CNV: users.role no existe aún — check heurístico hasta migración role.
// Si param !== own id → 403 (el spec exige 403 para no-admin).
// Cuando exista users.role === 'admin', reemplazar por lookup real.
// ============================================================
router.get("/:userId", async (req: Request, res: Response) => {
  const paramId = req.params.userId as string;
  const ownId = req.user!.id;

  // Validar UUID
  const uuidCheck = z.string().uuid().safeParse(paramId);
  if (!uuidCheck.success) {
    res.status(400).json({ error: "userId inválido" });
    return;
  }

  // Si pide su propio perfil, delegar (evita 403 a sí mismo)
  if (paramId === ownId) {
    const [profile] = await db
      .select()
      .from(schema.investorProfiles)
      .where(eq(schema.investorProfiles.userId, ownId))
      .limit(1);
    if (!profile) {
      res.status(404).json({ error: "profile_not_found", next: "/investor-profile" });
      return;
    }
    res.json({ profile });
    return;
  }

  // TODO: role check real cuando exista columna role.
  // Por ahora: cualquier userId distinto al propio → 403.
  // Heurística admin: si email contiene 'admin' permitimos (para tests manuales).
  const isAdmin = req.user!.email.includes("admin");
  if (!isAdmin) {
    res.status(403).json({ error: "forbidden", message: "Solo admin puede consultar otros perfiles" });
    return;
  }

  const [profile] = await db
    .select()
    .from(schema.investorProfiles)
    .where(eq(schema.investorProfiles.userId, paramId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "profile_not_found", next: "/investor-profile" });
    return;
  }

  res.json({ profile });
});

export default router;
