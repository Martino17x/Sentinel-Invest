/**
 * Nombres display de instrumentos — contrato preservado desde
 * `apps/api/src/services/iol/instrumentNames.ts`, consumiendo las fuentes
 * locales del package (names.manual / ratios / names.generated).
 *
 * Fuentes: PRIORIDAD manual (INSTRUMENT_NAMES) > ratios (CEDEAR_RATIOS)
 * > generated (catálogo por script) > fallback (símbolo normalizado).
 * Los names de CEDEAR_RATIOS NO traen sufijo "CEDEAR" (ej. "Microsoft Corp.")
 * — el helper lo arma; los de generated SÍ lo traen completo.
 * Inyectable para tests; default = datos reales del package.
 */
import { normalizeSymbol } from "../ticker";
import {
  isUsdSettlementVariant as _isUsdSettlementVariant,
  resolveBaseSymbol,
  resolveSettlementSuffix,
  type BaseSources,
} from "../settlement";
import { RATIO_MAP } from "./ratios";
import { INSTRUMENT_NAMES } from "./names.manual";
import generatedCatalogJson from "./names.generated.json";

export interface DisplayNameSources {
  names: Record<string, string>;
  /** symbol → nombre del subyacente sin "CEDEAR" (ej. MSFT → "Microsoft Corp.") */
  ratioNames: ReadonlyMap<string, string>;
  /** symbol → nombre display completo con "CEDEAR" (ej. "Abbott Laboratories CEDEAR") */
  generated?: Record<string, string>;
}

const RATIO_NAME_MAP: ReadonlyMap<string, string> = new Map(
  [...RATIO_MAP].map(([symbol, ratio]) => [symbol, ratio.name]),
);

/**
 * Catálogo generado por script (apps/api/scripts/generate-cedear-catalog.ts):
 * BYMA panel CEDEARs + Yahoo Finance search. Incluye TODAS las variantes
 * (AAPL/AAPLC/AAPLD/AAPLB) apuntando al mismo nombre base — lookup directo.
 * Regenerar: pnpm --filter @sentinel/api generate:cedear-catalog
 */
export const GENERATED_CEDEAR_NAMES: Record<string, string> =
  generatedCatalogJson.names as Record<string, string>;

export const DEFAULT_DISPLAY_SOURCES: DisplayNameSources = {
  names: INSTRUMENT_NAMES,
  ratioNames: RATIO_NAME_MAP,
  generated: GENERATED_CEDEAR_NAMES,
};

function suffixLabelFor(last: "" | "C" | "D"): string {
  return last === "C" ? " — CCL" : last === "D" ? " — MEP" : "";
}

/**
 * Nombre display rico para instrumento.
 * - Si INSTRUMENT_NAMES[symbol] existe (exacto, case-insensitive) → retorna exacto.
 *   Respeta entradas explícitas migradas (NVDAC/NVDAD ya usan " — CCL/MEP").
 * - Si es variante C/D:
 *   a) base en INSTRUMENT_NAMES incluye "CEDEAR" → "Base CEDEAR — CCL/MEP".
 *   b) base solo en CEDEAR_RATIOS → "{name subyacente} CEDEAR — CCL/MEP".
 * - Si el símbolo exacto está solo en CEDEAR_RATIOS → "{name} CEDEAR"
 *   (cobertura futura al agregar ratios sin tocar INSTRUMENT_NAMES).
 * - Si el símbolo (o su base C/D) está solo en GENERATED_CEDEAR_NAMES →
 *   nombre generado; variante C/D hereda " — CCL/MEP" (el nombre generado
 *   ya termina en "CEDEAR"). Prioridad: manual > ratios > generated.
 * - Fallback → símbolo normalizado (trim+uppercase).
 *
 * Case-insensitive, trim, uppercase en lookup; respeta acentos del catálogo.
 * Nunca throw: símbolo desconocido cae al fallback.
 *
 * @example
 * getInstrumentDisplayName("AAPL")  // "Apple Inc. CEDEAR"
 * getInstrumentDisplayName("AAPLC") // "Apple Inc. CEDEAR — CCL"
 * getInstrumentDisplayName("NVDAC") // "NVIDIA Corp. CEDEAR — CCL" (entrada explícita)
 * getInstrumentDisplayName("AAL")   // "American Airlines Group Corp. CEDEAR"
 * getInstrumentDisplayName("GGAL")  // "Grupo Financiero Galicia"
 * getInstrumentDisplayName("GGALC") // "GGALC" (base GGAL no es CEDEAR → no etiqueta rica)
 * getInstrumentDisplayName("ZZZZ")  // "ZZZZ"
 */
export function resolveDisplayName(
  symbol: string,
  sources: DisplayNameSources = DEFAULT_DISPLAY_SOURCES,
): string {
  const norm = normalizeSymbol(symbol);
  if (!norm) return "";
  // 1) Exacto en catálogo → respetar (incluye NVDAC/NVDAD migrados)
  const exact = sources.names[norm];
  if (exact !== undefined) return exact;

  // 2) Variante C/D con base CEDEAR (catálogo o ratios) → etiqueta rica
  if (norm.length >= 2) {
    const last = norm.charAt(norm.length - 1);
    if (last === "C" || last === "D") {
      const base = norm.slice(0, -1);
      const baseName = sources.names[base];
      if (baseName !== undefined && baseName.includes("CEDEAR")) {
        return baseName + suffixLabelFor(last);
      }
      const ratioName = sources.ratioNames.get(base);
      if (ratioName !== undefined) {
        return `${ratioName} CEDEAR${suffixLabelFor(last)}`;
      }
      const genBase = sources.generated?.[base];
      if (genBase !== undefined) {
        return genBase + suffixLabelFor(last);
      }
    }
  }

  // 3) Exacto solo en CEDEAR_RATIOS → "{name} CEDEAR"
  const ratioExact = sources.ratioNames.get(norm);
  if (ratioExact !== undefined) return `${ratioExact} CEDEAR`;

  // 4) Exacto en catálogo generado (prioridad más baja)
  const generatedExact = sources.generated?.[norm];
  if (generatedExact !== undefined) return generatedExact;

  // 5) Fallback → símbolo
  return norm;
}

export function getInstrumentDisplayName(symbol: string): string {
  return resolveDisplayName(symbol);
}

/**
 * Wrappers con los datos reales del package sobre los helpers puros de
 * `settlement.ts`/`ticker.ts` (que requieren fuentes inyectables).
 */
export function getSettlementSuffix(symbol: string): "" | "C" | "D" {
  return resolveSettlementSuffix(symbol, DEFAULT_DISPLAY_SOURCES as BaseSources);
}

export function getBaseSymbol(symbol: string): string {
  return resolveBaseSymbol(symbol, DEFAULT_DISPLAY_SOURCES as BaseSources);
}

export function isUsdSettlementVariant(symbol: string, currency?: string): boolean {
  return _isUsdSettlementVariant(symbol, currency, DEFAULT_DISPLAY_SOURCES as BaseSources);
}
