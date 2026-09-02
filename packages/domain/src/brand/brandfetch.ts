// ============================================================
// brandfetch.ts (@sentinel/domain) — Symbol → Brandfetch CDN URL builders
// Copia de apps/dashboard/src/lib/brand-map.ts SIN resolveClientId (D5):
// el clientId SIEMPRE llega por parámetro; si es vacío, la URL sale sin ?c=.
// Sin lectura de variables de entorno.
// ============================================================

import {
  getBrandDomain,
  getCanonicalTicker,
  isBond,
  stripMarketSuffix,
  type BrandTheme,
} from "./domains";

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
  const clampedSize = Math.min(Math.max(Math.floor(size) || 32, 16), 128);
  const wh = clampedSize * 2;
  const safeTheme: BrandTheme = theme === "dark" ? "dark" : "light";
  const base = `https://cdn.brandfetch.io/ticker/${encodeURIComponent(ticker)}/w/${wh}/h/${wh}/fallback/lettermark/theme/${safeTheme}`;
  const resolved = clientId?.trim();
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
  const clampedSize = Math.min(Math.max(Math.floor(size) || 32, 16), 128);
  const wh = clampedSize * 2;
  const safeTheme: BrandTheme = theme === "dark" ? "dark" : "light";
  const base = `https://cdn.brandfetch.io/domain/${encodeURIComponent(domain)}/w/${wh}/h/${wh}/fallback/lettermark/theme/${safeTheme}`;
  const resolved = clientId?.trim();
  if (!resolved) return base;
  return `${base}?c=${encodeURIComponent(resolved)}`;
}

/**
 * Pure mapper: symbol → Brandfetch CDN URL o null.
 * Bonos → ticker lettermark; con dominio mapeado → domain URL; sino ticker.
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
