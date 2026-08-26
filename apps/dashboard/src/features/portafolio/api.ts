/**
 * Feature `portafolio` — fuente única para portfolio/operations/series/calendar/movements/metrics.
 * Extraído de lib/api.ts (SDD dashboard-features-resto C2).
 * Mover, no duplicar. Importa apiFetch desde lib/api-client para evitar ciclo con shim.
 */

import { apiFetch } from "@/lib/api-client";

// ============================================================
// Tipos base portafolio
// ============================================================

export interface Position {
  symbol: string;
  name: string;
  assetType: string;
  market: string;
  quantity: number;
  avgPrice: number;
  lastPrice: number;
  currency: string;
  totalValue: number;
  gainLossPct: number;
  gainLossAmount: number;
  dayChangePct: number;
}

export interface PortfolioSummary {
  accountNumber: string;
  cashArs: number;
  cashUsd: number;
  positionsValueArs: number;
  positionsValueUsd: number;
  totalArs: number;
  totalUsd: number;
  gainLossArs: number;
  gainLossUsd: number;
  gainLossPct: number;
  dayChangePct: number;
  dayChangeAmountArs: number;
  dayChangeAmountUsd: number;
  distribution: { label: string; pct: number }[];
  distributionByType: DistributionByTypeItem[];
  positions: Position[];
}

export interface DistributionByTypeItem {
  type: string;
  label: string;
  pct: number;
  amountArs: number;
  amountUsd: number;
}

export interface PortfolioSnapshotPoint {
  capturedAt: string;
  totalValue: number;
  totalValueUsd: number;
  cashArs: number;
  cashUsd: number;
  positionsValue: number;
  dayChangePct: number;
  unrealizedGain: number;
  source: string;
}

export interface Operation {
  iolOperationId: string;
  symbol: string;
  market: string;
  type: string;
  status: string;
  quantity: number;
  price: number;
  total: number;
  commission: number;
  currency: string;
  date: string;
}

// ============================================================
// portfolioApi + operationsApi — GET /api/portfolio, /api/operations
// ============================================================

export const portfolioApi = {
  async get(): Promise<{ portfolio: PortfolioSummary }> {
    return apiFetch("/portfolio");
  },

  async getHistory(days = 90): Promise<{ history: PortfolioSnapshotPoint[] }> {
    return apiFetch(`/portfolio/history?days=${days}`);
  },
};

export const operationsApi = {
  async getAll(): Promise<{ operations: Operation[] }> {
    return apiFetch("/operations");
  },
};

// ============================================================
// Serie diaria + calendario mensual — desde portfolio_snapshots
// (F1/F2). El calendario devuelve TODOS los días del mes: los que
// no tienen snapshot llegan con totalValue/cash en null — el
// frontend NUNCA inventa datos (spec F2-R3), los muestra vacíos.
// ============================================================

export interface SeriesDay {
  date: string;
  totalValue: number;
  totalValueUsd: number;
  cashArs: number;
  cashUsd: number;
  positionsValue: number;
  dayChangePct: number;
  unrealizedGain: number;
  source: string;
}

export interface SeriesPositionPoint {
  date: string;
  symbol: string;
  market: string;
  quantity: number;
  lastPrice: number | null;
  totalValue: number;
}

export interface SeriesResponse {
  days: SeriesDay[];
  positions?: SeriesPositionPoint[];
}

export const seriesApi = {
  async get(from: string, to?: string, includePositions = false): Promise<SeriesResponse> {
    const toParam = to ? `&to=${to}` : "";
    const positions = includePositions ? "&includePositions=true" : "";
    return apiFetch(`/portfolio/series?from=${from}${toParam}${positions}`);
  },
};

export interface CalendarDay {
  date: string;
  totalValue: number | null;
  dayChangePct: number | null;
  source: string | null;
  cashArs: number | null;
  cashUsd: number | null;
  movementCount: number;
}

export interface MonthCalendar {
  month: string;
  days: CalendarDay[];
  bestDay: { date: string; pct: number } | null;
  worstDay: { date: string; pct: number } | null;
  monthReturn: number | null;
}

export const calendarApi = {
  async getMonth(month: string): Promise<MonthCalendar> {
    return apiFetch(`/portfolio/calendar/${month}`);
  },
};

// ============================================================
// Movimientos de efectivo (cash ledger) — cash_movements
// (F3-B6, F3-C1). GET lista (filtros), POST registro manual,
// PATCH confirm/reject, DELETE, import IOL (preview + confirm).
// ============================================================

export type MovementSource = "manual" | "imported" | "detected";
export type MovementStatus = "confirmed" | "pending" | "rejected";
export type MovementType = "deposit" | "withdrawal" | "dividend" | "caucion" | "adjustment";

export interface Movement {
  id: string;
  date: string;
  amount: number;
  currency: "ARS" | "USD";
  type: MovementType;
  source: MovementSource;
  status: MovementStatus;
  description: string | null;
  iolReference: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface ImportRowPreview {
  row: number;
  parsed: {
    nroMov: string;
    liquidDate: string | null;
    monto: number;
    currency: "ARS" | "USD";
    tipo: MovementType;
    tipoMov: string;
  };
  valid: boolean;
  errors: string[];
}

export interface ImportPreview {
  preview: ImportRowPreview[];
  summary: { total: number; valid: number; invalid: number; byType: Record<string, number> };
  errors: string[];
}

export interface CreateMovementInput {
  date: string;
  amount: number;
  currency: "ARS" | "USD";
  type: MovementType;
  description?: string;
}

export const movementsApi = {
  async list(params: { status?: MovementStatus; source?: MovementSource } = {}): Promise<{ movements: Movement[] }> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.source) qs.set("source", params.source);
    const q = qs.toString();
    return apiFetch(`/portfolio/movements${q ? `?${q}` : ""}`);
  },

  async create(input: CreateMovementInput): Promise<{ movement: Movement }> {
    return apiFetch("/portfolio/movements", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async decide(id: string, status: "confirmed" | "rejected"): Promise<{ movement: Movement }> {
    return apiFetch(`/portfolio/movements/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },

  async remove(id: string): Promise<void> {
    return apiFetch(`/portfolio/movements/${id}`, { method: "DELETE" });
  },

  // Preview del export HTML de IOL: el backend espera el HTML CRUDO
  // como cuerpo de texto (express.text). Enviamos text/plain.
  async importPreview(html: string): Promise<ImportPreview> {
    return apiFetch("/portfolio/movements/import", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: html,
    });
  },

  async importConfirm(rows: ImportRowPreview["parsed"][]): Promise<{ imported: number; skipped: number }> {
    return apiFetch("/portfolio/movements/import/confirm", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
  },
};

// ============================================================
// Métricas de cartera — GET /api/portfolio/metrics (F3-A1, D11)
// Devuelve volatilidad, sharpe, maxDrawdown, correlación Merval,
// YTD, retorno del período y la rf usada (default 0).
// ============================================================

export interface PortfolioMetrics {
  volatility: number;
  sharpe: number | null;
  maxDrawdown: number;
  mervalCorrelation: number | null;
  ytd: number | null;
  periodReturn: number;
  rf: number;
}

export const metricsApi = {
  async get(params: { from?: string; to?: string; days?: number; rf?: number } = {}): Promise<PortfolioMetrics> {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.days) qs.set("days", String(params.days));
    if (params.rf !== undefined) qs.set("rf", String(params.rf));
    const q = qs.toString();
    return apiFetch(`/portfolio/metrics${q ? `?${q}` : ""}`);
  },
};

// ============================================================
// Portafolios virtuales — tracking sin IOL (virtual-portfolios)
// Fuente única para virtualPortfoliosApi + virtualReportsApi
// ============================================================

export interface VirtualPortfolio {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface VirtualPosition {
  id: string;
  portfolioId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  currency: "ARS" | "USD";
  market: "bcba" | "bonds";
  createdAt: string;
  lastPrice: number | null;
  variationPct: number | null;
  quoteCurrency: string | null;
  totalValue: number;
  costBasis: number;
  gainLossAmount: number;
  gainLossPct: number;
}

export interface VirtualPortfolioDetail extends VirtualPortfolio {
  positions: VirtualPosition[];
  totals: {
    totalArs: number;
    totalUsd: number;
    costArs: number;
    costUsd: number;
    gainArs: number;
    gainUsd: number;
    gainPctArs: number;
    gainPctUsd: number;
  };
}

// Alias locales para reportes virtuales (evita ciclo con features/reportes/api)
export interface VirtualMonthClose {
  month: string;
  closingValueArs: number;
  closingValueUsd: number;
  twrPct: number;
  grossChangeArs: number;
  netContributionsArs: number;
}

export const virtualPortfoliosApi = {
  async list(): Promise<{ portfolios: VirtualPortfolio[] }> {
    return apiFetch("/virtual-portfolios");
  },
  async get(id: string): Promise<{ portfolio: VirtualPortfolioDetail }> {
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(id)}`);
  },
  async create(input: { name: string; description: string | null }): Promise<{ portfolio: VirtualPortfolio }> {
    return apiFetch("/virtual-portfolios", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async addPosition(
    portfolioId: string,
    input: { symbol: string; quantity: number; avg_price: number; currency: "ARS" | "USD"; market: "bcba" | "bonds" }
  ): Promise<{ position: VirtualPosition }> {
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(portfolioId)}/positions`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async removePosition(portfolioId: string, positionId: string): Promise<void> {
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(portfolioId)}/positions/${encodeURIComponent(positionId)}`, {
      method: "DELETE",
    });
  },
  async remove(portfolioId: string): Promise<void> {
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(portfolioId)}`, { method: "DELETE" });
  },
  async getHistory(
    portfolioId: string,
    days = 90
  ): Promise<{ history: PortfolioSnapshotPoint[]; message?: string }> {
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(portfolioId)}/history?days=${days}`);
  },
};

export const virtualReportsApi = {
  async getMetrics(
    portfolioId: string,
    params: { from?: string; to?: string; days?: number; rf?: number } = {}
  ): Promise<PortfolioMetrics> {
    const qs = new URLSearchParams();
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (params.days) qs.set("days", String(params.days));
    if (params.rf !== undefined) qs.set("rf", String(params.rf));
    const q = qs.toString();
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(portfolioId)}/metrics${q ? `?${q}` : ""}`);
  },
  async getCalendar(portfolioId: string, month: string): Promise<MonthCalendar> {
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(portfolioId)}/calendar/${encodeURIComponent(month)}`);
  },
  async getMonthlyCloses(portfolioId: string): Promise<{ closes: VirtualMonthClose[] }> {
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(portfolioId)}/reports`);
  },
  async getMonthlyReport(portfolioId: string, month: string): Promise<{ report: import("../reportes/api").MonthlyReport }> {
    return apiFetch(`/virtual-portfolios/${encodeURIComponent(portfolioId)}/reports/${encodeURIComponent(month)}`);
  },
};
