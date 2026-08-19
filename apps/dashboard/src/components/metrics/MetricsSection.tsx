import { useEffect, useState } from "react";
import { Activity, TrendingUp, Gauge, Scale, ArrowDownRight, CalendarRange, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { metricsApi, type PortfolioMetrics } from "@/lib/api";

// Tasas libres de riesgo ANUAL preestablecidas. BADLAR/LECAP son
// ESTIMACIONES ILUSTRATIVAS (D11: no hay fuente confiable hoy en ARS);
// el usuario puede elegirlas para ver cómo impacta el Sharpe.
const RF_OPTIONS = [
  { value: 0, label: "0% (sin tasa libre de riesgo)" },
  { value: 0.38, label: "BADLAR (~38% anual, est.)" },
  { value: 0.45, label: "LECAP (~45% anual, est.)" },
];

function pctColor(value: number | null) {
  if (value == null) return "text-muted-foreground";
  return value > 0.01 ? "text-emerald-600" : value < -0.01 ? "text-red-600" : "text-muted-foreground";
}

function pctSign(value: number) {
  return value > 0.01 ? "+" : "";
}

function InfoDot({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help items-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Más información"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64" sideOffset={6}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function MetricCard({
  title,
  tooltip,
  icon,
  value,
  sub,
  valueClass,
}: {
  title: string;
  tooltip: string;
  icon: React.ReactNode;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <InfoDot text={tooltip} />
        </div>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold tabular-nums ${valueClass ?? ""}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function MetricsSection() {
  const [rf, setRf] = useState<number>(0);
  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    metricsApi
      .get({ days: 90, rf })
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudieron cargar las métricas");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rf]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Métricas de cartera</h2>
            <p className="text-sm text-muted-foreground">
              Volatilidad, Sharpe, drawdown, correlación con el Merval y retornos — últimos 90 días.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Tasa libre de riesgo</span>
            <Select
              value={String(rf)}
              onValueChange={(v) => setRf(Number(v))}
            >
              <SelectTrigger className="w-auto min-w-52" aria-label="Tasa libre de riesgo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RF_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : metrics ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Volatilidad anualizada"
              tooltip="Desvío estándar de los retornos diarios × √252. Mide cuánto se mueve tu cartera por año."
              icon={<Gauge className="h-4 w-4 text-muted-foreground" />}
              value={`${(metrics.volatility * 100).toFixed(1)}%`}
            />
            <MetricCard
              title="Sharpe"
              tooltip={`Retorno ajustado por riesgo: (retorno − tasa libre de riesgo) / volatilidad. Con rf = ${(metrics.rf * 100).toFixed(0)}%.`}
              icon={<Scale className="h-4 w-4 text-muted-foreground" />}
              value={metrics.sharpe == null ? "—" : metrics.sharpe.toFixed(2)}
              valueClass={metrics.sharpe != null ? pctColor(metrics.sharpe) : undefined}
            />
            <MetricCard
              title="Máxima caída"
              tooltip="La mayor pérdida pico→valle de tu cartera en el período (drawdown)."
              icon={<ArrowDownRight className="h-4 w-4 text-muted-foreground" />}
              value={`-${(metrics.maxDrawdown * 100).toFixed(1)}%`}
              valueClass="text-red-600"
            />
            <MetricCard
              title="Correlación Merval"
              tooltip="Correlación de Pearson entre los retornos diarios de tu cartera y el índice Merval (^MERV). 1 = se mueven igual, 0 = independientes, −1 = inverso."
              icon={<Activity className="h-4 w-4 text-muted-foreground" />}
              value={metrics.mervalCorrelation == null ? "—" : metrics.mervalCorrelation.toFixed(2)}
            />
            <MetricCard
              title="YTD"
              tooltip="Retorno año a la fecha: desde el 1° de enero hasta el último punto del año."
              icon={<CalendarRange className="h-4 w-4 text-muted-foreground" />}
              value={
                metrics.ytd == null
                  ? "—"
                  : `${pctSign(metrics.ytd)}${(metrics.ytd * 100).toFixed(1)}%`
              }
              valueClass={pctColor(metrics.ytd)}
            />
            <MetricCard
              title="Retorno del período"
              tooltip="Retorno total del período (último punto / primer punto − 1), sin ajustar por riesgo."
              icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
              value={`${pctSign(metrics.periodReturn)}${(metrics.periodReturn * 100).toFixed(1)}%`}
              valueClass={pctColor(metrics.periodReturn)}
            />
          </div>
        ) : (
          <Card>
            <CardHeader className="items-center text-center">
              <CardTitle className="text-lg">Sin datos suficientes</CardTitle>
              <CardDescription>
                Necesitamos al menos 2 snapshots diarios de tu cartera para calcular las métricas.
                Sincronizá tu portafolio y volvé en unos días.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          BADLAR/LECAP son estimaciones ilustrativas de la tasa libre de riesgo en ARS (la fuente
          confiable está pendiente, D11). El benchmark Merval se obtiene de Yahoo Finance y puede
          no estar disponible en todo momento.
        </p>
      </div>
    </TooltipProvider>
  );
}
