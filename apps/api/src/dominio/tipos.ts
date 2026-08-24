/**
 * Re-export puro — fuente canónica en @sentinel/domain (SDD6).
 * Cero redefiniciones locales; evita drift de MarketCode/SettlementType.
 * No tocar dominio/dolares/* (WIP bonos).
 */
export { MarketCode, SettlementType, IOL_MARKET_CODE_MAP, isUsdSettlementVariant } from "@sentinel/domain";
export type { DomainSettlementType, BaseSources } from "@sentinel/domain";
