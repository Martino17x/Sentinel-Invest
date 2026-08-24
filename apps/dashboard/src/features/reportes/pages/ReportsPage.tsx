import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { reportsApi } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { CalendarView } from "@/components/reports/CalendarView";
import { MetricsSection } from "@/components/metrics/MetricsSection";
import { MonthlyReportHeader } from "@/components/reports/MonthlyReportHeader";
import { MonthlyReportHeroKpis } from "@/components/reports/MonthlyReportHeroKpis";
import { MonthlyReportSecondaryKpis } from "@/components/reports/MonthlyReportSecondaryKpis";
import { MonthlyReportChart } from "@/components/reports/MonthlyReportChart";
import { MonthlyReportDailyStats } from "@/components/reports/MonthlyReportDailyStats";
import { MonthlyReportOperations } from "@/components/reports/MonthlyReportOperations";
import { MonthlyReportClosesHistory } from "@/components/reports/MonthlyReportClosesHistory";
import { MonthlyReportEmpty } from "@/components/reports/MonthlyReportEmpty";
import { MonthlyReportSkeleton } from "@/components/reports/MonthlyReportSkeleton";

export function ReportsPage() {
  const {
    data: closesData,
    isLoading: loadingCloses,
    error: closesError,
  } = useApiData("reports:closes", () => reportsApi.getMonthlyCloses());

  const closes = closesData?.closes ?? [];

  const [userSelectedMonth, setUserSelectedMonth] = useState<string | null>(null);

  // Default selectedMonth to the latest month from closes if not manually chosen
  const selectedMonth =
    userSelectedMonth ??
    (closes.length > 0 ? closes[closes.length - 1].month : null);

  const {
    data: reportData,
    isLoading: loadingReport,
    error: reportError,
  } = useApiData(
    selectedMonth ? `reports:monthly:${selectedMonth}` : null,
    () => reportsApi.getMonthlyReport(selectedMonth!),
    { enabled: Boolean(selectedMonth) }
  );

  const report = reportData?.report ?? null;
  const error = closesError || reportError;

  const closesSorted = useMemo(
    () => [...closes].sort((a, b) => a.month.localeCompare(b.month)),
    [closes]
  );

  const selectedIndex = selectedMonth
    ? closesSorted.findIndex((c) => c.month === selectedMonth)
    : -1;

  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < closesSorted.length - 1;

  function handlePrev() {
    if (hasPrev) {
      setUserSelectedMonth(closesSorted[selectedIndex - 1].month);
    }
  }

  function handleNext() {
    if (hasNext) {
      setUserSelectedMonth(closesSorted[selectedIndex + 1].month);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Tabs defaultValue="monthly" className="space-y-6">
        <TabsList>
          <TabsTrigger value="monthly">Reporte mensual</TabsTrigger>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
        </TabsList>

        {/* Tab 1: Reporte Mensual */}
        <TabsContent value="monthly" className="space-y-6 animate-in fade-in-50 duration-200">
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
              {/* Header con selector de mes */}
              <MonthlyReportHeader
                selectedMonth={selectedMonth}
                hasPrev={hasPrev}
                hasNext={hasNext}
                onPrev={handlePrev}
                onNext={handleNext}
              />

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {loadingReport && !report ? (
                <MonthlyReportSkeleton />
              ) : report ? (
                <>
                  {/* Fila 1: Hero KPIs (4 cards en grilla balanceada) */}
                  <MonthlyReportHeroKpis report={report} />

                  {/* Fila 2: Métricas secundarias (4 cards) */}
                  <MonthlyReportSecondaryKpis report={report} />

                  {/* Fila 3: Gráfico interactivo con escalado dinámico */}
                  <MonthlyReportChart report={report} />

                  {/* Fila 4: Mejor/peor día y tipo de cambio (3 cards) */}
                  <MonthlyReportDailyStats report={report} />

                  {/* Fila 5: Tabla de movimientos del mes con empty state elegante */}
                  <MonthlyReportOperations report={report} />

                  {/* Fila 6: Historial comparativo de cierres mensuales */}
                  <MonthlyReportClosesHistory
                    closes={closes}
                    selectedMonth={selectedMonth}
                    onSelectMonth={setUserSelectedMonth}
                  />
                </>
              ) : null}
            </>
          )}
        </TabsContent>

        {/* Tab 2: Calendario */}
        <TabsContent value="calendario" className="space-y-6 animate-in fade-in-50 duration-200">
          <CalendarView />
        </TabsContent>

        {/* Tab 3: Métricas */}
        <TabsContent value="metricas" className="space-y-6 animate-in fade-in-50 duration-200">
          <MetricsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
