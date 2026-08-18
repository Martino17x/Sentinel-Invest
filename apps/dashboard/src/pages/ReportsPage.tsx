import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  Wallet,
  HandCoins,
  Tag,
  Percent,
  Scale,
  Activity,
  BarChart3,
  CalendarClock,
  Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis,
} from "recharts";
import { reportsApi, type MonthClose, type MonthlyReport } from "@/lib/api";

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const formatterUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatARS(value: number) {
  return formatterARS.format(value);
}

function formatUSD(value: number) {
  return formatterUSD.format(value);
}

function pctColor(value: number) {
  return value > 0.01 ? "text-emerald-600" : value < -0.01 ? "text-red-600" : "text-muted-foreground";
}

function pctSign(value: number) {
  return value > 0.01 ? "+" : "";
}

function monthLabel(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(year, mon - 1, 1);
  return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const TYPE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venta",
  subscription: "Suscripción",
  redemption: "Rescate",
};

function MetricTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
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
    </TooltipProvider>
  );
}

export function ReportsPage() {
  const [closes, setCloses] = useState<MonthClose[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loadingCloses, setLoadingCloses] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar cierres mensuales (comparativa)
  useEffect(() => {
    (async () => {
      try {
        const res = await reportsApi.getMonthlyCloses();
        setCloses(res.closes);
        if (res.closes.length > 0) {
          setSelectedMonth(res.closes[res.closes.length - 1].month);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar los cierres");
      } finally {
        setLoadingCloses(false);
      }
    })();
  }, []);

  // Cargar reporte del mes seleccionado
  useEffect(() => {
    if (!selectedMonth) return;
    setLoadingReport(true);
    setError(null);
    (async () => {
      try {
        const res = await reportsApi.getMonthlyReport(selectedMonth);
        setReport(res.report);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el reporte");
      } finally {
        setLoadingReport(false);
      }
    })();
  }, [selectedMonth]);

  const closesSorted = useMemo(() => [...closes].sort((a, b) => a.month.localeCompare(b.month)), [closes]);

  const selectedIndex = selectedMonth
    ? closesSorted.findIndex((c) => c.month === selectedMonth)
    : -1;

  function goPrev() {
    if (selectedIndex > 0) setSelectedMonth(closesSorted[selectedIndex - 1].month);
  }

  function goNext() {
    if (selectedIndex < closesSorted.length - 1) setSelectedMonth(closesSorted[selectedIndex + 1].month);
  }

  // Serie del gráfico: evolución del mes + benchmark
  const chartData = useMemo(() => {
    if (!report) return [];
    return report.series.map((point) => ({
      label: point.date.slice(5), // "MM-DD"
      cartera: point.valueArs,
      benchmark: point.benchmark,
    }));
  }, [report]);

  if (loadingCloses) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!loadingCloses && closes.length === 0 && !error) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Card>
          <CardHeader className="items-center text-center">
            <div className="rounded-full bg-muted p-3">
              <CalendarClock className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg">Todavía no hay reportes</CardTitle>
            <CardDescription className="max-w-md">
              Los reportes se generan con un snapshot diario de tu cartera. Sincronizá tu
              portafolio y volvé mañana para ver tu primer punto — los reportes mensuales
              completos (TWR, benchmark, movimientos) aparecen a fin de mes.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const beatBenchmark = (report?.twrPct ?? 0) >= (report?.benchmarkPct ?? 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header con selector de mes */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Reportes mensuales</h1>
            <MetricTooltip text="Cierre de cada mes con rendimiento real (TWR), actividad y comparativas. Se generan con snapshots diarios de tu cartera." />
          </div>
          <p className="text-sm text-muted-foreground">
            Cierre de cada mes — rendimiento, actividad y comparativas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goPrev} disabled={selectedIndex <= 0}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-36 text-center font-medium">
            {selectedMonth ? monthLabel(selectedMonth) : "—"}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={goNext}
            disabled={selectedIndex >= closesSorted.length - 1}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loadingReport ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : report ? (
        <>
          {/* Cards principales */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-medium">Valor al cierre</CardTitle>
                  <MetricTooltip text="Valor total de tu cartera (pesos + dólares) al último día del mes." />
                </div>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatARS(report.closingValueArs)}</div>
                <p className="text-xs text-muted-foreground">
                  {report.closingValueUsd > 0 ? `${formatUSD(report.closingValueUsd)} en USD` : "—"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-medium">Rendimiento real (TWR)</CardTitle>
                  <MetricTooltip text="TWR (Time-Weighted Return): rendimiento real de tu cartera excluyendo aportes y retiros. Es la métrica estándar para comparar con el mercado." />
                </div>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${pctColor(report.twrPct)}`}>
                  {pctSign(report.twrPct)}{report.twrPct.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {pctSign(report.twrArs)}{formatARS(report.twrArs)} — excluye aportes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-medium">Aportes netos</CardTitle>
                  <MetricTooltip text="Plata que metiste o sacaste de tu cartera en el mes (estimado: compras − ventas, IOL no expone depósitos)." />
                </div>
                <HandCoins className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${pctColor(report.netContributionsArs)}`}>
                  {report.netContributionsArs === 0
                    ? "—"
                    : `${pctSign(report.netContributionsArs)}${formatARS(report.netContributionsArs)}`}
                </div>
                <p className="text-xs text-muted-foreground">Plata que metiste / sacaste</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-medium">vs Merval</CardTitle>
                  <MetricTooltip text="Comparación de tu TWR contra el Merval (índice de acciones líderes de BYMA) en el mismo período." />
                </div>
                <Scale className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${pctColor(report.twrPct - report.benchmarkPct)}`}>
                  {pctSign(report.twrPct - report.benchmarkPct)}
                  {(report.twrPct - report.benchmarkPct).toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Merval {pctSign(report.benchmarkPct)}{report.benchmarkPct.toFixed(2)}% —{" "}
                  {beatBenchmark ? "le ganaste" : "te ganó"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Segunda fila de cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-medium">Ganancia realizada</CardTitle>
                  <MetricTooltip text="Ganancia materializada al vender: (precio de venta − costo estimado) × cantidad." />
                </div>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-lg font-bold ${pctColor(report.realizedGainArs)}`}>
                  {pctSign(report.realizedGainArs)}{formatARS(report.realizedGainArs)}
                </div>
                <p className="text-xs text-muted-foreground">Lo que materializaste vendiendo</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-medium">Ganancia latente</CardTitle>
                  <MetricTooltip text="Ganancia en papel: valor actual de tus posiciones menos lo que pagaste por ellas." />
                </div>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-lg font-bold ${pctColor(report.unrealizedGainArs)}`}>
                  {pctSign(report.unrealizedGainArs)}{formatARS(report.unrealizedGainArs)}
                </div>
                <p className="text-xs text-muted-foreground">Papel, no tocado</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-medium">Comisiones</CardTitle>
                  <MetricTooltip text="Costo total de operar en el mes." />
                </div>
                <Tag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">{formatARS(report.commissionsArs)}</div>
                <p className="text-xs text-muted-foreground">Costo de operar en el mes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-sm font-medium">Cupones / dividendos</CardTitle>
                  <MetricTooltip text="Intereses de bonos y dividendos de acciones cobrados en el mes." />
                </div>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-lg font-bold ${pctColor(report.dividendsArs)}`}>
                  {report.dividendsArs > 0 ? formatARS(report.dividendsArs) : "—"}
                </div>
                <p className="text-xs text-muted-foreground">Ingresos de tus bonos/acciones</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráfico del mes con benchmark */}
          <Card>
            <CardHeader>
              <CardTitle>Evolución del mes</CardTitle>
              <CardDescription>Cartera vs Merval (base 1000)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      minTickGap={24}
                    />
                    <YAxis
                      yAxisId="left"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      width={90}
                      tickFormatter={(v: number) => formatARS(v)}
                    />
                    <YAxis yAxisId="right" orientation="right" hide domain={[900, 1100]} />
                    <ChartTooltip
                      formatter={(value, name) => {
                        if (name === "cartera") return [formatARS(Number(value ?? 0)), "Cartera"];
                        return [Number(value ?? 0).toFixed(1), "Merval (base 1000)"];
                      }}
                      contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="cartera"
                      name="Cartera"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="benchmark"
                      name="Merval"
                      stroke="var(--chart-3)"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Mejor/peor día + FX */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="flex items-center gap-1.5 pb-2">
                <CardTitle className="text-sm font-medium">Mejor día</CardTitle>
                <MetricTooltip text="El día con mayor variación porcentual diaria de tu cartera en el mes (según los snapshots)." />
              </CardHeader>
              <CardContent>
                {report.bestDay ? (
                  <>
                    <div className="text-lg font-bold text-emerald-600">
                      +{report.bestDay.pct.toFixed(2)}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {report.bestDay.date.slice(5).replace("-", "/")}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center gap-1.5 pb-2">
                <CardTitle className="text-sm font-medium">Peor día</CardTitle>
                <MetricTooltip text="El día con mayor variación porcentual diaria de tu cartera en el mes (según los snapshots)." />
              </CardHeader>
              <CardContent>
                {report.worstDay ? (
                  <>
                    <div className="text-lg font-bold text-red-600">
                      {report.worstDay.pct.toFixed(2)}%
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {report.worstDay.date.slice(5).replace("-", "/")}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex items-center gap-1.5 pb-2">
                <CardTitle className="text-sm font-medium">Tipo de cambio</CardTitle>
                <MetricTooltip text="Variación del dólar oficial en el mes (USDARS)." />
              </CardHeader>
              <CardContent>
                <div className={`text-lg font-bold ${pctColor(report.fxChangePct)}`}>
                  {pctSign(report.fxChangePct)}{report.fxChangePct.toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  Variación CCL/MEP del mes — el espejismo argentino
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de movimientos del mes */}
          <Card>
            <CardHeader>
              <CardTitle>Movimientos del mes</CardTitle>
              <CardDescription>
                {report.buys.length + report.sells.length} operaciones — compras{" "}
                {formatARS(report.totalBuysArs)} / ventas {formatARS(report.totalSellsArs)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.buys.length + report.sells.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No hubo operaciones en {monthLabel(report.month)}
                </p>
              ) : (
                <>
                  {/* MOBILE/TABLET: cards */}
                  <div className="space-y-3 lg:hidden">
                    {[...report.buys, ...report.sells]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((op) => (
                        <div key={op.iolOperationId} className="rounded-xl border bg-card p-4 shadow-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                              {new Date(op.date).toLocaleDateString("es-AR", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </span>
                            <Badge variant={op.type === "buy" ? "default" : "secondary"}>
                              {TYPE_LABELS[op.type] ?? op.type}
                            </Badge>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between">
                            <span className="text-lg font-semibold">{op.symbol}</span>
                            <span className="text-base font-bold tabular-nums">
                              {formatARS(op.total)}
                            </span>
                          </div>
                          <dl className="mt-2 space-y-1">
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-xs text-muted-foreground">Cantidad</dt>
                              <dd className="text-sm font-medium tabular-nums">
                                {op.quantity.toLocaleString("es-AR")}
                              </dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-xs text-muted-foreground">Precio</dt>
                              <dd className="text-sm font-medium tabular-nums">
                                {formatARS(op.price)}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      ))}
                  </div>

                  {/* DESKTOP: tabla */}
                  <div className="hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Operación</TableHead>
                          <TableHead>Símbolo</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Precio</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...report.buys, ...report.sells]
                          .sort((a, b) => a.date.localeCompare(b.date))
                          .map((op) => (
                            <TableRow key={op.iolOperationId}>
                              <TableCell className="whitespace-nowrap tabular-nums">
                                {new Date(op.date).toLocaleDateString("es-AR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                })}
                              </TableCell>
                              <TableCell>
                                <Badge variant={op.type === "buy" ? "default" : "secondary"}>
                                  {TYPE_LABELS[op.type] ?? op.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">{op.symbol}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {op.quantity.toLocaleString("es-AR")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatARS(op.price)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {formatARS(op.total)}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Comparativa de todos los meses */}
          <Card>
            <CardHeader>
              <CardTitle>Historial de cierres</CardTitle>
              <CardDescription>Comparativa mes a mes</CardDescription>
            </CardHeader>
            <CardContent>
              {/* MOBILE/TABLET: cards clickeables */}
              <div className="space-y-3 lg:hidden">
                {closesSorted.map((close) => (
                  <div
                    key={close.month}
                    onClick={() => setSelectedMonth(close.month)}
                    className={`cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-colors ${
                      close.month === selectedMonth ? "border-primary/40 bg-accent/50" : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold capitalize">
                        {MONTH_NAMES[Number(close.month.split("-")[1]) - 1]} {close.month.split("-")[0]}
                      </p>
                      <p className={`text-sm font-bold tabular-nums ${pctColor(close.twrPct)}`}>
                        {pctSign(close.twrPct)}{close.twrPct.toFixed(2)}%
                      </p>
                    </div>
                    <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Cierre
                      </p>
                      <p className="text-base font-bold tabular-nums">
                        {formatARS(close.closingValueArs)}
                      </p>
                    </div>
                    <dl className="mt-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs text-muted-foreground">Bruto</dt>
                        <dd className={`text-sm font-medium tabular-nums ${pctColor(close.grossChangeArs)}`}>
                          {pctSign(close.grossChangeArs)}{formatARS(close.grossChangeArs)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs text-muted-foreground">Cierre USD</dt>
                        <dd className="text-sm font-medium tabular-nums">
                          {close.closingValueUsd > 0 ? formatUSD(close.closingValueUsd) : "—"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs text-muted-foreground">Aportes</dt>
                        <dd className="text-sm font-medium tabular-nums text-muted-foreground">
                          {close.netContributionsArs === 0
                            ? "—"
                            : `${pctSign(close.netContributionsArs)}${formatARS(close.netContributionsArs)}`}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>

              {/* DESKTOP: tabla */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead className="text-right">Cierre ARS</TableHead>
                      <TableHead className="text-right">Cierre USD</TableHead>
                      <TableHead className="text-right">Bruto</TableHead>
                      <TableHead className="text-right">TWR</TableHead>
                      <TableHead className="text-right">Aportes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closesSorted.map((close) => (
                      <TableRow
                        key={close.month}
                        className={`cursor-pointer ${close.month === selectedMonth ? "bg-muted/50" : ""}`}
                        onClick={() => setSelectedMonth(close.month)}
                      >
                        <TableCell className="font-medium capitalize">
                          {MONTH_NAMES[Number(close.month.split("-")[1]) - 1]} {close.month.split("-")[0]}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatARS(close.closingValueArs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {close.closingValueUsd > 0 ? formatUSD(close.closingValueUsd) : "—"}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${pctColor(close.grossChangeArs)}`}>
                          {pctSign(close.grossChangeArs)}{formatARS(close.grossChangeArs)}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${pctColor(close.twrPct)}`}>
                          {pctSign(close.twrPct)}{close.twrPct.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {close.netContributionsArs === 0
                            ? "—"
                            : `${pctSign(close.netContributionsArs)}${formatARS(close.netContributionsArs)}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
