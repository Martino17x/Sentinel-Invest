// ============================================================
// analysis/index.ts — factory singleton DI (patrón services/iol/index.ts)
// ============================================================

import { AnalysisServiceImpl, type AnalysisService } from "./analysis-service.js";

export type { AnalysisService };
export * from "./types.js";
export { getFundamentals, fetchFundamentals } from "./fundamentals.js";
export { getConsensus, fetchConsensus } from "./consensus.js";
export { getNews, fetchNewsFeed, getNewsFeed, getNewsById } from "./news.js";
export { getScreener, fetchScreener } from "./screener.js";
export { runBacktest, fetchBacktest, getBacktest } from "./backtest.js";
export { AnalysisServiceImpl } from "./analysis-service.js";

let _singleton: AnalysisService | null = null;

export function getAnalysisService(): AnalysisService {
  if (!_singleton) _singleton = new AnalysisServiceImpl();
  return _singleton;
}

/** Re-creation for tests: forces new singleton */
export function resetAnalysisServiceForTests(): void {
  _singleton = null;
}

export const analysisService = getAnalysisService();

export default getAnalysisService;
