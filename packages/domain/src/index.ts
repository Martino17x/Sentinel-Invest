/**
 * @sentinel/domain — núcleo de dominio compartido (settlements, tickers,
 * catálogo CEDEAR, brands). Package source-only sin deps runtime.
 */
export {
  resolveBaseSymbol,
  resolveSettlementSuffix,
  type BaseSources,
  type SettlementType,
} from "./settlement";
export { normalizeSymbol } from "./ticker";
export {
  CEDEAR_RATIOS,
  RATIO_MAP,
  getRatio,
  type CedearRatio,
} from "./catalog/ratios";
export { INSTRUMENT_NAMES } from "./catalog/names.manual";
export {
  GENERATED_CEDEAR_NAMES,
  DEFAULT_DISPLAY_SOURCES,
  resolveDisplayName,
  getInstrumentDisplayName,
  getSettlementSuffix,
  getBaseSymbol,
  type DisplayNameSources,
} from "./catalog/names";
export {
  AR_DOMAIN_MAP,
  BOND_SYMBOLS,
  CEDEAR_DOMAIN_MAP,
  SYMBOL_DOMAIN_MAP,
  getBrandDomain,
  getCanonicalTicker,
  getGoogleFaviconUrl,
  isBond,
  stripMarketSuffix,
} from "./brand/domains";
export type { BrandTheme } from "./brand/domains";
export {
  symbolToBrandfetchDomainUrl,
  symbolToBrandfetchTickerUrl,
  symbolToBrandfetchUrl,
} from "./brand/brandfetch";
