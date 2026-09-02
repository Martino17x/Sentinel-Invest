import { useEffect } from "react";
import { useApiData } from "@/hooks/useApiData";
import { quotesApi, type CompareResult } from "../api";

export interface UseQuoteCompareReturn {
  data: CompareResult | null;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook para GET /quotes/compare/:symbol fan-out.
 * enabled solo si symbol truthy, refetch cada 30s.
 * Usa useApiData (SWR) + polling 30s.
 */
export function useQuoteCompare(
  symbol: string | null,
  providers?: string[],
  market = "bcba"
): UseQuoteCompareReturn {
  const normalized = symbol?.trim().toUpperCase() ?? "";
  const enabled = Boolean(normalized);
  const provKey = providers?.length ? providers.join(",") : "auto";
  const cacheKey = enabled ? `quotes:compare:${normalized}:${provKey}:${market}` : null;

  const { data, isLoading, isRefreshing, error, refetch } = useApiData<CompareResult>(
    cacheKey,
    () => quotesApi.compare(normalized, providers, market),
    { enabled }
  );

  // polling 30s cuando enabled y hay symbol
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      void refetch();
    }, 30_000);
    return () => clearInterval(id);
  }, [enabled, refetch, cacheKey]);

  return {
    data: data ?? null,
    loading: isLoading,
    isRefreshing,
    error,
    refetch,
  };
}
