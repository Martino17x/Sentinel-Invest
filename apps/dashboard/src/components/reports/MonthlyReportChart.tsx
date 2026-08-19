import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatArs, formatCompact } from "@/lib/format";
import type { MonthlyReport } from "@/lib/api";

interface MonthlyReportChartProps {
  report: MonthlyReport;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    color: string;
    dataKey: string;
  }>;
  label?: string;
}

function ChartCustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const carteraItem = payload.find((p) => p.dataKey === "cartera");
  const benchmarkItem = payload.find((p) => p.dataKey === "benchmark");

  return (
    <div className="rounded-lg border bg-popover p-3 text-xs shadow-md space-y-2">
      <p className="font-semibold text-popover-foreground border-b pb-1">
        {label}
      </p>
      <div className="space-y-1.5">
        {carteraItem && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: carteraItem.color }}
              />
              <span className="text-muted-foreground">Cartera:</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">
              {formatArs(Number(carteraItem.value))}
            </span>
          </div>
        )}
        {benchmarkItem && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: benchmarkItem.color }}
              />
              <span className="text-muted-foreground">Merval (base 1000):</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">
              {Number(benchmarkItem.value).toFixed(1)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function MonthlyReportChart({ report }: MonthlyReportChartProps) {
  const chartData = useMemo(() => {
    if (!report.series || report.series.length === 0) return [];
    return report.series.map((point) => {
      const [year, month, day] = point.date.split("-").map(Number);
      const dateObj = new Date(year, month - 1, day);
      const dateLabel = dateObj.toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
      });
      const fullDateLabel = dateObj.toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      return {
        label: dateLabel,
        fullDate: fullDateLabel,
        cartera: point.valueArs,
        benchmark: point.benchmark,
      };
    });
  }, [report.series]);

  // Cálculo de dominio dinámico para Cartera (yAxis left)
  const yDomainPortfolio = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [0, 1000];
    const values = chartData.map((d) => d.cartera).filter((v) => typeof v === "number" && !isNaN(v));
    if (values.length === 0) return [0, 1000];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range === 0 ? (min === 0 ? 1000 : min * 0.05) : range * 0.1;
    return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
  }, [chartData]);

  // Cálculo de dominio dinámico para Benchmark (yAxis right - base 1000)
  const yDomainBenchmark = useMemo<[number, number]>(() => {
    if (chartData.length === 0) return [950, 1050];
    const values = chartData.map((d) => d.benchmark).filter((v) => typeof v === "number" && !isNaN(v));
    if (values.length === 0) return [950, 1050];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range === 0 ? 20 : Math.max(15, range * 0.1);
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4">
        <div>
          <CardTitle className="text-base font-semibold">Evolución del mes</CardTitle>
          <CardDescription>
            Rendimiento diario de tu cartera comparado contra el S&P Merval (normalizado a base 1000)
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[320px] sm:h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 12, left: -4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                minTickGap={28}
              />
              <YAxis
                yAxisId="left"
                domain={yDomainPortfolio}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                width={72}
                tickFormatter={(v: number) => formatCompact(v, "ARS")}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={yDomainBenchmark}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                width={48}
                tickFormatter={(v: number) => Math.round(v).toString()}
              />
              <RechartsTooltip
                content={<ChartCustomTooltip />}
                labelFormatter={(_, payload) => {
                  if (payload && payload[0] && payload[0].payload) {
                    return payload[0].payload.fullDate;
                  }
                  return "";
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 12, fontSize: 12 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cartera"
                name="Cartera (ARS)"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: "var(--chart-1)" }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="benchmark"
                name="Merval (base 1000)"
                stroke="var(--chart-3)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: "var(--chart-3)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
