import { TrendingUp, Activity, Tag, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricTooltip } from "./MetricTooltip";
import { formatArs } from "@/lib/format";
import type { MonthlyReport } from "@/lib/api";

interface MonthlyReportSecondaryKpisProps {
  report: MonthlyReport;
}

function pctColor(value: number) {
  if (value > 0.01) return "text-emerald-600 dark:text-emerald-400";
  if (value < -0.01) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function pctSign(value: number) {
  return value > 0.01 ? "+" : "";
}

export function MonthlyReportSecondaryKpis({ report }: MonthlyReportSecondaryKpisProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Ganancia realizada */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ganancia realizada
            </CardTitle>
            <MetricTooltip text="Resultado económico cerrado y materializado mediante operaciones de venta ejecutadas en el mes." />
          </div>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className={`text-xl font-semibold tracking-tight tabular-nums ${pctColor(report.realizedGainArs)}`}>
            {pctSign(report.realizedGainArs)}{formatArs(report.realizedGainArs)}
          </div>
          <p className="text-xs text-muted-foreground">
            {report.realizedGainArs === 0
              ? "Sin ventas con ganancia este mes"
              : "Materializado en ventas"}
          </p>
        </CardContent>
      </Card>

      {/* 2. Ganancia latente */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ganancia latente
            </CardTitle>
            <MetricTooltip text="Variación de valor de las posiciones abiertas que aún no fueron vendidas (ganancia o pérdida en papel)." />
          </div>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className={`text-xl font-semibold tracking-tight tabular-nums ${pctColor(report.unrealizedGainArs)}`}>
            {pctSign(report.unrealizedGainArs)}{formatArs(report.unrealizedGainArs)}
          </div>
          <p className="text-xs text-muted-foreground">
            Variación de tenencias abiertas
          </p>
        </CardContent>
      </Card>

      {/* 3. Comisiones */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Comisiones
            </CardTitle>
            <MetricTooltip text="Costo total de corretaje, aranceles de mercado e impuestos devengados por operar en el mes." />
          </div>
          <Tag className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-xl font-semibold tracking-tight tabular-nums">
            {formatArs(report.commissionsArs)}
          </div>
          <p className="text-xs text-muted-foreground">
            Costo de operar en el mes
          </p>
        </CardContent>
      </Card>

      {/* 4. Cupones / dividendos */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cupones / dividendos
            </CardTitle>
            <MetricTooltip text="Rentas, amortizaciones y dividendos en efectivo acreditados por tus bonos, acciones y CEDEARs." />
          </div>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className={`text-xl font-semibold tracking-tight tabular-nums ${pctColor(report.dividendsArs)}`}>
            {report.dividendsArs > 0 ? formatArs(report.dividendsArs) : "$0"}
          </div>
          <p className="text-xs text-muted-foreground">
            {report.dividendsArs === 0
              ? "Sin cobros de renta este mes"
              : "Renta de bonos y dividendos"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
