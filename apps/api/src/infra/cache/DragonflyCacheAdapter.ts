import type { CachePort } from "../../ports/cache.js";
import { InMemoryCacheAdapter } from "./InMemoryCacheAdapter.js";

// lazy import type para no requerir ioredis en tests sin instalar
type RedisType = import("ioredis").default;

export class DragonflyCacheAdapter implements CachePort {
  private client: RedisType | null = null;
  private fallback: InMemoryCacheAdapter | null = null;
  private enabled: boolean;
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly url: string) {
    const trimmed = (url ?? "").trim();
    if (!trimmed) {
      this.enabled = false;
      this.fallback = new InMemoryCacheAdapter();
      return;
    }
    try {
      const parsed = new URL(trimmed);
      if (!["redis:", "rediss:"].includes(parsed.protocol)) throw new Error("invalid protocol");
      this.enabled = true;
      // dynamic require ioredis — fallback a InMemory si no está instalado
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const IORedis = this.loadIORedis();
      if (!IORedis) {
        this.enabled = false;
        this.fallback = new InMemoryCacheAdapter();
        console.warn("[DragonflyCacheAdapter] ioredis no disponible → fallback InMemory");
        return;
      }
      this.client = new IORedis(trimmed, {
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        enableReadyCheck: false,
        enableAutoPipelining: true,
      } as any);
      // no bloquear boot: capturar errores de conexión
      this.client.on("error", (err: Error) => {
        console.warn("[DragonflyCacheAdapter] redis error:", err.message);
      });
    } catch (e) {
      console.warn("[DragonflyCacheAdapter] CACHE_URL inválida, fallback InMemory:", (e as Error).message);
      this.enabled = false;
      this.fallback = new InMemoryCacheAdapter();
    }
  }

  private loadIORedis(): (new (...args: any[]) => RedisType) | null {
    try {
      // dynamic import via createRequire
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { createRequire } = require("node:module");
      const req = createRequire(import.meta.url);
      const mod = req("ioredis");
      return (mod.default ?? mod) as any;
    } catch {
      return null;
    }
  }

  isEnabled(): boolean {
    if (this.fallback) return this.fallback.isEnabled();
    return this.enabled;
  }

  private useFallback(): boolean {
    return this.fallback !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.useFallback()) return this.fallback!.get<T>(key);
    try {
      if (!this.client) return null;
      const raw = await (this.client as any).get(key);
      if (raw == null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn("[DragonflyCacheAdapter] get error:", (err as Error).message);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<boolean> {
    if (this.useFallback()) return this.fallback!.set(key, value, ttlMs);
    try {
      if (!this.client) return false;
      const raw = JSON.stringify(value);
      if (raw === undefined) return false;
      // SET key value PX ttlMs
      const res = await (this.client as any).set(key, raw, "PX", ttlMs);
      return res === "OK";
    } catch (err) {
      console.warn("[DragonflyCacheAdapter] set error:", (err as Error).message);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (this.useFallback()) return this.fallback!.del(key);
    try {
      if (!this.client) return false;
      const n = await (this.client as any).del(key);
      return n > 0;
    } catch (err) {
      console.warn("[DragonflyCacheAdapter] del error:", (err as Error).message);
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (this.useFallback()) return this.fallback!.mget<T>(keys);
    try {
      if (!this.client) return keys.map(() => null);
      const raws: (string | null)[] = await (this.client as any).mget(...keys);
      return raws.map((r) => {
        if (r == null) return null;
        try {
          return JSON.parse(r) as T;
        } catch {
          return null;
        }
      });
    } catch (err) {
      console.warn("[DragonflyCacheAdapter] mget error:", (err as Error).message);
      return keys.map(() => null);
    }
  }

  async exists(key: string): Promise<number> {
    if (this.useFallback()) return this.fallback!.exists(key);
    try {
      if (!this.client) return 0;
      const n: number = await (this.client as any).exists(key);
      return n;
    } catch (err) {
      console.warn("[DragonflyCacheAdapter] exists error:", (err as Error).message);
      return 0;
    }
  }

  async ttl(key: string): Promise<number> {
    if (this.useFallback()) return this.fallback!.ttl(key);
    try {
      if (!this.client) return -2;
      const n: number = await (this.client as any).ttl(key);
      return n;
    } catch (err) {
      console.warn("[DragonflyCacheAdapter] ttl error:", (err as Error).message);
      return -2;
    }
  }

  async getOrSet<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    if (this.useFallback()) return this.fallback!.getOrSet<T>(key, ttlMs, loader);
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

  async ping(): Promise<boolean> {
    if (this.useFallback()) return true;
    try {
      if (!this.client) return false;
      const res = await (this.client as any).ping();
      return res === "PONG";
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.fallback) {
      this.fallback.destroy();
      return;
    }
    if (this.client) {
      try {
        await (this.client as any).quit();
      } catch {
        try {
          (this.client as any).disconnect();
        } catch {
          // noop
        }
      }
    }
  }
}
