// ============================================================
// Cotizaciones del dólar (dolarapi.com) — servicio compartido
//
// Fuente: https://dolarapi.com (gratis, sin auth, JSON limpio).
// Casas: oficial, blue, bolsa (CCL), contadoconliqui, mayorista,
//        cripto, tarjeta — cada una con compra/venta/fechaActualizacion.
// Cache en memoria de 60s compartida entre la ruta HTTP (/api/rates)
// y el tool del agente (get_dollar_rates): 1 llamada upstream por minuto.
// ============================================================

export interface DolarQuote {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

export interface DollarRatesResult {
  dolares: DolarQuote[];
  source: string;
  cached: boolean;
  /** true solo cuando se sirve cache vencida como último recurso */
  stale?: boolean;
}

const DOLARAPI_URL = "https://dolarapi.com/v1/dolares";
const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;

let cache: { data: DolarQuote[]; expiresAt: number } | null = null;

/**
 * Devuelve las cotizaciones del dólar con cache de 60s.
 * - Cache válida → se sirve sin tocar la red (cached: true).
 * - Sin cache → fetch a dolarapi.com con timeout de 8s.
 * - Fallo y cache vencida existente → se sirve como último recurso (stale: true).
 * - Fallo sin cache → lanza Error (el caller decide el status HTTP).
 */
export async function getDollarRates(signal?: AbortSignal): Promise<DollarRatesResult> {
  if (cache && cache.expiresAt > Date.now()) {
    return { dolares: cache.data, source: "dolarapi.com", cached: true };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    const r = await fetch(DOLARAPI_URL, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);

    if (!r.ok) {
      throw new Error(`dolarapi.com respondió ${r.status}`);
    }

    const dolares = (await r.json()) as DolarQuote[];
    cache = { data: dolares, expiresAt: Date.now() + CACHE_TTL_MS };
    return { dolares, source: "dolarapi.com", cached: false };
  } catch (err) {
    // Cache vencida pero existente → servirla como último recurso
    if (cache) {
      return { dolares: cache.data, source: "dolarapi.com (cache)", cached: true, stale: true };
    }
    throw err;
  }
}

/** Solo para tests: permite resetear la cache compartida entre requests. */
export function resetDollarRatesCache(): void {
  cache = null;
}
