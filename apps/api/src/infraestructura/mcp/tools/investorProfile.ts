import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import type { ToolDefinition } from "../../../aplicacion/agente/types.js";

// ============================================================
// get_investor_profile — lectura del perfil CNV del usuario
//
// Usa req.user.id (ctx.userId) sin argumentos. Query 1:1
// investor_profiles por user_id. Solo lectura, NO requiere gate
// (justamente sirve para verificar si existe antes de Fase 1).
// Parity con GET /api/investor-profile.
// ============================================================

export const getInvestorProfileTool: ToolDefinition = {
  name: "get_investor_profile",
  description:
    "Perfil de inversor CNV del usuario autenticado: tolerancia al riesgo, horizonte, score, pérdida máxima tolerada, nivel de conocimiento y objetivo. Sin argumentos — usa el JWT. Si no existe, responde profile_not_found con next /investor-profile. Úsalo SIEMPRE antes de análisis exhaustivo (Fase 1) para verificar perfil.",
  inputSchema: z.object({}),
  permission: "allow",
  execute: async (ctx) => {
    const [profile] = await db
      .select()
      .from(schema.investorProfiles)
      .where(eq(schema.investorProfiles.userId, ctx.userId))
      .limit(1);

    if (!profile) {
      return {
        ok: false,
        message:
          'profile_not_found: No tenés perfil de inversor cargado. Completá tu test de 2 minutos en /investor-profile (next: "/investor-profile").',
      };
    }

    const payload = {
      risk_tolerance: profile.riskTolerance,
      horizon: profile.horizon,
      risk_score: profile.riskScore,
      loss_tolerance_pct: profile.lossTolerancePct,
      knowledge_level: profile.knowledgeLevel,
      investment_goal: profile.investmentGoal,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
      profile_version: profile.profileVersion,
    };

    const lines = [
      "Perfil de inversor (CNV):",
      `- risk_tolerance: ${payload.risk_tolerance}`,
      `- horizon: ${payload.horizon}`,
      `- risk_score: ${payload.risk_score}`,
      `- loss_tolerance_pct: ${payload.loss_tolerance_pct}%`,
      `- knowledge_level: ${payload.knowledge_level}`,
      `- investment_goal: ${payload.investment_goal}`,
      `- profile_version: ${payload.profile_version}`,
      `- created_at: ${payload.created_at}`,
      `- updated_at: ${payload.updated_at}`,
      `JSON: ${JSON.stringify(payload)}`,
    ];

    return { ok: true, message: lines.join("\n") };
  },
};
