import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";

export const INVESTOR_PROFILE_428_PAYLOAD = {
  error: "profile_required" as const,
  message: "Para darte una recomendación personalizada necesitás completar tu test de inversor (2 min).",
  next: "/investor-profile" as const,
  cta: "Hacer test ahora" as const,
};

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
    res.status(428).json(INVESTOR_PROFILE_428_PAYLOAD);
    return;
  }

  next();
}

// Heuristic condicional para POST /api/agent/chat — solo bloquea si el mensaje
// tiene intención de inversión y no hay perfil. Evita fricción en consultas no personalizadas.
const INVESTMENT_INTENT_KWS = [
  "comprar",
  "invertir",
  "portafolio",
  "portfolio",
  "recomendacion",
  "que accion",
  "que acciones",
  "analisis de mercado",
  "mejor opcion",
  "mejores opciones",
  "que comprar",
  "cual comprar",
];

function normalizeIntentInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasInvestmentIntentForMiddleware(input: string): boolean {
  if (!input || input.trim().length < 3) return false;
  const n = normalizeIntentInput(input);
  return INVESTMENT_INTENT_KWS.some((kw) => n.includes(normalizeIntentInput(kw)));
}

export async function requireInvestorProfileIfInvestmentIntent(req: Request, res: Response, next: NextFunction) {
  const raw = (req.body as { message?: unknown })?.message;
  const message = typeof raw === "string" ? raw : "";
  if (!hasInvestmentIntentForMiddleware(message)) {
    next();
    return;
  }
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
    res.status(428).json(INVESTOR_PROFILE_428_PAYLOAD);
    return;
  }
  next();
}
