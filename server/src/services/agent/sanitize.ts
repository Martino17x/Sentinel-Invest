// ============================================================
// Sanitización — anti prompt-injection y anti fuga de PII
// Los tool results NUNCA llegan crudos al LLM: sin control chars,
// sin HTML, con cap de tamaño. Los args de auditoría se anonimizan.
// ============================================================

/** Cap de outputs grandes que van al contexto del LLM (spec/design) */
export const MAX_TOOL_RESULT_CHARS = 8_000;

/** Control chars \u0000-\u001F (+ DEL) — se eliminan siempre */
export function stripControlChars(input: string): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, "");
}

/**
 * Texto plano, nunca HTML: elimina bloques script/style completos y
 * cualquier tag sobrante. Un dato de mercado nunca debe poder inyectar
 * markup ni instrucciones embebidas en el contexto del LLM.
 */
export function stripHtmlTags(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

/** Convierte cualquier valor a texto plano (objetos → JSON) */
export function toPlainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Sanitiza el resultado de un tool antes de devolverlo al LLM:
 * control chars fuera, sin HTML raw, cap de 8000 chars con marca de corte.
 */
export function sanitizeToolResult(value: unknown): string {
  let text = toPlainText(value);
  text = stripControlChars(text);
  text = stripHtmlTags(text);
  if (text.length > MAX_TOOL_RESULT_CHARS) {
    text = `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[resultado truncado]`;
  }
  return text.trim();
}

/**
 * Anonimiza args para auditoría: cada campo listado en piiFields se
 * reemplaza por "***" (recursivo sobre objetos y arrays — un objeto
 * anidado también se recorre para no dejar PII en profundidad).
 */
export function sanitizeArgsForAudit(args: unknown, piiFields?: string[]): unknown {
  if (!piiFields || piiFields.length === 0) return args;
  if (Array.isArray(args)) return args.map((v) => sanitizeArgsForAudit(v, piiFields));
  if (args !== null && typeof args === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
      out[key] = piiFields.includes(key) ? "***" : sanitizeArgsForAudit(value, piiFields);
    }
    return out;
  }
  return args;
}
