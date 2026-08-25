import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";

/**
 * Gate CNV — bloquea POSTs mutantes si el usuario no tiene perfil inversor.
 * Responde 428 Precondition Required con next accionable para el frontend.
 * Lecturas (GETs) NO deben usar este middleware.
 */
export async function requireInvestorProfile(req: Request, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: "Token no proporcionado" });
    return;
  }

  const [profile] = await db
    .select({ userId: schema.investorProfiles.userId })
    .from(schema.investorProfiles)
    .where(eq(schema.investorProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    res.status(428).json({ error: "profile_required", next: "/investor-profile" });
    return;
  }

  next();
}
