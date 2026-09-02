/**
 * CachePort hexagonal — Req 1
 * JSON serialization, error no-throw, TTL en ms en set/getOrSet, ttl() retorna segs.
 */
export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  exists(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  isEnabled(): boolean;
  getOrSet<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T>;
}
