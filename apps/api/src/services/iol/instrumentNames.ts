/**
 * Catálogo local de nombres de instrumentos argentinos.
 *
 * BYMADATA (panel v2) NO incluye el nombre/descripción de los instrumentos
 * (description/securityDesc vienen vacíos) y los endpoints de mercado de
 * IOL v2 están caídos (verificado 13/08/2026). Este mapa cubre los
 * instrumentos más comunes (CEDEARs, acciones líderes y bonos) para que
 * la app muestre el nombre de la empresa. Los que no estén en el mapa
 * muestran solo el símbolo.
 */
import { RATIO_MAP } from "../market/cedear-ratios.js";
import generatedCatalogJson from "./generatedCedearNames.json";

export const INSTRUMENT_NAMES: Record<string, string> = {
  // ===== CEDEARs (BCBA) =====
  AAPL: "Apple Inc. CEDEAR",
  MSFT: "Microsoft Corp. CEDEAR",
  GOOGL: "Alphabet Inc. CEDEAR",
  GOOG: "Alphabet Inc. CEDEAR",
  AMZN: "Amazon.com Inc. CEDEAR",
  NVDA: "NVIDIA Corp. CEDEAR",
  NVDAC: "NVIDIA Corp. CEDEAR — CCL",
  NVDAD: "NVIDIA Corp. CEDEAR — MEP",
  // American Airlines Group Corp. — BYMA panel CEDEARs: AAL (ARS), AALC (CCL),
  // AALD (MEP). Verificado contra open.bymadata.com.ar (22/08/2026).
  // NO confundir con AAPL (Apple): "AALD → Apple" era un bug de datos.
  // La etiqueta rica de AALC/AALD la arma el helper a partir de esta base.
  AAL: "American Airlines Group Corp. CEDEAR",
  META: "Meta Platforms Inc. CEDEAR",
  TSLA: "Tesla Inc. CEDEAR",
  NFLX: "Netflix Inc. CEDEAR",
  KO: "Coca-Cola Co. CEDEAR",
  DIS: "Walt Disney Co. CEDEAR",
  SPY: "SPDR S&P 500 ETF CEDEAR",
  QQQ: "Invesco QQQ Trust CEDEAR",
  V: "Visa Inc. CEDEAR",
  MA: "Mastercard Inc. CEDEAR",
  JPM: "JPMorgan Chase & Co. CEDEAR",
  PEP: "PepsiCo Inc. CEDEAR",
  MCD: "McDonald's Corp. CEDEAR",
  SBUX: "Starbucks Corp. CEDEAR",
  INTC: "Intel Corp. CEDEAR",
  AMD: "Advanced Micro Devices CEDEAR",
  CSCO: "Cisco Systems CEDEAR",
  ORCL: "Oracle Corp. CEDEAR",
  CRM: "Salesforce Inc. CEDEAR",
  ADBE: "Adobe Inc. CEDEAR",
  IBM: "IBM Corp. CEDEAR",
  XOM: "Exxon Mobil Corp. CEDEAR",
  CVX: "Chevron Corp. CEDEAR",
  PFE: "Pfizer Inc. CEDEAR",
  JNJ: "Johnson & Johnson CEDEAR",
  PG: "Procter & Gamble CEDEAR",
  WMT: "Walmart Inc. CEDEAR",
  BA: "Boeing Co. CEDEAR",
  CAT: "Caterpillar Inc. CEDEAR",
  GE: "GE Aerospace CEDEAR",
  F: "Ford Motor Co. CEDEAR",
  GM: "General Motors CEDEAR",
  BABA: "Alibaba Group CEDEAR",
  TSM: "Taiwan Semiconductor CEDEAR",
  MELI: "MercadoLibre Inc. CEDEAR",
  C: "Citigroup Inc. CEDEAR",
  BAC: "Bank of America Corp. CEDEAR",
  WFC: "Wells Fargo & Co. CEDEAR",
  GS: "Goldman Sachs Group Inc. CEDEAR",
  MS: "Morgan Stanley CEDEAR",
  BRKB: "Berkshire Hathaway Inc. Class B CEDEAR",
  COST: "Costco Wholesale Corp. CEDEAR",
  AVGO: "Broadcom Inc. CEDEAR",
  QCOM: "Qualcomm Inc. CEDEAR",
  TXN: "Texas Instruments Inc. CEDEAR",
  NKE: "Nike Inc. CEDEAR",
  HD: "The Home Depot Inc. CEDEAR",
  UNH: "UnitedHealth Group Inc. CEDEAR",
  ABBV: "AbbVie Inc. CEDEAR",
  MRK: "Merck & Co. Inc. CEDEAR",
  LLY: "Eli Lilly and Company CEDEAR",
  PYPL: "PayPal Holdings Inc. CEDEAR",
  UBER: "Uber Technologies Inc. CEDEAR",
  SHOP: "Shopify Inc. CEDEAR",
  ABNB: "Airbnb Inc. CEDEAR",
  // ===== Acciones líderes (BCBA) =====
  GGAL: "Grupo Financiero Galicia",
  YPFD: "YPF S.A.",
  PAMP: "Pampa Energía",
  APBR: "Aeropuertos Argentina 2000",
  BMA: "Banco Macro",
  BBAR: "Banco BBVA Argentina",
  ALUA: "Aluar",
  CEPU: "Central Puerto",
  COME: "Sociedad Comercial del Plata",
  CRES: "Cresud",
  EDN: "Edenor",
  LOMA: "Loma Negra",
  METR: "Metrogas",
  SUPV: "Grupo Supervielle",
  TECO: "Telecom Argentina",
  TGSU4: "TGS",
  TXAR: "Ternium Argentina",
  TRAN: "Transportadora de Gas del Sur",
  VALO: "Banco de Valores",
  VIST: "Vista Energy",
  MIRG: "Mirgor",
  HARG: "Holcim Argentina",
  IRSA: "IRSA",
  // ===== Bonos (BCBA) =====
  AL30: "Bono AL30 (USD ley NY)",
  AL29: "Bono AL29 (USD ley NY)",
  AL41: "Bono AL41 (USD ley NY)",
  AE38: "Bono AE38 (USD)",
  GD30: "Global 2030 (USD)",
  GD35: "Global 2035 (USD)",
  GD38: "Global 2038 (USD)",
  GD41: "Global 2041 (USD)",
  GD46: "Global 2046 (USD)",
};

/**
 * Normaliza símbolo: trim + uppercase.
 * Vacío/null → "".
 */
export function normalizeSymbol(symbol: string): string {
  if (!symbol || typeof symbol !== "string") return "";
  return symbol.trim().toUpperCase();
}

/**
 * Fuentes de nombres para los helpers. PRIORIDAD: manual (INSTRUMENT_NAMES)
 * > ratios (CEDEAR_RATIOS) > generated (catálogo por script) > fallback.
 * Los names de CEDEAR_RATIOS NO traen sufijo "CEDEAR" (ej. "Microsoft Corp.")
 * — el helper lo arma; los de generated SÍ lo traen completo.
 * Inyectable para tests; default = datos reales.
 */
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
 * Sufijo de liquidación para variantes BYMA.
 * - "C" → CCL (Contado con Liquidación, especie C)
 * - "D" → MEP (Dólar MEP, especie D)
 * Retorna "" si no es variante C/D reconocida (base debe existir en
 * INSTRUMENT_NAMES o CEDEAR_RATIOS).
 * Es genérico: no filtra por CEDEAR. El caller (getInstrumentDisplayName)
 * decide si aplica solo a CEDEARs para etiqueta rica.
 *
 * @example
 * getSettlementSuffix("AAPLC") // "C" (AAPL existe)
 * getSettlementSuffix("AAPLD") // "D"
 * getSettlementSuffix("AAPL")  // ""  (sin sufijo)
 * getSettlementSuffix("GGALC") // "C" (GGAL existe, aunque no CEDEAR — genérico)
 * getSettlementSuffix("ZZZZC") // ""  (base ZZZZ no existe)
 */
export function getSettlementSuffix(symbol: string): "" | "C" | "D" {
  const norm = normalizeSymbol(symbol);
  if (!norm || norm.length < 2) return "";
  const last = norm.charAt(norm.length - 1);
  if (last !== "C" && last !== "D") return "";
  const base = norm.slice(0, -1);
  if (base.length < 1) return "";
  // Solo es sufijo válido si la base existe en alguna fuente.
  // Así "GGALC" donde GGAL existe sería "C", pero getInstrumentDisplayName
  // filtrará por CEDEAR antes de agregar etiqueta rica.
  if (
    INSTRUMENT_NAMES[base] !== undefined ||
    DEFAULT_DISPLAY_SOURCES.ratioNames.has(base) ||
    GENERATED_CEDEAR_NAMES[base] !== undefined
  ) {
    return last as "C" | "D";
  }
  return "";
}

/**
 * Retorna el símbolo base sin sufijo C/D si la base existe en el catálogo
 * (INSTRUMENT_NAMES o CEDEAR_RATIOS).
 * Case-insensitive, trim, uppercase.
 *
 * @example
 * getBaseSymbol("AAPLC") // "AAPL"  (AAPL existe)
 * getBaseSymbol("AAPLD") // "AAPL"
 * getBaseSymbol("aaplc") // "AAPL"  (case-insensitive)
 * getBaseSymbol("GGALC") // "GGAL"  (GGAL existe, aunque no CEDEAR)
 * getBaseSymbol("ZZZZC") // "ZZZZC" (base ZZZZ no existe → retorna normalizado)
 */
export function resolveBaseSymbol(
  symbol: string,
  sources: DisplayNameSources = DEFAULT_DISPLAY_SOURCES,
): string {
  const norm = normalizeSymbol(symbol);
  if (!norm) return "";
  if (norm.length >= 2) {
    const last = norm.charAt(norm.length - 1);
    if (last === "C" || last === "D") {
      const base = norm.slice(0, -1);
      if (
        sources.names[base] !== undefined ||
        sources.ratioNames.has(base) ||
        sources.generated?.[base] !== undefined
      ) {
        return base;
      }
    }
  }
  return norm;
}

export function getBaseSymbol(symbol: string): string {
  return resolveBaseSymbol(symbol);
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
