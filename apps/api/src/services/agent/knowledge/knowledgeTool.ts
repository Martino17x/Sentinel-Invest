import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { knowledgeCorpusSize, searchKnowledge } from "./search.js";

// ============================================================
// search_knowledge — RAG keyword sobre el corpus de inversiones
//
// No requiere credenciales ni cuenta: es conocimiento estático
// del dominio. Si el corpus no está disponible (fail-safe), el
// handler devuelve un error limpio en lugar de crashear el chat.
// ============================================================

const CORPUS_UNAVAILABLE =
  "La base de conocimiento no está disponible en este momento. Probá de nuevo más tarde.";

export const searchKnowledgeTool: ToolDefinition = {
  name: "search_knowledge",
  description:
    "Buscá en la base de conocimiento de inversiones argentinas: CEDEARs (ratio, comisiones, parking), bonos soberanos (AL30/GD30, precio por VN100), acciones BCBA, ON, cauciones, FCI, análisis técnico y fundamental, dólar (oficial/MEP/CCL/blue), riesgos, impuestos, estrategia, horarios de rueda. Consultá SIEMPRE el corpus antes de explicar un concepto o instrumento.",
  inputSchema: z.object({
    query: z.string().min(1, "Escribí qué querés saber").max(200),
    limit: z.number().int().min(1).max(5).default(4),
  }),
  permission: "allow",
  execute: async (ctx, rawArgs) => {
    const args = rawArgs as { query: string; limit: number };

    const results = searchKnowledge(args.query, { limit: args.limit });
    if (results.length === 0) {
      const hint = knowledgeCorpusSize() === 0
        ? CORPUS_UNAVAILABLE
        : `No encontré nada en la base de conocimiento para "${args.query}". Probá con otros términos (ej: 'bonos AL30', 'parking CEDEAR', 'dólar MEP').`;
      return { ok: false, message: hint };
    }

    const lines = results.map(
      (r, i) => `[${i + 1}] ${r.title} (relevancia ${r.score})\n> ${r.snippet}\n`
    );
    return {
      ok: true,
      message: `Conocimiento relevante para "${args.query}":\n\n${lines.join("\n")}\nSi necesitás más detalle de alguno de estos temas, preguntámelo y amplío.`,
    };
  },
};
