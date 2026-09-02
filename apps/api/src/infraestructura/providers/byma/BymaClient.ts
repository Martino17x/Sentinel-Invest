import type { BymaInstrument, BymaResponse } from "./BymaMapper.js";

const API_BASE = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free";

const REQUEST_BODY = {
  excludeZeroPxAndQty: false,
  T1: true,
  T0: false,
  page_size: 5000,
};

const PANEL_TTL_MS = 30_000;
const QUOTE_TIMEOUT_MS = 4_000;

export class BymaClient {
  private panelCache = new Map<string, { data: BymaInstrument[]; expiresAt: number }>();
  private panelInflight = new Map<string, Promise<BymaInstrument[]>>();

  async postPanel(endpoint: string, signal?: AbortSignal): Promise<BymaInstrument[]> {
    const cached = this.panelCache.get(endpoint);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
    const inflight = this.panelInflight.get(endpoint);
    if (inflight) return inflight;

    const promise = this.fetchPanel(endpoint, signal);
    this.panelInflight.set(endpoint, promise);
    try {
      const data = await promise;
      this.panelCache.set(endpoint, { data, expiresAt: Date.now() + PANEL_TTL_MS });
      return data;
    } finally {
      this.panelInflight.delete(endpoint);
    }
  }

  async fetchPanel(endpoint: string, outerSignal?: AbortSignal): Promise<BymaInstrument[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
    const onOuterAbort = () => controller.abort();
    if (outerSignal) {
      if (outerSignal.aborted) controller.abort();
      else outerSignal.addEventListener("abort", onOuterAbort, { once: true });
    }
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Referer: "https://open.bymadata.com.ar/",
          Origin: "https://open.bymadata.com.ar",
        },
        body: JSON.stringify(REQUEST_BODY),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }

    if (!res.ok) {
      throw new Error(`BYMADATA ${endpoint}: HTTP ${res.status}`);
    }

    const json = (await res.json()) as BymaResponse | BymaInstrument[];
    if (Array.isArray(json)) {
      return json;
    }
    return json.data ?? [];
  }

  async getMarketOpen(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/market-open`);
      if (!res.ok) return false;
      return (await res.json()) as boolean;
    } catch {
      return false;
    }
  }

  async getQuoteHistory(symbol: string, days: number): Promise<{ date: string; close: number }[]> {
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - days * 24 * 60 * 60;
      const res = await fetch(
        `${API_BASE}/chart/historical-series/history?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}`,
        { headers: { "Content-Type": "application/json" } }
      );
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { t?: number[]; c?: number[] };
      if (!data.t || !data.c || data.t.length === 0) {
        return [];
      }
      return data.t.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString(),
        close: Number(data.c?.[i] ?? 0),
      }));
    } catch {
      return [];
    }
  }
}

export { API_BASE, REQUEST_BODY, PANEL_TTL_MS, QUOTE_TIMEOUT_MS };
