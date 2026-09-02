import type { MarketDataPort } from "../../services/iol/ports.js";
import type { IolCredentials, PanelQuote, PanelSummary, Quote } from "../../services/iol/types.js";
import type { CachePort } from "../../ports/cache.js";
import { buildCacheKey, getTtlForMethod } from "./normalizeForCache.js";
import { getCacheConfig } from "../../config/env.js";

/**
 * CachedMarketDataPort — decorator hexagonal.
 * Envuelve MarketDataPort con getOrSet + coalescing inflight + source stamping.
 * Key: sentinel:quotes:v1:{broker}:{method}:{hash}
 * TTL: getQuote 15s, getPanel/getQuoteHistory 30s
 */
export class CachedMarketDataPort implements MarketDataPort {
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly inner: MarketDataPort,
    private readonly cache: CachePort,
    private readonly broker: string = "iol",
  ) {}

  private ttlFor(method: string): number {
    const cfg = getCacheConfig();
    return getTtlForMethod(method, { quotesMs: cfg.ttlQuotesMs, panelMs: cfg.ttlPanelMs });
  }

  private stampQuote<T extends Quote>(q: T, isHit: boolean, cachedFetchedAt?: string): T {
    const nowIso = cachedFetchedAt ?? new Date().toISOString();
    const source = (q as any).source ?? (this.broker === "ppi" ? "byma" : (this.broker as any));
    return {
      ...q,
      source,
      fetchedAt: isHit && cachedFetchedAt ? cachedFetchedAt : nowIso,
      cacheHit: isHit,
    } as T;
  }

  private wrapCached<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    stamp: (value: T, isHit: boolean, cachedFetchedAt?: string) => T,
  ): Promise<T> {
    // si cache deshabilitado → bypass directo
    if (!this.cache.isEnabled()) {
      return loader().then((v) => stamp(v, false));
    }

    // coalescing inflight a nivel decorator además del getOrSet del port
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = (async () => {
      // Intentar get directo para distinguir hit/miss y preservar fetchedAt original
      const cached = await this.cache.get<T & { __fetchedAt?: string; _fetchedAt?: string; fetchedAt?: string }>(key);
      if (cached !== null) {
        const fetchedAt = (cached as any).fetchedAt ?? (cached as any).__fetchedAt;
        return stamp(cached as T, true, fetchedAt);
      }
      const fresh = await this.cache.getOrSet<T>(key, ttlMs, loader);
      // Si getOrSet resolvió por otro concurrente, podría ya estar en cache con fetchedAt
      // Pero para el loader original, stamping es miss
      // Detectar si el valor recién seteado es el que acabamos de cargar: es miss
      return stamp(fresh, false);
    })().finally(() => this.inflight.delete(key));

    this.inflight.set(key, promise);
    return promise;
  }

  async getQuote(creds: IolCredentials, symbol: string, market: string): Promise<Quote> {
    const key = buildCacheKey(this.broker, "getQuote", { symbol, market });
    const ttl = this.ttlFor("getQuote");
    return this.wrapCached<Quote>(
      key,
      ttl,
      () => this.inner.getQuote(creds, symbol, market),
      (q, isHit, cachedFetchedAt) => this.stampQuote(q, isHit, cachedFetchedAt),
    );
  }

  async getPanel(
    creds: IolCredentials,
    market: string,
    assetType: string,
    page?: number,
    pageSize?: number,
    q?: string,
  ): Promise<{ summary: PanelSummary; quotes: PanelQuote[]; total?: number }> {
    const key = buildCacheKey(this.broker, "getPanel", { market, assetType, page, pageSize, q });
    const ttl = this.ttlFor("getPanel");
    type PanelResult = { summary: PanelSummary; quotes: PanelQuote[]; total?: number };
    return this.wrapCached<PanelResult>(
      key,
      ttl,
      () => this.inner.getPanel(creds, market, assetType, page, pageSize, q),
      (panel, isHit, cachedFetchedAt) => {
        const stampedAt = isHit && cachedFetchedAt ? cachedFetchedAt : new Date().toISOString();
        const defaultSource = this.broker === "ppi" ? "byma" : (this.broker as any);
        return {
          ...panel,
          summary: {
            ...panel.summary,
            source: (panel.summary as any).source ?? defaultSource,
            fetchedAt: (panel.summary as any).fetchedAt ?? stampedAt,
            cacheHit: isHit,
          } as PanelSummary,
          quotes: panel.quotes.map((qq) => ({
            ...qq,
            source: (qq as any).source ?? defaultSource,
            fetchedAt: (qq as any).fetchedAt ?? stampedAt,
            cacheHit: isHit,
          })) as PanelQuote[],
        };
      },
    );
  }

  async getQuoteHistory(
    creds: IolCredentials,
    symbol: string,
    market: string,
    days: number,
  ): Promise<{ date: string; close: number }[]> {
    const key = buildCacheKey(this.broker, "getQuoteHistory", { symbol, market, days });
    const ttl = this.ttlFor("getQuoteHistory");
    // history no requiere stamping source; solo cache-hit optimiza BYMA fetches
    if (!this.cache.isEnabled()) return this.inner.getQuoteHistory(creds, symbol, market, days);
    const existing = this.inflight.get(key) as Promise<{ date: string; close: number }[]> | undefined;
    if (existing) return existing;
    const p = this.cache.getOrSet(key, ttl, () => this.inner.getQuoteHistory(creds, symbol, market, days));
    this.inflight.set(key, p as Promise<unknown>);
    p.finally(() => this.inflight.delete(key));
    return p;
  }

  async getBondFichaRaw(symbol: string, signal?: AbortSignal) {
    // ficha no cacheada en L2 (usa snapshot PG L3)
    const fn = (this.inner as any).getBondFichaRaw;
    if (typeof fn === "function") return fn.call(this.inner, symbol, signal);
    return null;
  }

  async getBondSchedule(symbol: string, signal?: AbortSignal) {
    const fn = (this.inner as any).getBondSchedule;
    if (typeof fn === "function") return fn.call(this.inner, symbol, signal);
    throw new Error("getBondSchedule no soportado");
  }

  // passthrough portfolio/ops si inner es BrokerProvider completo
  getPortfolio(creds: any, accountNumber: string) {
    const fn = (this.inner as any).getPortfolio;
    if (typeof fn === "function") return fn.call(this.inner, creds, accountNumber);
    throw new Error("getPortfolio no soportado en MarketDataPort");
  }
  getOperations(creds: any, accountNumber: string, filters?: any) {
    const fn = (this.inner as any).getOperations;
    if (typeof fn === "function") return fn.call(this.inner, creds, accountNumber, filters);
    throw new Error("getOperations no soportado");
  }
  getPortfolioHistory(creds: any, accountNumber: string, days: number) {
    const fn = (this.inner as any).getPortfolioHistory;
    if (typeof fn === "function") return fn.call(this.inner, creds, accountNumber, days);
    throw new Error("getPortfolioHistory no soportado");
  }
  getMonthlyCloses(creds: any, accountNumber: string) {
    const fn = (this.inner as any).getMonthlyCloses;
    if (typeof fn === "function") return fn.call(this.inner, creds, accountNumber);
    throw new Error("getMonthlyCloses no soportado");
  }
  getMonthlyReport(creds: any, accountNumber: string, month: string) {
    const fn = (this.inner as any).getMonthlyReport;
    if (typeof fn === "function") return fn.call(this.inner, creds, accountNumber, month);
    throw new Error("getMonthlyReport no soportado");
  }
}
