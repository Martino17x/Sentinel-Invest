/**
 * Feature `noticias` — fuente única para newsApi.
 * Extraído de lib/api.ts (SDD dashboard-features-resto C5).
 * Mover, no duplicar. Importa apiFetch desde lib/api-client para evitar ciclo con shim.
 * Ownership: NewsItem/NewsData/NewsProvider viven aquí; analisis importa tipos para InsightsData.
 */

import { apiFetch } from "@/lib/api-client";

export type NewsProvider = "gnews" | "finnhub" | "tradingview" | "yahoo";

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
  symbol: string | null;
  summary: string | null;
  /** Canonical image field (primary). Null when provider has no image. */
  image?: string | null;
  /** Alias for image — legacy consumers reading imageUrl */
  imageUrl?: string | null;
  /** Canonical long description (GNews description / Finnhub summary) */
  description?: string | null;
  /** Full body when available (GNews content) */
  content?: string | null;
  /** Alias for url (legacy consumers using link) */
  link?: string;
  /** Origin provider of this item */
  provider?: NewsProvider;
  /** True when fallback degraded (TV title-only, quota hit) */
  degraded?: boolean;
}

export interface NewsData {
  source: NewsProvider;
  items: NewsItem[];
  degraded?: boolean;
}

export const newsApi = {
  async getFeed(limit = 5): Promise<{ items: NewsItem[]; news: NewsItem[]; count: number }> {
    return apiFetch(`/analysis/news/feed?limit=${limit}`);
  },
  async getDetail(id: string): Promise<{ news: NewsItem; item: NewsItem }> {
    return apiFetch(`/analysis/news/${encodeURIComponent(id)}`);
  },
};
