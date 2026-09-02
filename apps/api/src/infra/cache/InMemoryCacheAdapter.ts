import type { CachePort } from "../../ports/cache.js";

const MAX_KEYS = 500;
const SWEEP_INTERVAL_MS = 60_000;

interface Entry {
  raw: string;
  expiresAt: number;
}

export class InMemoryCacheAdapter implements CachePort {
  private store = new Map<string, Entry>();
  private inflight = new Map<string, Promise<unknown>>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // autolimpia cada 60s
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // no bloquear exit
    if (this.sweepTimer && typeof (this.sweepTimer as any).unref === "function") {
      (this.sweepTimer as any).unref();
    }
  }

  isEnabled(): boolean {
    return true;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = this.store.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        this.store.delete(key);
        return null;
      }
      // LRU: reinsertar al final para marcarlo como recientemente usado
      this.store.delete(key);
      this.store.set(key, entry);
      return JSON.parse(entry.raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<boolean> {
    try {
      const raw = JSON.stringify(value);
      if (raw === undefined) return false;
      // LRU eviction
      if (!this.store.has(key) && this.store.size >= MAX_KEYS) {
        const oldest = this.store.keys().next().value as string | undefined;
        if (oldest) this.store.delete(oldest);
      } else if (this.store.has(key)) {
        this.store.delete(key);
      }
      this.store.set(key, { raw, expiresAt: Date.now() + ttlMs });
      return true;
    } catch {
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      return this.store.delete(key);
    } catch {
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const out: (T | null)[] = [];
    for (const k of keys) {
      // lazy purge inside get
      // eslint-disable-next-line no-await-in-loop
      const v = await this.get<T>(k);
      out.push(v);
    }
    return out;
  }

  async exists(key: string): Promise<number> {
    try {
      const entry = this.store.get(key);
      if (!entry) return 0;
      if (entry.expiresAt <= Date.now()) {
        this.store.delete(key);
        return 0;
      }
      return 1;
    } catch {
      return 0;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const entry = this.store.get(key);
      if (!entry) return -2;
      const remaining = entry.expiresAt - Date.now();
      if (remaining <= 0) {
        this.store.delete(key);
        return -2;
      }
      return Math.ceil(remaining / 1000);
    } catch {
      return -2;
    }
  }

  async getOrSet<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = (async () => {
      try {
        const value = await loader();
        await this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }

  /** Limpia todo el store — útil para tests */
  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  destroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, e] of this.store) {
      if (e.expiresAt <= now) this.store.delete(k);
    }
  }
}
