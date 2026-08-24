/**
 * Feature `dolar` — fuente única para ratesApi.
 * Extraído de lib/api.ts (SDD dashboard-features-resto C6).
 * Mover, no duplicar. Importa apiFetch desde lib/api-client para evitar ciclo con shim.
 */

import { apiFetch } from "@/lib/api-client";

export interface DolarQuote {
  moneda: string;
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

export const ratesApi = {
  async getDolares(): Promise<{ dolares: DolarQuote[] }> {
    return apiFetch("/rates/dolares");
  },
};
