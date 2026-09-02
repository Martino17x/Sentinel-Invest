import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { virtualPortfoliosApi } from "@/features/portafolio/api";
import { useApiData } from "@/hooks/useApiData";
import { CalendarView } from "@/components/reports/CalendarView";
import { MetricsSection } from "@/components/metrics/MetricsSection";
import { MonthlyReportPanel } from "@/components/portfolio/MonthlyReportPanel";

export function VirtualPortfolioReportsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useApiData(
    id ? `virtual-portfolio:${id}` : null,
    () => virtualPortfoliosApi.get(id!)
  );

  const portfolio = data?.portfolio ?? null;

  if (!id) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive"><AlertDescription>Falta el ID del portafolio</AlertDescription></Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <Button variant="outline" onClick={() => navigate("/portfolio/seguimiento")}><ArrowLeft className="h-4 w-4" /> Volver al hub</Button>
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <Button variant="outline" onClick={() => navigate("/portfolio/seguimiento")}><ArrowLeft className="h-4 w-4" /> Volver al hub</Button>
        <Alert variant="destructive"><AlertDescription>Portafolio no encontrado</AlertDescription></Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <div className="flex flex-col gap-1">
        <Link to={`/portfolio/seguimiento/${portfolio.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a {portfolio.name}
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Briefcase className="h-6 w-6 shrink-0 text-muted-foreground" />
          <span className="truncate">Reportes — {portfolio.name}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          Misma interfaz que Reportes normales, filtrada por este portafolio ficticio. Sin IOL, sin sync — serie sintética honesta (proxy flat).
        </p>
      </div>

      <Tabs defaultValue="reporte" className="space-y-6">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="reporte">Reporte</TabsTrigger>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
          <TabsTrigger value="metricas">Métricas</TabsTrigger>
        </TabsList>

        <TabsContent value="reporte" className="space-y-6 animate-in fade-in-50 duration-200">
          <MonthlyReportPanel virtualPortfolioId={portfolio.id} />
        </TabsContent>

        <TabsContent value="calendario" className="space-y-6 animate-in fade-in-50 duration-200">
          <CalendarView virtualPortfolioId={portfolio.id} />
        </TabsContent>

        <TabsContent value="metricas" className="space-y-6 animate-in fade-in-50 duration-200">
          <MetricsSection virtualPortfolioId={portfolio.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default VirtualPortfolioReportsPage;
