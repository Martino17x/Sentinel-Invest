import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

function normalizeGuardInput(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// Guardrail perfil inversor — defensa en profundidad (Capa A/B/C)
//
// Capa A: middleware HTTP (agent.ts) bloquea POST /api/agent/chat/stream
//         si hasInvestmentIntent(message) && !hasInvestorProfile
// Capa B: system prompt + early-return en chatLoop antes de llamar LLM
// Capa C: executor bloquea tools de mercado si !hasInvestorProfile
//
// Mensaje y payload 428 son ÚNICOS y consistentes en todas las capas.
// ============================================================

export const INVESTOR_PROFILE_REQUIRED_MESSAGE =
  "Para analizar el mercado necesito tu perfil de inversor. Completá tu test de 2 minutos en /investor-profile y después te doy un análisis exhaustivo.";

export const INVESTOR_PROFILE_REQUIRED_PAYLOAD = {
  error: "profile_required" as const,
  message: "Para darte una recomendación personalizada necesitás completar tu test de inversor (2 min).",
  next: "/investor-profile" as const,
  cta: "Hacer test ahora" as const,
};

// Heuristic keywords — normalizadas con normalizeScopeInput antes de comparar.
// Lista base del requerimiento + variantes con/sin tilde y plural + alias "portfolio".
export const INVESTMENT_INTENT_KEYWORDS: string[] = [
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
  "donde invertir",
  "en que invertir",
  "que comprar",
  "cual comprar",
  "conviene comprar",
  "ayudame a analizar",
  "analizar que acciones",
  "recomenda",
  "recomendas",
  "quiero invertir",
  "donde pongo",
];

export function hasInvestmentIntent(input: string): boolean {
  if (!input || input.trim().length < 3) return false;
  const n = normalizeGuardInput(input);
  return INVESTMENT_INTENT_KEYWORDS.some((kw) => n.includes(normalizeGuardInput(kw)));
}

export async function hasInvestorProfile(userId: string): Promise<boolean> {
  const [profile] = await db
    .select({ userId: schema.investorProfiles.userId })
    .from(schema.investorProfiles)
    .where(eq(schema.investorProfiles.userId, userId))
    .limit(1);
  return Boolean(profile);
}

// Tools que implican recomendación/análisis personalizado — requieren perfil.
// get_quote / search_instruments / get_dollar_rates quedan FUERA (consulta puntual).
export const PROFILE_GATED_TOOLS = new Set<string>([
  "analyze_stock",
  "get_screener",
  "backtest_strategy",
  "fundamentals",
  "analyst_consensus",
  "get_bond_analytics",
  "get_bond_curve",
  "get_bond_panel",
  "get_bond_ficha",
  "get_bond_cashflow",
  "earnings",
]);

export function isProfileGatedTool(toolName: string): boolean {
  return PROFILE_GATED_TOOLS.has(toolName);
}
