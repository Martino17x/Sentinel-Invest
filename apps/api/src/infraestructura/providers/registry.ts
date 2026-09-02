import type { BrokerType, BrokerProvider } from "../../services/iol/ports.js";
import { BrokerNotEnabled } from "../../services/iol/types.js";
import { MockIolProvider } from "../../services/iol/MockIolProvider.js";
import { IolApiProvider } from "./iol/IolApiProvider.js";
import { PpiProvider } from "./ppi/PpiProvider.js";
import { BymaClient } from "./byma/BymaClient.js";
import { BymaFichaClient } from "./byma/BymaFichaClient.js";
import { QuoteService } from "../../aplicacion/cotizaciones/QuoteService.js";
import type { MarketDataPort } from "../../services/iol/ports.js";
import { CachedMarketDataPort } from "../../infra/cache/CachedMarketDataPort.js";
import { getCache } from "../../infra/cache/CacheFactory.js";
import { getCacheConfig } from "../../config/env.js";

// ============================================================
// Registry multibroker — Commit 3 (Req 3,4,8)
// Map<BrokerType, ProviderFactory> con kill-switch por env
// y cache por broker. BYMA fallback por broker (Req 4).
// PPI registrado con factory + fallback BYMA por broker.
// ============================================================

export type ProviderFactory = () => BrokerProvider | Promise<BrokerProvider>;

const registry = new Map<BrokerType, ProviderFactory>();
const cache = new Map<BrokerType, BrokerProvider>();

/**
 * Wrapper fallback BYMA por broker (Req 4).
 * Cada broker tiene su propia cadena: MARKET_DATA_PROVIDER_{BROKER}
 * aísla fallback — zeroQuote de ppi no contamina iol y viceversa.
 * Commit 3: MARKET_DATA_PROVIDER global → por broker.
 */
export class QuoteFallbackProvider implements BrokerProvider {
  private byma: MarketDataPort = new QuoteService(new BymaClient(), new BymaFichaClient());
  constructor(
    private accountProvider: BrokerProvider,
    private brokerType: BrokerType = "iol"
  ) {}

  private get quoteMode(): string {
    const key = `MARKET_DATA_PROVIDER_${this.brokerType.toUpperCase()}`;
    const perBroker = process.env[key] as string | undefined;
    if (perBroker === "iol" || perBroker === "byma" || perBroker === "auto") return perBroker;
    // compat legacy QUOTE_PROVIDER (1 sprint)
    const legacy = process.env.QUOTE_PROVIDER;
    if (legacy === "iol" || legacy === "byma" || legacy === "auto") {
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `[deprecado] QUOTE_PROVIDER=${legacy} → usar MARKET_DATA_PROVIDER_IOL/MARKET_DATA_PROVIDER_PPI`
        );
      }
      return legacy;
    }
    // defaults por broker
    return this.brokerType === "ppi" ? "byma" : "iol";
  }

  private async withFallback<T>(iolFn: () => Promise<T>, bymaFn: () => Promise<T>): Promise<T> {
    const mode = this.quoteMode;
    if (mode === "byma") return bymaFn();
    try {
      const result = await iolFn();
      if (mode === "auto" && isPanelEmpty(result)) return bymaFn();
      return result;
    } catch (err) {
      if (mode === "auto") return bymaFn();
      throw err;
    }
  }

  async getQuote(creds: any, symbol: string, market: string) {
    const mode = this.quoteMode;
    if (mode === "byma") return this.byma.getQuote(creds, symbol, market);
    try {
      const result = await (this.accountProvider as any).getQuote(creds, symbol, market);
      if (mode === "auto" && (result.lastPrice <= 0 || Number.isNaN(result.lastPrice))) {
        return this.byma.getQuote(creds, symbol, market);
      }
      return result;
    } catch (err) {
      if (mode === "auto") return this.byma.getQuote(creds, symbol, market);
      throw err;
    }
  }

  async getQuoteHistory(creds: any, symbol: string, market: string, days: number) {
    const mode = this.quoteMode;
    if (mode === "byma") return this.byma.getQuoteHistory(creds, symbol, market, days);
    try {
      const fromPrimary = await (this.accountProvider as any).getQuoteHistory(creds, symbol, market, days);
      if (mode === "auto" && fromPrimary.length === 0) {
        // fallback a BYMA si primario vacío y auto
        return this.byma.getQuoteHistory(creds, symbol, market, days);
      }
      if (fromPrimary.length > 0) return fromPrimary;
      // auto: si primario devolvió vacío, intentar BYMA
      if (mode === "auto") return this.byma.getQuoteHistory(creds, symbol, market, days);
      return fromPrimary;
    } catch {
      if (mode === "auto") return this.byma.getQuoteHistory(creds, symbol, market, days);
      throw new Error("History fallback failed");
    }
  }

  async getPanel(creds: any, market: string, assetType: string, page?: number, pageSize?: number, q?: string) {
    return this.withFallback(
      () => (this.accountProvider as any).getPanel(creds, market, assetType, page, pageSize, q),
      () => this.byma.getPanel(creds, market, assetType, page, pageSize, q)
    );
  }

  getPortfolio(creds: any, accountNumber: string) {
    return (this.accountProvider as any).getPortfolio(creds, accountNumber);
  }
  getOperations(creds: any, accountNumber: string, filters?: any) {
    return (this.accountProvider as any).getOperations(creds, accountNumber, filters);
  }
  getPortfolioHistory(creds: any, accountNumber: string, days: number) {
    return (this.accountProvider as any).getPortfolioHistory(creds, accountNumber, days);
  }
  getMonthlyCloses(creds: any, accountNumber: string) {
    return (this.accountProvider as any).getMonthlyCloses(creds, accountNumber);
  }
  getMonthlyReport(creds: any, accountNumber: string, month: string) {
    return (this.accountProvider as any).getMonthlyReport(creds, accountNumber, month);
  }
  // Trading/FCI passthrough si el provider los implementa
  placeOrder?(creds: any, accountNumber: string, order: any) {
    const fn = (this.accountProvider as any).placeOrder;
    if (typeof fn === "function") return fn.call(this.accountProvider, creds, accountNumber, order);
    throw new Error("placeOrder no soportado");
  }
  cancelOperation?(creds: any, operationNumber: string) {
    const fn = (this.accountProvider as any).cancelOperation;
    if (typeof fn === "function") return fn.call(this.accountProvider, creds, operationNumber);
    throw new Error("cancelOperation no soportado");
  }
}

function isPanelEmpty(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const r = result as { quotes?: unknown };
  return Array.isArray(r.quotes) && r.quotes.length === 0;
}

export function isBrokerEnabled(brokerType: BrokerType): boolean {
  const key = `BROKER_${brokerType.toUpperCase()}_ENABLED`;
  const raw = process.env[key];
  if (raw === undefined) {
    // Defaults: IOL habilitado, PPI deshabilitado hasta validar playground (Req 8, 3.1)
    return brokerType === "iol";
  }
  return raw !== "false" && raw !== "0" && raw.toLowerCase() !== "false";
}

export function registerBroker(brokerType: BrokerType, factory: ProviderFactory): void {
  registry.set(brokerType, factory);
  cache.delete(brokerType);
}

export function clearRegistry(): void {
  registry.clear();
  cache.clear();
}

export async function getBrokerProvider(
  brokerType: BrokerType = "iol",
  _userId?: string
): Promise<BrokerProvider> {
  if (!isBrokerEnabled(brokerType)) {
    throw new BrokerNotEnabled(brokerType);
  }
  const factory = registry.get(brokerType);
  if (!factory) {
    throw new BrokerNotEnabled(brokerType);
  }
  if (cache.has(brokerType)) return cache.get(brokerType)!;
  const result = factory();
  const rawProvider = result instanceof Promise ? await result : result;
  // Wrap con cache hexagonal si CACHE_ENABLED — Req4: env-gated decorator
  const cfg = getCacheConfig();
  let provider: BrokerProvider = rawProvider;
  if (cfg.enabled) {
    try {
      const cachePort = getCache();
      // QuoteFallbackProvider ya contiene MarketDataPort; envolver todo como MarketDataPort+BrokerProvider
      provider = new CachedMarketDataPort(
        rawProvider as unknown as MarketDataPort,
        cachePort,
        brokerType,
      ) as unknown as BrokerProvider;
      // delegar portfolio/ops si CachedMarketDataPort no los cachea (passthrough)
      // copiar métodos no MarketData para que BrokerProvider siga funcionando
      for (const k of ["getPortfolio", "getOperations", "getPortfolioHistory", "getMonthlyCloses", "getMonthlyReport", "placeOrder", "cancelOperation"] as const) {
        const fn = (rawProvider as any)[k];
        if (typeof fn === "function" && typeof (provider as any)[k] !== "function") {
          (provider as any)[k] = fn.bind(rawProvider);
        }
      }
    } catch (e) {
      console.warn("[registry] cache wrap failed, usando provider sin cache:", (e as Error).message);
      provider = rawProvider;
    }
  }
  cache.set(brokerType, provider);
  return provider;
}

// Registro default IOL (Req 3): factory respeta IOL_PROVIDER=mock|api
function createIolProvider(): BrokerProvider {
  const mode = process.env.IOL_PROVIDER ?? "mock";
  if (mode === "mock") return new MockIolProvider() as unknown as BrokerProvider;
  return new QuoteFallbackProvider(new IolApiProvider() as unknown as BrokerProvider, "iol") as unknown as BrokerProvider;
}

function createPpiProvider(): BrokerProvider {
  // PPI MarketData PPI + BYMA fallback por broker (Req 4)
  // BROKER_PPI_ENABLED=false por default evita exponer incompleto
  return new QuoteFallbackProvider(new PpiProvider() as unknown as BrokerProvider, "ppi") as unknown as BrokerProvider;
}

registerBroker("iol", createIolProvider);
registerBroker("ppi", createPpiProvider);

// Compat: re-export tipos
export type { BrokerType } from "../../services/iol/ports.js";
