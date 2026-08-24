// ============================================================
// Data912Provider.ts — Canonical provider para data912.com
// TODO T-007: WIP placeholder — implementación real pendiente.
// Re-export lower-case alias completa compatibilidad.
// Endpoint previsto: GET https://data912.com/live/arg_bonds
// Fallback BYMA 5s/timeout 500, retry 1, SwrCache
// ============================================================

// Stub mínimo para consumidores que importan directamente el canonical
// TODO T-007: implementar fetchLive, getPanel, etc.
export const Data912Provider = {
  name: "Data912Provider (stub T-007)",
} as const;

// Re-export compat: si en el futuro lower-case agrega exports, estarán disponibles aquí
// (no circular: lower-case re-exporta este archivo, este no re-exporta lower-case)
