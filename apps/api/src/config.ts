// ============================================================
// Feature flags — renta-fija-curva (Batch 0)
// Default OFF: flag === "true" explícito para habilitar.
// Patrón kill-switch: rollback sin deploy (env var).
// ============================================================

export const BONDS_ANALYTICS_ENABLED = process.env.BONDS_ANALYTICS_ENABLED === "true";

export const BONDS_SNAPSHOT_ENABLED = process.env.BONDS_SNAPSHOT_ENABLED === "true";
