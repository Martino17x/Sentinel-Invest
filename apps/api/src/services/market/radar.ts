/**
 * Fachada singleton D6 — delega a RadarOrchestrator (application/radar)
 * Preserva API pública para consumers existentes hasta grep=0.
 */
import { BymaClient } from "../../infraestructura/providers/byma/BymaClient.js";
import { BymaFichaClient } from "../../infraestructura/providers/byma/BymaFichaClient.js";
import { QuoteService } from "../../aplicacion/cotizaciones/QuoteService.js";
import { fetchChart } from "./yahoo.js";
import { isMarketHours } from "./isMarketHours.js";
import { RadarOrchestrator } from "../../aplicacion/radar/RadarOrchestrator.js";

const bymaClient = new BymaClient();
const fichaClient = new BymaFichaClient();
const quoteService = new QuoteService(bymaClient, fichaClient);

const orchestrator = new RadarOrchestrator(
  quoteService,
  fetchChart,
  () => isMarketHours(new Date()),
);

export const getRadar = orchestrator.getRadar.bind(orchestrator);
// reset incluye BymaClient panelCache (TTL 30s) para que tests con stub vean datos frescos
export function resetRadarCacheForTests(): void {
  orchestrator.resetRadarCacheForTests();
  // BymaClient cache es privado — acceso bracket
  (bymaClient as unknown as Record<string, Map<unknown, unknown>>).panelCache?.clear?.();
  (bymaClient as unknown as Record<string, Map<unknown, unknown>>).panelInflight?.clear?.();
}
// alias para spec D4 compat
export const resetForTests = resetRadarCacheForTests;

export { DISCLAIMER } from "../../aplicacion/radar/RadarOrchestrator.js";
export type { RadarRow, CclResponse, RadarSource } from "../../aplicacion/radar/RadarOrchestrator.js";

// Caches vivos — proxy a los SwrCache internos del singleton (mismo objeto que usa getRadar)
export const radarCache: InstanceType<typeof import("./cache.js").SwrCache<any>> = (orchestrator as unknown as Record<string, unknown>)._radarCache as never ?? (orchestrator as unknown as Record<string, unknown>).radarCachePublic as never;
export const baseCache: InstanceType<typeof import("./cache.js").SwrCache<any>> = (orchestrator as unknown as Record<string, unknown>)._baseCache as never ?? (orchestrator as unknown as Record<string, unknown>).baseCachePublic as never;
