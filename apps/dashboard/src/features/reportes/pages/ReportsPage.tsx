import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarView } from "@/components/reports/CalendarView";
import { MetricsSection } from "@/components/metrics/MetricsSection";
import { MonthlyReportPanel } from "@/components/portfolio/MonthlyReportPanel";

export function ReportsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Tabs defaultValue="monthly" className="space-y-6">
        <TabsList>
          <TabsTrigger value="monthly">Reporte mensual</TabsTrigger>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-6 animate-in fade-in-50 duration-200">
          <MonthlyReportPanel />
        </TabsContent>

        <TabsContent value="calendario" className="space-y-6 animate-in fade-in-50 duration-200">
          <CalendarView />
        </TabsContent>

        <TabsContent value="metricas" className="space-y-6 animate-in fade-in-50 duration-200">
          <MetricsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
