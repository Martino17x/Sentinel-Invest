// ============================================================
// data912Provider.ts — Alias lower-case para compatibilidad task spec
// Re-exporta bonds/Data912Provider (canonical) para que ambas rutas
// apps/api/src/services/market/data912Provider.ts y
// apps/api/src/services/market/bonds/Data912Provider.ts funcionen.
// Endpoint: GET https://data912.com/live/arg_bonds, fallback BYMA 5s/timeout 500, retry 1, SwrCache
// ============================================================
export * from "./bonds/Data912Provider.js";
