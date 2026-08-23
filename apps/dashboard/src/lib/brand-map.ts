// brand-map.ts — SHIM de compatibilidad.
// La implementación pura vive en @sentinel/domain; este módulo conserva la
// resolución del clientId desde el env de Vite (el package NUNCA lee env,
// el clientId SIEMPRE se inyecta por parámetro — spec domain-package).
import {
  symbolToBrandfetchDomainUrl as _domainUrl,
  symbolToBrandfetchTickerUrl as _tickerUrl,
  symbolToBrandfetchUrl as _url,
  type BrandTheme,
} from "@sentinel/domain";

export {
  stripMarketSuffix,
  CEDEAR_DOMAIN_MAP,
  AR_DOMAIN_MAP,
  SYMBOL_DOMAIN_MAP,
  BOND_SYMBOLS,
  isBond,
  getBrandDomain,
  getCanonicalTicker,
  getGoogleFaviconUrl,
} from "@sentinel/domain";
export type { BrandTheme } from "@sentinel/domain";

function resolveClientId(clientId?: string): string | undefined {
  if (clientId !== undefined) return clientId;
  // IMPORTANTE: acceso ESTÁTICO a import.meta.env. Vite (esbuild) solo inyecta el
  // objeto env en módulos que lo referencian como member expression estática;
  // con bracket dinámico env?.["KEY"] el módulo queda sin preamble y env es
  // undefined en runtime (bug de logos rotos, verificado 23/08/2026).
  return import.meta.env.VITE_BRANDFETCH_CLIENT_ID ?? undefined;
}

/** Brandfetch ticker hotlink con w/h retina + fallback lettermark (formato verificado). */
export function symbolToBrandfetchTickerUrl(
  symbol: string,
  clientId?: string,
  size: number = 32,
  theme: BrandTheme = "light",
): string | null {
  return _tickerUrl(symbol, resolveClientId(clientId), size, theme);
}

/** Brandfetch domain hotlink con w/h retina + fallback lettermark — solo si hay dominio mapeado. */
export function symbolToBrandfetchDomainUrl(
  symbol: string,
  clientId?: string,
  size: number = 32,
  theme: BrandTheme = "light",
): string | null {
  return _domainUrl(symbol, resolveClientId(clientId), size, theme);
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
  return _url(symbol, _market, size, theme, resolveClientId(clientId));
}
