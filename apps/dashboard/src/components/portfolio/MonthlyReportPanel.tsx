import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { reportsApi, type MonthClose } from "@/features/reportes/api";
import { virtualReportsApi, type VirtualMonthClose } from "@/features/portafolio/api";
import { useApiData } from "@/hooks/useApiData";
import { MonthlyReportHeader } from "@/components/reports/MonthlyReportHeader";
import { MonthlyReportHeroKpis } from "@/components/reports/MonthlyReportHeroKpis";
import { MonthlyReportSecondaryKpis } from "@/components/reports/MonthlyReportSecondaryKpis";
import { MonthlyReportChart } from "@/components/reports/MonthlyReportChart";
import { MonthlyReportDailyStats } from "@/components/reports/MonthlyReportDailyStats";
import { MonthlyReportOperations } from "@/components/reports/MonthlyReportOperations";
import { MonthlyReportClosesHistory } from "@/components/reports/MonthlyReportClosesHistory";
import { MonthlyReportEmpty } from "@/components/reports/MonthlyReportEmpty";
import { MonthlyReportSkeleton } from "@/components/reports/MonthlyReportSkeleton";

type Props = {
  virtualPortfolioId?: string;
};

/**
 * MonthlyReportPanel — shell reporte compartido central.
 * Unifica ReportsPage:27-68 y VirtualPortfolioReportsPanel:30-62
 * selección mes (memo, prev/next, hasPrev/hasNext, onSelectMonth)
 * parametrizada virtualPortfolioId? (usa virtualReportsApi si existe, sino reportsApi).
 * Elimina duplicación de lógica selectedMonth = userSelectedMonth ?? closes[closes.length-1].month
 */
export function MonthlyReportPanel({ virtualPortfolioId }: Props) {
  const isVirtual = Boolean(virtualPortfolioId);

  const {
    data: closesData,
    isLoading: loadingCloses,
    error: closesError,
  } = useApiData(
    isVirtual ? `virtual-reports:${virtualPortfolioId}:closes` : "reports:closes",
    () =>
      isVirtual
        ? virtualReportsApi.getMonthlyCloses(virtualPortfolioId!)
        : reportsApi.getMonthlyCloses()
  );

  const closes = (closesData?.closes ?? []) as (MonthClose | VirtualMonthClose)[];

  const [userSelectedMonth, setUserSelectedMonth] = useState<string | null>(null);

  // Centraliza lógica duplicada
  const selectedMonth = userSelectedMonth ?? (closes.length > 0 ? closes[closes.length - 1].month : null);

  const {
    data: reportData,
    isLoading: loadingReport,
    error: reportError,
  } = useApiData(
    selectedMonth
      ? isVirtual
        ? `virtual-reports:${virtualPortfolioId}:monthly:${selectedMonth}`
        : `reports:monthly:${selectedMonth}`
      : null,
    () =>
      isVirtual
        ? virtualReportsApi.getMonthlyReport(virtualPortfolioId!, selectedMonth!)
        : reportsApi.getMonthlyReport(selectedMonth!),
    { enabled: Boolean(selectedMonth) }
  );

  const report = reportData?.report ?? null;
  const error = closesError || reportError;

  const closesSorted = useMemo(() => [...closes].sort((a, b) => a.month.localeCompare(b.month)), [closes]);

  const selectedIndex = selectedMonth ? closesSorted.findIndex((c) => c.month === selectedMonth) : -1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < closesSorted.length - 1;

  function handlePrev() {
    if (hasPrev) setUserSelectedMonth(closesSorted[selectedIndex - 1].month);
  }
  function handleNext() {
    if (hasNext) setUserSelectedMonth(closesSorted[selectedIndex + 1].month);
  }

  // Sin posiciones → mismo empty que reports normales pero con copy virtual
  if (!loadingCloses && closes.length === 0 && !error) {
    if (isVirtual) {
      return (
        <div className="space-y-4 animate-in fade-in-50 duration-200">
          <MonthlyReportEmpty />
          <p className="text-center text-xs text-muted-foreground">Portafolio virtual: agregá posiciones para generar cierres mensuales. La serie es sintética (valorización actual como proxy, flat) — honesta, sin inventar volatilidad.</p>
        </div>
      );
    }
    return <MonthlyReportEmpty />;
  }

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {loadingCloses && closes.length === 0 ? (
        <MonthlyReportSkeleton />
      ) : error && !report ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : closes.length === 0 ? (
        <MonthlyReportEmpty />
      ) : (
        <>
          <MonthlyReportHeader selectedMonth={selectedMonth} hasPrev={hasPrev} hasNext={hasNext} onPrev={handlePrev} onNext={handleNext} />
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loadingReport && !report ? (
            <MonthlyReportSkeleton />
          ) : report ? (
            <>
              <MonthlyReportHeroKpis report={report} />
              <MonthlyReportSecondaryKpis report={report} />
              <MonthlyReportChart report={report} />
              <MonthlyReportDailyStats report={report} />
              <MonthlyReportOperations report={report} />
              <MonthlyReportClosesHistory closes={closes as MonthClose[]} selectedMonth={selectedMonth} onSelectMonth={setUserSelectedMonth} />
              {isVirtual && (
                <p className="text-center text-[11px] text-muted-foreground">
                  Portafolio virtual: serie sintética flat (proxy de valorización actual). Benchmark Merval y FX desde Yahoo — puede degradar si Yahoo no responde.
                </p>
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

export default MonthlyReportPanel;
