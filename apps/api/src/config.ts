// ============================================================
// Feature flags — renta-fija (Batch 0 + Abbaco Free)
// Default ON: flag !== "false" (opt-out). Kill-switch: env === "false" apaga.
// Patrón kill-switch: rollback sin deploy (env var).
// ============================================================

export let BONDS_ENABLED = process.env.BONDS_ENABLED !== "false" || process.env.BONDS_ANALYTICS_ENABLED !== "false";

export let BONDS_ANALYTICS_ENABLED = process.env.BONDS_ANALYTICS_ENABLED !== "false";

export let BONDS_SNAPSHOT_ENABLED = process.env.BONDS_SNAPSHOT_ENABLED !== "false";

export let BONDS_PANEL_ENABLED = process.env.BONDS_PANEL_ENABLED !== "false";

export let BONDS_ONS_ENABLED = process.env.BONDS_ONS_ENABLED !== "false";

export let BONDS_COMPARE_ENABLED = process.env.BONDS_COMPARE_ENABLED !== "false";

export let BONDS_CER_DYNAMIC = process.env.BONDS_CER_DYNAMIC !== "false";

// Aliases compat para spec abbaco-free (REQ-BAV / REQ-BUO)
// BONDS_CER_DYNAMIC ya expuesto; BONDS_ENABLED es master kill-switch
export const BONDS_CER_ENABLED = BONDS_CER_DYNAMIC;

// Test helper — allow integration tests to enable flags without process.env restart
export function setBondsFlagsForTests(flags: { analytics?: boolean; panel?: boolean; snapshot?: boolean; ons?: boolean; compare?: boolean; cerDynamic?: boolean; enabled?: boolean }): void {
  if (flags.analytics !== undefined) BONDS_ANALYTICS_ENABLED = flags.analytics;
  if (flags.enabled !== undefined) BONDS_ENABLED = flags.enabled;
  if (flags.panel !== undefined) BONDS_PANEL_ENABLED = flags.panel;
  if (flags.snapshot !== undefined) BONDS_SNAPSHOT_ENABLED = flags.snapshot;
  if (flags.ons !== undefined) BONDS_ONS_ENABLED = flags.ons;
  if (flags.compare !== undefined) BONDS_COMPARE_ENABLED = flags.compare;
  if (flags.cerDynamic !== undefined) BONDS_CER_DYNAMIC = flags.cerDynamic;
}
