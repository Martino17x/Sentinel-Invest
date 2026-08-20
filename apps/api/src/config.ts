// ============================================================
// Feature flags — renta-fija-curva (Batch 0)
// Default OFF: flag === "true" explícito para habilitar.
// Patrón kill-switch: rollback sin deploy (env var).
// ============================================================

export let BONDS_ANALYTICS_ENABLED = process.env.BONDS_ANALYTICS_ENABLED === "true";

export let BONDS_SNAPSHOT_ENABLED = process.env.BONDS_SNAPSHOT_ENABLED === "true";

export let BONDS_PANEL_ENABLED = process.env.BONDS_PANEL_ENABLED === "true";

// Test helper — allow integration tests to enable flags without process.env restart
export function setBondsFlagsForTests(flags: { analytics?: boolean; panel?: boolean; snapshot?: boolean }): void {
  if (flags.analytics !== undefined) BONDS_ANALYTICS_ENABLED = flags.analytics;
  if (flags.panel !== undefined) BONDS_PANEL_ENABLED = flags.panel;
  if (flags.snapshot !== undefined) BONDS_SNAPSHOT_ENABLED = flags.snapshot;
}
