// ============================================================
// brand-map.ts — Symbol → Brandfetch domain CDN hotlink-only
// Mapa estático: 54 CEDEARs + 23 acciones líderes AR
// Spec: content-providers Track B — sin fetch server-side
// Basado en apps/api/src/services/iol/instrumentNames.ts
// Brandfetch hotlink con retina + fallback (verificado, no da 404 con ?c=):
//   https://cdn.brandfetch.io/ticker/{TICKER}/w/{2*size}/h/{2*size}/fallback/lettermark/theme/{light|dark}?c=CLIENT_ID
//   https://cdn.brandfetch.io/domain/{domain}/w/{2*size}/h/{2*size}/fallback/lettermark/theme/{light|dark}?c=CLIENT_ID
// Google favicon fallback (garantizado, sin API key):
//   https://www.google.com/s2/favicons?domain={domain}&sz={size*2}
// ============================================================

/**
 * Strippea sufijos de mercado argentinos/brasileños antes de lookup.
 * Ej: VALE.CI -> VALE, VRTX.CI -> VRTX, AEG.CI -> AEG, XLY.CI -> XLY
 * TIMS3 (sin punto) se mantiene idéntico.
 */
export function stripMarketSuffix(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(CI|BA|BR|AR|US)$/i, "");
}

export const CEDEAR_DOMAIN_MAP: Record<string, string> = {
  AAPL: "apple.com",
  // Variante BYMA/CEDEAR con sufijo D (ej: AALD en panel CEDEARs = Apple Inc.)
  AALD: "apple.com",
  AAPLD: "apple.com",
  MSFT: "microsoft.com",
  GOOGL: "google.com",
  GOOG: "google.com",
  AMZN: "amazon.com",
  NVDA: "nvidia.com",
  // Variantes BYMA/CEDEAR de Nvidia: NVD (ticker corto usado en algunos panels), NVDAC/NVDAD con sufijos C/D
  NVD: "nvidia.com",
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
  // === faltantes detectados (Brandfetch verificado: tienen logo real) ===
  VALE: "vale.com",
  VRTX: "vrtx.com",
  TIMS3: "tim.com.br",
  AEG: "aesandes.com",
  XLY: "statestreet.com",
  SLV: "ishares.com",
  SLVC: "ishares.com",
  BMNR: "bitminetech.io",
  MU: "micron.com",
  NU: "nubank.com.br",
  // === Radar CCL — 10 CEDEARs faltantes para completar 60 ratios (S3.3) ===
  TXN: "ti.com",
  HD: "homedepot.com",
  UNH: "unitedhealthgroup.com",
  ABBV: "abbvie.com",
  MRK: "merck.com",
  LLY: "lilly.com",
  PYPL: "paypal.com",
  UBER: "uber.com",
  SHOP: "shopify.com",
  ABNB: "airbnb.com",
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
  const key = stripMarketSuffix(symbol);
  // 1) directo
  if (SYMBOL_DOMAIN_MAP[key]) return SYMBOL_DOMAIN_MAP[key];
  // 2) variantes CEDEAR con sufijo D/C (ej: NVDAC,NVDAD) o dígito (JNJ2)
  //    Si termina en D/C y el base sin última letra existe, usarlo (AALD → AAL, AAPLD → AAPL)
  if (/^[A-Z]{3,5}[DC]$/.test(key)) {
    const base = key.slice(0, -1);
    if (SYMBOL_DOMAIN_MAP[base]) return SYMBOL_DOMAIN_MAP[base];
  }
  // 3) fallback genérico: probar stripping progresivo de 1 char si base existe (cubre AALD→AAPL si AAPL existe? no, pero cubre NVDAD→NVDA)
  //    Para CEDEARs tipo AAPLD (5 chars + D), probar sin última letra
  const withoutLast = key.slice(0, -1);
  if (withoutLast.length >= 2 && SYMBOL_DOMAIN_MAP[withoutLast]) {
    return SYMBOL_DOMAIN_MAP[withoutLast];
  }
  // 4) CEDEARs con sufijo numérico (ej: JNJ2) o letra+num: probar base de 3-4 chars
  const alpha = key.replace(/[^A-Z]/g, "");
  if (alpha !== key && SYMBOL_DOMAIN_MAP[alpha]) return SYMBOL_DOMAIN_MAP[alpha];
  return null;
}

/**
 * Devuelve el ticker canónico para Brandfetch /ticker/ fallback.
 * Si el símbolo tiene sufijo D/C pero su base existe, usa la base (AALD→AAL, NVDAD→NVDA).
 * Así el lettermark también es más reconocible.
 */
export function getCanonicalTicker(symbol: string): string {
  const key = stripMarketSuffix(symbol);
  if (SYMBOL_DOMAIN_MAP[key]) return key;
  if (/^[A-Z]{3,5}[DC]$/.test(key)) {
    const base = key.slice(0, -1);
    if (SYMBOL_DOMAIN_MAP[base]) return base;
  }
  const withoutLast = key.slice(0, -1);
  if (withoutLast.length >= 2 && SYMBOL_DOMAIN_MAP[withoutLast]) return withoutLast;
  const alpha = key.replace(/[^A-Z]/g, "");
  if (alpha !== key && SYMBOL_DOMAIN_MAP[alpha]) return alpha;
  return key;
}

export type BrandTheme = "light" | "dark";

function resolveClientId(clientId?: string): string | undefined {
  if (clientId !== undefined) return clientId;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const env = (import.meta as unknown as { env?: Record<string, string> })?.env;
    return env?.["VITE_BRANDFETCH_CLIENT_ID"] ?? undefined;
  } catch {
    return undefined;
  }
}

/** Brandfetch ticker hotlink con w/h retina + fallback lettermark (formato verificado). */
export function symbolToBrandfetchTickerUrl(
  symbol: string,
  clientId?: string,
  size: number = 32,
  theme: BrandTheme = "light",
): string | null {
  if (!symbol || typeof symbol !== "string") return null;
  const sym = stripMarketSuffix(symbol);
  if (!sym) return null;
  const ticker = getCanonicalTicker(sym);
  const resolved = resolveClientId(clientId);
  const clampedSize = Math.min(Math.max(Math.floor(size) || 32, 16), 128);
  const wh = clampedSize * 2;
  const safeTheme: BrandTheme = theme === "dark" ? "dark" : "light";
  const base = `https://cdn.brandfetch.io/ticker/${encodeURIComponent(ticker)}/w/${wh}/h/${wh}/fallback/lettermark/theme/${safeTheme}`;
  if (!resolved) return base;
  return `${base}?c=${encodeURIComponent(resolved)}`;
}

/** Brandfetch domain hotlink con w/h retina + fallback lettermark — solo si hay dominio mapeado. */
export function symbolToBrandfetchDomainUrl(
  symbol: string,
  clientId?: string,
  size: number = 32,
  theme: BrandTheme = "light",
): string | null {
  const domain = getBrandDomain(symbol);
  if (!domain) return null;
  const resolved = resolveClientId(clientId);
  const clampedSize = Math.min(Math.max(Math.floor(size) || 32, 16), 128);
  const wh = clampedSize * 2;
  const safeTheme: BrandTheme = theme === "dark" ? "dark" : "light";
  const base = `https://cdn.brandfetch.io/domain/${encodeURIComponent(domain)}/w/${wh}/h/${wh}/fallback/lettermark/theme/${safeTheme}`;
  if (!resolved) return base;
  return `${base}?c=${encodeURIComponent(resolved)}`;
}

/** Google S2 favicon — fallback universal sin API key, sigue 301 a t2.gstatic. */
export function getGoogleFaviconUrl(symbol: string, size: number = 32): string | null {
  const domain = getBrandDomain(symbol);
  if (!domain) return null;
  const clamped = Math.min(Math.max(Math.floor(size) || 32, 16), 128) * 2;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${clamped}`;
}

/**
 * Pure mapper: symbol → Brandfetch CDN URL o null.
 * Usa dominio si existe (mejor calidad que ticker genérico), sino ticker.
 * Incluye w/h retina (2*size), fallback/lettermark y theme — nunca hace fetch.
 */
export function symbolToBrandfetchUrl(
  symbol: string,
  _market?: string,
  size: number = 32,
  theme: BrandTheme = "light",
  clientId?: string,
): string | null {
  if (!symbol || typeof symbol !== "string") return null;
  const sym = stripMarketSuffix(symbol);
  if (!sym) return null;
  if (isBond(sym)) {
    // bonos → ticker sin dominio, siempre lettermark
    return symbolToBrandfetchTickerUrl(sym, clientId, size, theme);
  }
  const domain = getBrandDomain(sym);
  if (domain) {
    return symbolToBrandfetchDomainUrl(sym, clientId, size, theme);
  }
  return symbolToBrandfetchTickerUrl(sym, clientId, size, theme);
}
