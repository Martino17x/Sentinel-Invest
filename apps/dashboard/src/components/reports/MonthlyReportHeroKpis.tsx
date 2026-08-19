import { Wallet, Percent, HandCoins, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricTooltip } from "./MetricTooltip";
import { formatArs, formatUsd } from "@/lib/format";
import type { MonthlyReport } from "@/lib/api";

interface MonthlyReportHeroKpisProps {
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

export function MonthlyReportHeroKpis({ report }: MonthlyReportHeroKpisProps) {
  const mervalDiff = report.twrPct - report.benchmarkPct;
  const beatBenchmark = mervalDiff >= 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Valor al cierre */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Valor al cierre
          </CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="text-2xl font-bold tracking-tight tabular-nums">
            {formatArs(report.closingValueArs)}
          </div>
          <p className="text-xs text-muted-foreground">
            {report.closingValueUsd > 0
              ? `${formatUsd(report.closingValueUsd)} USD`
              : "Sin tenencia en dólares"}
          </p>
        </CardContent>
      </Card>

      {/* 2. Rendimiento real (TWR) */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Rendimiento real (TWR)
            </CardTitle>
            <MetricTooltip text="TWR (Time-Weighted Return): rendimiento real de tu cartera aislando aportes y retiros. Es la métrica estándar institucional para comparar contra el mercado." />
          </div>
          <Percent className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className={`text-2xl font-bold tracking-tight tabular-nums ${pctColor(report.twrPct)}`}>
            {pctSign(report.twrPct)}{report.twrPct.toFixed(2)}%
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {pctSign(report.twrArs)}{formatArs(report.twrArs)} • Excluye aportes
          </p>
        </CardContent>
      </Card>

      {/* 3. Aportes netos */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aportes netos
            </CardTitle>
            <MetricTooltip text="Monto neto ingresado o retirado de la cuenta durante el mes (depósitos menos rescates)." />
          </div>
          <HandCoins className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className={`text-2xl font-bold tracking-tight tabular-nums ${pctColor(report.netContributionsArs)}`}>
            {report.netContributionsArs === 0
              ? "$0"
              : `${pctSign(report.netContributionsArs)}${formatArs(report.netContributionsArs)}`}
          </div>
          <p className="text-xs text-muted-foreground">
            {report.netContributionsArs === 0
              ? "Sin aportes ni retiros este mes"
              : "Flujo neto de capital"}
          </p>
        </CardContent>
      </Card>

      {/* 4. vs Merval */}
      <Card className="flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              vs Merval
            </CardTitle>
            <MetricTooltip text="Diferencia de rendimiento contra el índice S&P Merval de BYMA en el mismo período." />
          </div>
          <Scale className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-1">
          <div className={`text-2xl font-bold tracking-tight tabular-nums ${pctColor(mervalDiff)}`}>
            {pctSign(mervalDiff)}{mervalDiff.toFixed(2)}%
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Merval {pctSign(report.benchmarkPct)}{report.benchmarkPct.toFixed(2)}% •{" "}
            <span className={beatBenchmark ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-muted-foreground"}>
              {beatBenchmark ? "Superó al índice" : "Por debajo del índice"}
            </span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
