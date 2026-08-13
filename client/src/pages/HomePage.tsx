import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { portfolioApi, type PortfolioSummary } from "@/lib/api";
import { HomeHero } from "@/components/home/HomeHero";
import { AvailableCard } from "@/components/home/AvailableCard";
import { QuickActions } from "@/components/home/QuickActions";
import { InvestmentsDonut } from "@/components/home/InvestmentsDonut";

/**
 * Página INICIO — experiencia estilo home de la app IOL (mobile-first):
 * hero total valorizado → disponible → acciones rápidas → mis inversiones → búsqueda.
 *
 * Orquesta los 5 componentes home. Maneja loading/error/empty.
 * El panel detallado sigue en /portfolio (renombrado de /dashboard).
 */
export function HomePage() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async (isSync = false) => {
    if (isSync) setSyncing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await portfolioApi.get();
      setPortfolio(res.portfolio);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar tu cartera");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (error || !portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>
            {error ?? "No hay datos de cartera. Conectá tu cuenta IOL para empezar."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 sm:p-6 lg:max-w-5xl lg:p-8">
      {/* Mobile: apilado. Desktop (md+): dos columnas */}
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-4">
          <HomeHero
            totalArs={portfolio.totalArs}
            totalUsd={portfolio.totalUsd}
            dayChangeAmountArs={portfolio.dayChangeAmountArs}
            dayChangeAmountUsd={portfolio.dayChangeAmountUsd}
            dayChangePct={portfolio.dayChangePct}
          />

          <AvailableCard cashArs={portfolio.cashArs} cashUsd={portfolio.cashUsd} hidden={false} />

          <QuickActions syncing={syncing} onSync={() => load(true)} />
        </div>

        <InvestmentsDonut
          distribution={portfolio.distributionByType}
          currency="ARS"
          hidden={false}
          loading={false}
        />
      </div>

      {/* Footer legal sutil */}
      <p className="pt-2 text-center text-xs text-muted-foreground">
        Sentinel es solo lectura — no ejecuta operaciones. Los datos provienen de IOL/BYMA.
      </p>
    </div>
  );
}
