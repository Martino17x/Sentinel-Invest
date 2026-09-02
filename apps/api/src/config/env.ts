/**
 * Env config multibroker — Commit 2 (Req 8)
 * Centraliza BROKER_*_ENABLED y MARKET_DATA_PROVIDER_* con compat
 * QUOTE_PROVIDER legacy (warning 1 sprint).
 */

export interface CacheConfig {
  enabled: boolean;
  url: string;
  ttlQuotesMs: number;
  ttlPanelMs: number;
  prefix: string;
}

export function getCacheConfig(): CacheConfig {
  const url = (process.env.CACHE_URL ?? "").trim();
  const rawEnabled = process.env.CACHE_ENABLED;
  const enabled =
    rawEnabled !== undefined
      ? rawEnabled !== "false" && rawEnabled !== "0" && rawEnabled.toLowerCase() !== "false"
      : url.length > 0;
  const ttlQuotesMs = Number(process.env.CACHE_TTL_QUOTES_MS ?? 15_000);
  const ttlPanelMs = Number(process.env.CACHE_TTL_PANEL_MS ?? 30_000);
  return {
    enabled,
    url,
    ttlQuotesMs: Number.isFinite(ttlQuotesMs) ? ttlQuotesMs : 15_000,
    ttlPanelMs: Number.isFinite(ttlPanelMs) ? ttlPanelMs : 30_000,
    prefix: process.env.CACHE_KEY_PREFIX ?? "sentinel:quotes:v1",
  };
}

export function isBrokerEnabled(broker: "iol" | "ppi"): boolean {
  const key = `BROKER_${broker.toUpperCase()}_ENABLED`;
  const raw = process.env[key];
  if (raw === undefined) return broker === "iol";
  return raw !== "false" && raw !== "0" && raw.toLowerCase() !== "false";
}

export type MarketDataProvider = "iol" | "byma" | "auto";

export function getMarketDataProvider(broker: "iol" | "ppi"): MarketDataProvider {
  const perBroker = process.env[`MARKET_DATA_PROVIDER_${broker.toUpperCase()}`] as string | undefined;
  if (perBroker === "iol" || perBroker === "byma" || perBroker === "auto") return perBroker;
  // compat legacy QUOTE_PROVIDER (1 sprint)
  const legacy = process.env.QUOTE_PROVIDER;
  if (legacy) {
    if (process.env.NODE_ENV !== "test") {
      console.warn(`[deprecado] QUOTE_PROVIDER=${legacy} → usar MARKET_DATA_PROVIDER_IOL/MARKET_DATA_PROVIDER_PPI`);
    }
    if (legacy === "iol" || legacy === "byma" || legacy === "auto") return legacy as MarketDataProvider;
  }
  // defaults por broker (Req 4): iol→iol, ppi→byma hasta validar PPI MarketData
  return broker === "ppi" ? "byma" : "iol";
}

// ENCRYPTION_KEY única Fase 1 (Req 5) — documentado: no rotar por broker
export function requireEncryptionKey(): string {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY requerida");
  return k;
}
