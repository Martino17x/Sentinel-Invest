/**
 * SHIM de compatibilidad — la implementación real vive en @sentinel/domain
 * (catálogo CEDEAR: INSTRUMENT_NAMES, ratios, nombres generados y helpers
 * de display). Los tests viejos siguen importando de este path hasta su
 * migración al package (commit 7).
 */
export * from "@sentinel/domain";
