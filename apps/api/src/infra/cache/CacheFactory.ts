import type { CachePort } from "../../ports/cache.js";
import { InMemoryCacheAdapter } from "./InMemoryCacheAdapter.js";
import { DragonflyCacheAdapter } from "./DragonflyCacheAdapter.js";
import { getCacheConfig } from "../../config/env.js";

let singleton: CachePort | null = null;

export function getCache(): CachePort {
  if (singleton) return singleton;
  const cfg = getCacheConfig();
  if (!cfg.enabled || !cfg.url) {
    singleton = new InMemoryCacheAdapter();
    return singleton;
  }
  // Si Dragonfly falla en construcción, su constructor hace fallback interno a InMemory
  singleton = new DragonflyCacheAdapter(cfg.url);
  return singleton;
}

export async function deleteCache(): Promise<void> {
  if (!singleton) return;
  const c: any = singleton;
  // InMemory destroy
  if (typeof c.destroy === "function") c.destroy();
  if (typeof c.disconnect === "function") {
    try {
      await c.disconnect();
    } catch {
      // noop
    }
  }
  singleton = null;
}

// Para tests: forzar InMemory aunque haya URL
export function setCacheForTests(cache: CachePort): void {
  singleton = cache;
}
