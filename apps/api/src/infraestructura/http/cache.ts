// ============================================================
// Cache SWR genérico para el servicio de mercado
//
// Un Map<string, {expiresAt, data}> con la política stale-while-
// revalidate: la entrada vencida se SIGUE SIRVIENDO y el refresco
// corre en background (ver yahoo.ts). El patrón de `stale` como
// último recurso viene de services/rates.ts; acá se generaliza
// con TTL configurable por instancia.
// ============================================================

export interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

export class SwrCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  /** Devuelve la data cacheada (puede estar vencida) o null si nunca se guardó */
  get(key: string): T | null {
    return this.store.get(key)?.data ?? null;
  }

  /** Devuelve la entrada completa (data + expiresAt) o null */
  getEntry(key: string): CacheEntry<T> | null {
    return this.store.get(key) ?? null;
  }

  isFresh(entry: CacheEntry<T>): boolean {
    return entry.expiresAt > Date.now();
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Solo para tests: vacía la cache compartida entre requests. */
  resetForTests(): void {
    this.store.clear();
  }
}
