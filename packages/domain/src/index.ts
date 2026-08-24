/**
 * @sentinel/domain — núcleo de dominio compartido (settlements, tickers,
 * catálogo CEDEAR, brands). Package source-only sin deps runtime.
 */
export {
  isUsdSettlementVariant as isUsdSettlementVariantBase,
  resolveBaseSymbol,
  resolveSettlementSuffix,
  type BaseSources,
  type SettlementType as DomainSettlementType,
} from "./settlement";
export { MarketCode, SettlementType, IOL_MARKET_CODE_MAP } from "./tipos";
export * from "./ccl";
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
  getBaseSymbol,
  getInstrumentDisplayName,
  getSettlementSuffix,
  isUsdSettlementVariant,
  resolveDisplayName,
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
