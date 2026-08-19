import { TrendingUp, TrendingDown, Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricTooltip } from "./MetricTooltip";
import { dayLabel } from "@/lib/art-time";
import type { MonthlyReport } from "@/lib/api";

interface MonthlyReportDailyStatsProps {
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

function formatDayText(dateStr: string) {
  try {
    return dayLabel(dateStr);
  } catch {
    return dateStr;
  }
}

export function MonthlyReportDailyStats({ report }: MonthlyReportDailyStatsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {/* 1. Mejor día */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Mejor día
            </CardTitle>
            <MetricTooltip text="La jornada con mayor variación porcentual positiva de tu cartera en el mes (según snapshots diarios)." />
          </div>
          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </CardHeader>
        <CardContent className="space-y-1">
          {report.bestDay ? (
            <>
              <div className="text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
                +{report.bestDay.pct.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground capitalize">
                {formatDayText(report.bestDay.date)}
              </p>
            </>
          ) : (
            <>
              <div className="text-xl font-bold text-muted-foreground">—</div>
              <p className="text-xs text-muted-foreground">Sin registros diarios</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. Peor día */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Peor día
            </CardTitle>
            <MetricTooltip text="La jornada con mayor variación porcentual negativa de tu cartera en el mes (según snapshots diarios)." />
          </div>
          <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
        </CardHeader>
        <CardContent className="space-y-1">
          {report.worstDay ? (
            <>
              <div className="text-2xl font-bold tracking-tight tabular-nums text-red-600 dark:text-red-400">
                {report.worstDay.pct.toFixed(2)}%
              </div>
              <p className="text-xs text-muted-foreground capitalize">
                {formatDayText(report.worstDay.date)}
              </p>
            </>
          ) : (
            <>
              <div className="text-xl font-bold text-muted-foreground">—</div>
              <p className="text-xs text-muted-foreground">Sin registros diarios</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Tipo de cambio */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tipo de cambio
            </CardTitle>
            <MetricTooltip text="Variación porcentual mensual del tipo de cambio implícito/financiero de referencia en el mercado argentino." />
          </div>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className={`text-2xl font-bold tracking-tight tabular-nums ${pctColor(report.fxChangePct)}`}>
            {pctSign(report.fxChangePct)}{report.fxChangePct.toFixed(2)}%
          </div>
          <p className="text-xs text-muted-foreground">
            Variación mensual USD/ARS
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
