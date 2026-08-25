import { useApiData } from "@/hooks/useApiData";
import { virtualPortfoliosApi, type VirtualPortfolioDetail, type VirtualPosition } from "@/features/portafolio/api";
import { toNormalizedTotalsVirtual, type NormalizedTotals } from "@/lib/formatters";

export type UseVirtualPortfolioDetailsResult = {
  portfolio: VirtualPortfolioDetail | null;
  positions: VirtualPosition[];
  totals: NormalizedTotals | null;
  isLoading: boolean;
  error: string | null;
  refetch: (opts?: { forceLoading?: boolean }) => Promise<void>;
};

/**
 * Single-fetch wrapper anti N+1.
 * Reemplaza duplicado Promise.allSettled en hub + modal.
 * Usa useApiData cache `virtual-portfolio:${id}` con 1 request.
 */
export function useVirtualPortfolioDetails(id: string | null): UseVirtualPortfolioDetailsResult {
  const { data, isLoading, error, refetch } = useApiData(
    id ? `virtual-portfolio:${id}` : null,
    () => virtualPortfoliosApi.get(id!)
  );

  const portfolio = data?.portfolio ?? null;
  const positions: VirtualPosition[] = portfolio?.positions ?? [];
  const totals: NormalizedTotals | null = portfolio ? toNormalizedTotalsVirtual(portfolio) : null;

  return { portfolio, positions, totals, isLoading, error, refetch };
}
