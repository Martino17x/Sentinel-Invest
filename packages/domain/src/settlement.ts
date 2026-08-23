/**
 * Settlements BYMA — sufijos de liquidación y símbolo base.
 *
 * Hoja pura del package: cero imports internos. La validación de si un
 * sufijo C/D es real depende de las fuentes del catálogo, que se inyectan
 * por parámetro (`BaseSources`); los wrappers con defaults reales viven en
 * `catalog/names.ts`.
 */

/**
 * Tipo de liquidación derivado del sufijo de especie BYMA.
 * - "24hs": especie B (plazo 24 horas)
 * - "CCL":  especie C (Contado con Liquidación)
 * - "MEP":  especie D (Dólar MEP)
 */
export type SettlementType = "24hs" | "CCL" | "MEP";

/**
 * Fuentes para validar si la base de un símbolo existe. Estructura
 * compatible con `DisplayNameSources` (catalog/names.ts). Opcional en
 * cada campo para poder testear con catálogos parciales.
 */
export interface BaseSources {
  /** Catálogo manual: symbol → nombre display */
  names?: Record<string, string>;
  /** Tabla de ratios: symbol → nombre del subyacente */
  ratioNames?: ReadonlyMap<string, string>;
  /** Catálogo generado por script: symbol → nombre display completo */
  generated?: Record<string, string>;
}

function normalize(symbol: string): string {
  if (!symbol || typeof symbol !== "string") return "";
  return symbol.trim().toUpperCase();
}

function hasKnownBase(sources: BaseSources | undefined, base: string): boolean {
  return (
    sources?.names?.[base] !== undefined ||
    sources?.ratioNames?.has(base) === true ||
    sources?.generated?.[base] !== undefined
  );
}

/**
 * Sufijo de liquidación para variantes BYMA.
 * - "C" → CCL (Contado con Liquidación, especie C)
 * - "D" → MEP (Dólar MEP, especie D)
 * Retorna "" si no es variante C/D reconocida (la base debe existir en
 * alguna fuente).
 * Es genérico: no filtra por CEDEAR. El caller decide si aplica etiqueta
 * rica solo a CEDEARs.
 *
 * @example
 * resolveSettlementSuffix("AAPLC", sources) // "C" (AAPL existe)
 * resolveSettlementSuffix("AAPLD", sources) // "D"
 * resolveSettlementSuffix("GGALC", sources) // "C" (genérico, aunque GGAL no es CEDEAR)
 * resolveSettlementSuffix("ZZZZC", sources) // ""  (base ZZZZ no existe)
 */
export function resolveSettlementSuffix(
  symbol: string,
  sources?: BaseSources,
): "" | "C" | "D" {
  const norm = normalize(symbol);
  if (!norm || norm.length < 2) return "";
  const last = norm.charAt(norm.length - 1);
  if (last !== "C" && last !== "D") return "";
  const base = norm.slice(0, -1);
  if (base.length < 1) return "";
  // Solo es sufijo válido si la base existe en alguna fuente.
  if (hasKnownBase(sources, base)) {
    return last as "C" | "D";
  }
  return "";
}

/**
 * Retorna el símbolo base sin sufijo C/D si la base existe en las fuentes.
 * Case-insensitive, trim, uppercase.
 *
 * @example
 * resolveBaseSymbol("AAPLC", sources) // "AAPL"
 * resolveBaseSymbol("aaplc", sources) // "AAPL"  (case-insensitive)
 * resolveBaseSymbol("GGALC", sources) // "GGAL"  (genérico, no solo CEDEAR)
 * resolveBaseSymbol("ZZZZC", sources) // "ZZZZC" (base inexistente → normalizado)
 */
export function resolveBaseSymbol(symbol: string, sources?: BaseSources): string {
  const norm = normalize(symbol);
  if (!norm) return "";
  if (norm.length >= 2) {
    const last = norm.charAt(norm.length - 1);
    if (last === "C" || last === "D") {
      const base = norm.slice(0, -1);
      if (hasKnownBase(sources, base)) {
        return base;
      }
    }
  }
  return norm;
}
