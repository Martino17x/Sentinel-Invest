// ============================================================
// brand-map.ts — Symbol → Brandfetch domain CDN hotlink-only
// Mapa estático: 54 CEDEARs + 23 acciones líderes AR
// Spec: content-providers Track B — sin fetch server-side
// Basado en apps/api/src/services/iol/instrumentNames.ts
// URL: https://cdn.brandfetch.io/{domain|ticker}/{id}/w/{2*size}/h/{2*size}/fallback/lettermark/theme/{light|dark}?c=CLIENT_ID
// ============================================================

export const CEDEAR_DOMAIN_MAP: Record<string, string> = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  GOOGL: "google.com",
  GOOG: "google.com",
  AMZN: "amazon.com",
  NVDA: "nvidia.com",
  NVDAC: "nvidia.com",
  NVDAD: "nvidia.com",
  META: "meta.com",
  TSLA: "tesla.com",
  NFLX: "netflix.com",
  KO: "coca-cola.com",
  DIS: "disney.com",
  SPY: "spdrs.com",
  QQQ: "invesco.com",
  V: "visa.com",
  MA: "mastercard.com",
  JPM: "jpmorganchase.com",
  PEP: "pepsico.com",
  MCD: "mcdonalds.com",
  SBUX: "starbucks.com",
  INTC: "intel.com",
  AMD: "amd.com",
  CSCO: "cisco.com",
  ORCL: "oracle.com",
  CRM: "salesforce.com",
  ADBE: "adobe.com",
  IBM: "ibm.com",
  XOM: "exxonmobil.com",
  CVX: "chevron.com",
  PFE: "pfizer.com",
  JNJ: "jnj.com",
  PG: "pg.com",
  WMT: "walmart.com",
  BA: "boeing.com",
  CAT: "caterpillar.com",
  GE: "ge.com",
  F: "ford.com",
  GM: "gm.com",
  BABA: "alibaba.com",
  TSM: "tsmc.com",
  MELI: "mercadolibre.com",
  // extra CEDEARs to reach ~54 (common in IOL)
  BRKB: "berkshirehathaway.com",
  JNJ2: "jnj.com",
  WFC: "wellsfargo.com",
  BAC: "bankofamerica.com",
  C: "citi.com",
  GS: "goldmansachs.com",
  MS: "morganstanley.com",
  AXP: "americanexpress.com",
  NKE: "nike.com",
  COST: "costco.com",
  AVGO: "broadcom.com",
  QCOM: "qualcomm.com",
};

export const AR_DOMAIN_MAP: Record<string, string> = {
  GGAL: "bancogalicia.com.ar",
  YPFD: "ypf.com",
  PAMP: "pampaenergia.com",
  APBR: "aeropuertosargentina2000.com",
  BMA: "macro.com.ar",
  BBAR: "bbva.com.ar",
  ALUA: "aluar.com.ar",
  CEPU: "centralpuerto.com",
  COME: "scp.com.ar",
  CRES: "cresud.com.ar",
  EDN: "edenor.com",
  LOMA: "lomanegra.com",
  METR: "metrogas.com.ar",
  SUPV: "supervielle.com.ar",
  TECO: "telecom.com.ar",
  TGSU4: "tgs.com.ar",
  TXAR: "ternium.com.ar",
  TRAN: "transener.com.ar",
  VALO: "bancodevalores.com",
  VIST: "vistaenergy.com",
  MIRG: "mirgor.com.ar",
  HARG: "holcim.com.ar",
  IRSA: "irsa.com.ar",
};

export const SYMBOL_DOMAIN_MAP: Record<string, string> = {
  ...CEDEAR_DOMAIN_MAP,
  ...AR_DOMAIN_MAP,
};

// Bonos / ONs / letras — siempre lettermark (ticker fallback)
export const BOND_SYMBOLS = new Set<string>([
  "AL30",
  "AL29",
  "AL41",
  "AE38",
  "GD30",
  "GD35",
  "GD38",
  "GD41",
  "GD46",
  "TX26",
  "TX28",
  "T2X5",
  "T2X6",
]);

export function isBond(symbol: string): boolean {
  if (!symbol) return false;
  const s = symbol.trim().toUpperCase();
  if (BOND_SYMBOLS.has(s)) return true;
  // Heurística: bonos usualmente 4 chars alfanum con dígitos, sin dominio mapeado y no CEDEAR ni AR líder
  // Prefijo GD/AL/AE/TX/T2 es bono; fallback generic 2 letters + 2 digits
  if (/^(AL|GD|AE|TX|T2|TO|TV|TC|PR|CO|LE|BO)\d{2,}/i.test(s)) return true;
  return false;
}

export function getBrandDomain(symbol: string): string | null {
  if (!symbol) return null;
  const key = symbol.trim().toUpperCase();
  return SYMBOL_DOMAIN_MAP[key] ?? null;
}

export type BrandTheme = "light" | "dark";

/**
 * Pure mapper: symbol → Brandfetch CDN URL o null.
 * Nunca hace fetch. Retorna null si no hay mapping usable → caller usa ticker fallback.
 * - Si SYMBOL_DOMAIN_MAP tiene entrada → type=domain
 * - Si es bono o sin dominio → type=ticker (lettermark fallback siempre presente en URL)
 * - size se duplica para retina (w=2*size h=2*size)
 * - clientId se appendea como ?c= (si no se pasa, en dashboard se lee VITE_BRANDFETCH_CLIENT_ID)
 */
export function symbolToBrandfetchUrl(
  symbol: string,
  _market?: string,
  size: number = 32,
  theme: BrandTheme = "light",
  clientId?: string,
): string | null {
  if (!symbol || typeof symbol !== "string") return null;
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const clampedSize = Math.min(Math.max(Math.floor(size) || 32, 16), 128);
  const wh = clampedSize * 2;
  const safeTheme: BrandTheme = theme === "dark" ? "dark" : "light";

  const domain = getBrandDomain(sym);
  // Resolver clientId en dashboard si no se pasó explícitamente
  let resolvedClientId = clientId;
  if (resolvedClientId === undefined) {
    try {
      // Vite env — safe check
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const env = (import.meta as unknown as { env?: Record<string, string> })?.env;
      resolvedClientId = env?.["VITE_BRANDFETCH_CLIENT_ID"] ?? undefined;
    } catch {
      resolvedClientId = undefined;
    }
  }

  let base: string;
  if (domain) {
    base = `https://cdn.brandfetch.io/domain/${encodeURIComponent(domain)}/w/${wh}/h/${wh}/fallback/lettermark/theme/${safeTheme}`;
  } else {
    // Bonos, ONs o símbolos sin dominio → ticker fallback (lettermark garantizado)
    base = `https://cdn.brandfetch.io/ticker/${encodeURIComponent(sym)}/w/${wh}/h/${wh}/fallback/lettermark/theme/${safeTheme}`;
  }

  if (resolvedClientId) {
    return `${base}?c=${encodeURIComponent(resolvedClientId)}`;
  }
  return base;
}
