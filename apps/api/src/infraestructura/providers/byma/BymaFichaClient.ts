import type { BondCashflow } from "../../../services/market/bonds/types.js";

const API_BASE = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free";

export interface BymaFicha {
  ley?: string;
  formaAmortizacion?: string;
  interes?: string;
  denominacionMinima?: number;
  fechaEmision?: string;
  fechaVencimiento?: string;
  fechaDevenganIntereses?: string;
  codigoIsin?: string;
  tipoEspecie?: string;
  tipoObligacion?: string;
  moneda?: string;
  montoNominal?: number;
  montoResidual?: number;
  denominacion?: string;
  emisor?: string;
  paisLey?: string;
  insType?: string;
  default?: string;
}

export class BymaFichaClient {
  /** Público — raw BYMA ficha para consumidores avanzados (panel/ficha). */
  async getBondFichaRaw(symbol: string, signal?: AbortSignal): Promise<BymaFicha | null> {
    return this.fetchBondFicha(symbol.toUpperCase().trim(), signal);
  }

  async fetchBondFicha(symbol: string, signal?: AbortSignal): Promise<BymaFicha | null> {
    const url = `${API_BASE}/bnown/fichatecnica/especies/general`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Referer: "https://open.bymadata.com.ar/",
          Origin: "https://open.bymadata.com.ar",
        },
        body: JSON.stringify({ symbol }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (!r.ok) {
        throw new Error(`BYMA ficha ${symbol}: HTTP ${r.status}`);
      }
      const json = (await r.json()) as { data?: BymaFicha[]; empty?: boolean };
      if (json.empty || !json.data || json.data.length === 0) return null;
      return json.data[0] ?? null;
    } catch (err) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (err instanceof Error && err.message.includes("HTTP 4")) return null;
      throw err;
    }
  }

  async fetchMaeDetalleFallback(symbol: string, signal?: AbortSignal): Promise<BondCashflow[] | null> {
    const letras: ("B" | "H")[] = /^BP/.test(symbol) ? ["B", "H"] : ["H", "B"];
    for (const letra of letras) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const url = `https://api.marketdata.mae.com.ar/api/emisiones/flujofondoscotiz/${letra}`;
        const r = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (!r.ok) continue;
        const arr = (await r.json()) as Array<{
          especie: string;
          detalle: Array<{ fechaPago: string; vr?: number; cashFlow: number; renta: number; amortizacion: number }>;
        }>;
        const found = arr.find((it) => it.especie.toUpperCase() === symbol);
        if (found && found.detalle?.length) {
          return found.detalle.map((d) => ({
            fechaPago: d.fechaPago.slice(0, 10),
            renta: Number(d.renta ?? 0),
            amortizacion: Number(d.amortizacion ?? 0),
            cashFlow: Number(d.cashFlow ?? Number(d.renta ?? 0) + Number(d.amortizacion ?? 0)),
            vr: Number(d.vr ?? 100),
          }));
        }
      } catch {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    }
    return null;
  }
}
