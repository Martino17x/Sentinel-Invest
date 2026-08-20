// ============================================================
// QUOTES SNAPSHOT JOB — captura del panel BYMA al cierre
//
// Corre lun-vie 17:05 ART (después del cierre 17:00). Itera las
// combinaciones de (market, assetType) que realmente muestran
// datos en Cotizaciones y persiste cada panel en quotes_snapshots.
//
// Diseño (D3 del scheduler):
// - Dependencies inyectables → testeable con fakes.
// - Un panel que falla se loguea y el job continúa con el resto.
// - Idempotente: saveQuotesSnapshot hace ON CONFLICT UPDATE por
//   (market, assetType, snapshotDate).
// ============================================================

import { BymaDataProvider } from "../services/iol/BymaDataProvider.js";
import { saveQuotesSnapshot } from "../services/market/quotesSnapshotStore.js";

/** Combinaciones reales que la UI expone (ver QuotesPage.tsx:ASSET_TYPES) */
export const QUOTES_PANELS: { market: string; assetType: string }[] = [
  { market: "bcba", assetType: "cedear" },
  { market: "bcba", assetType: "accion" },
  { market: "bcba", assetType: "bono" },
  { market: "bcba", assetType: "on" },
  { market: "bcba", assetType: "caucion" },
  { market: "nyse", assetType: "accion" },
  { market: "nyse", assetType: "cedear" },
];

export interface QuotesSnapshotDeps {
  fetchPanel: (
    market: string,
    assetType: string
  ) => Promise<{ summary: unknown; quotes: unknown[]; total?: number }>;
  saveSnapshot: typeof saveQuotesSnapshot;
  log: Pick<Console, "log" | "warn" | "error">;
}

export interface QuotesSnapshotOutcome {
  market: string;
  assetType: string;
  ok: boolean;
  quotesCount: number;
  error?: string;
}

export function makeQuotesSnapshotDeps(
  overrides: Partial<QuotesSnapshotDeps> = {}
): QuotesSnapshotDeps {
  const provider = new BymaDataProvider();
  // BymaDataProvider no necesita creds reales: pasar dummy
  const dummyCreds = { username: "", password: "" };
  return {
    fetchPanel: async (market: string, assetType: string) => {
      // pageSize grande para capturar el panel completo (BYMA pagina local)
      const result = await provider.getPanel(dummyCreds, market, assetType, 1, 100);
      return result as unknown as { summary: unknown; quotes: unknown[]; total?: number };
    },
    saveSnapshot: saveQuotesSnapshot,
    log: console,
    ...overrides,
  };
}

/**
 * Captura todos los paneles configurados y los persiste.
 * Por panel: fetchPanel → saveSnapshot. Un fallo no detiene el resto.
 */
export async function runQuotesSnapshots(
  deps: QuotesSnapshotDeps
): Promise<QuotesSnapshotOutcome[]> {
  const outcomes: QuotesSnapshotOutcome[] = [];

  for (const { market, assetType } of QUOTES_PANELS) {
    try {
      const panel = await deps.fetchPanel(market, assetType);
      const quotes = (panel.quotes as unknown[]) ?? [];
      const summary = panel.summary as unknown as { isRealtime?: boolean };
      // Solo persistir si hay datos (si BYMA está caído totalmente, no pisar snapshot válido con array vacío)
      if (quotes.length === 0) {
        deps.log.warn(`⚠️ quotes-snapshot [${market}/${assetType}]: panel vacío — no se guarda snapshot`);
        outcomes.push({ market, assetType, ok: false, quotesCount: 0, error: "panel vacío" });
        continue;
      }
      const payload = {
        summary: panel.summary as unknown as import("../services/iol/types.js").PanelSummary,
        quotes: panel.quotes as unknown as import("../services/iol/types.js").PanelQuote[],
        total: panel.total ?? quotes.length,
      };
      await deps.saveSnapshot(market, assetType, payload);
      deps.log.log(`📸 quotes-snapshot [${market}/${assetType}]: ${quotes.length} instrumentos guardados`);
      outcomes.push({ market, assetType, ok: true, quotesCount: quotes.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log.warn(`⚠️ quotes-snapshot [${market}/${assetType}]: ${message}`);
      outcomes.push({ market, assetType, ok: false, quotesCount: 0, error: message });
    }
  }

  return outcomes;
}
