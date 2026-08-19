import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { portfolioApi, ratesApi } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { HomeHero } from "@/components/home/HomeHero";
import { AvailableCard } from "@/components/home/AvailableCard";
import { QuickActions } from "@/components/home/QuickActions";
import { InvestmentsDonut } from "@/components/home/InvestmentsDonut";
import { DolarCard } from "@/components/home/DolarCard";

/**
 * Página INICIO — experiencia estilo home de la app IOL (mobile-first):
 * hero total valorizado (ARS = pesos + dólares convertidos al dólar bolsa)
 * → disponible → acciones rápidas → dólar hoy → mis inversiones.
 *
 * Orquesta los componentes home. Maneja loading/error/empty.
 * El panel detallado sigue en /portfolio (renombrado de /dashboard).
 */
export function HomePage() {
  const [syncing, setSyncing] = useState(false);

  const {
    data: portfolioData,
    isLoading: portfolioLoading,
    error: portfolioError,
    refetch: refetchPortfolio,
  } = useApiData("portfolio", () => portfolioApi.get());

  const {
    data: ratesData,
    isLoading: ratesLoading,
  } = useApiData("rates:dolares", () => ratesApi.getDolares());

  const portfolio = portfolioData?.portfolio ?? null;
  const dolares = ratesData?.dolares ?? null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await refetchPortfolio();
    } finally {
      setSyncing(false);
    }
  };

  // Dólar de referencia para conversión: "bolsa" (CCL) — el estándar
  // para valorizar carteras. Usamos la PUNTA COMPRA (lo que recibís
  // al vender tus USD).
  const usdRate = useMemo(
    () => dolares?.find((d) => d.casa === "bolsa") ?? null,
    [dolares]
  );

  // Total valorizado en ARS = pesos + dólares convertidos
  const totalArsConverted = useMemo(() => {
    if (!portfolio) return 0;
    if (!usdRate) return portfolio.totalArs;
    return portfolio.totalArs + portfolio.totalUsd * usdRate.compra;
  }, [portfolio, usdRate]);

  if (portfolioLoading && !portfolio) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (portfolioError && !portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>
            {portfolioError ?? "No hay datos de cartera. Conectá tu cuenta IOL para empezar."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>
            No hay datos de cartera. Conectá tu cuenta IOL para empezar.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 sm:p-6 md:max-w-2xl lg:max-w-5xl lg:p-8">
      {/* Mobile/tablet: apilado. Desktop (lg+): dos columnas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <HomeHero
            totalArs={totalArsConverted}
            totalUsd={portfolio.totalUsd}
            dayChangeAmountArs={portfolio.dayChangeAmountArs}
            dayChangeAmountUsd={portfolio.dayChangeAmountUsd}
            dayChangePct={portfolio.dayChangePct}
            usdRate={usdRate}
          />

          <AvailableCard cashArs={portfolio.cashArs} cashUsd={portfolio.cashUsd} hidden={false} />

          <QuickActions syncing={syncing} onSync={handleSync} />

          <DolarCard dolares={dolares} loading={ratesLoading} />
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
        Sentinel es solo lectura — no ejecuta operaciones. Los datos provienen de IOL/BYMA y
        dolarapi.com.
      </p>
    </div>
  );
}
