import { Link } from "react-router-dom";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { portfolioApi } from "@/features/portafolio/api";
import { useApiData } from "@/hooks/useApiData";
import { formatARS, formatUSD, toNormalizedTotalsReal } from "@/lib/formatters";
import { PortfolioStats } from "@/components/portfolio/PortfolioStats";
import { PortfolioPositionsTable } from "@/components/portfolio/PortfolioPositionsTable";
import { PortfolioMobileCard } from "@/components/portfolio/PortfolioMobileCard";

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function DashboardPage() {
  const {
    data: pfData,
    isLoading: pfLoading,
    error: pfError,
  } = useApiData("portfolio", () => portfolioApi.get());

  const {
    data: histData,
    isLoading: histLoading,
    error: histError,
  } = useApiData("portfolio:history:90", () => portfolioApi.getHistory(90));

  const portfolio = pfData?.portfolio ?? null;
  const history = histData?.history ?? [];
  const error = pfError || histError;
  const loading = (pfLoading && !portfolio) || (histLoading && history.length === 0);

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "No hay datos de cartera"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>No hay datos de cartera</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
          <p className="text-sm text-muted-foreground">
            Cuenta {portfolio.accountNumber} — resumen de tu cartera
          </p>
        </div>
        <Link to="/portfolio/seguimiento" className="shrink-0">
          <Button variant="outline" className="w-full shrink-0 sm:w-auto">
            <Briefcase className="h-4 w-4" />
            Portafolios de seguimiento
          </Button>
        </Link>
      </div>

      <PortfolioStats mode="real" totals={toNormalizedTotalsReal(portfolio)} />

      {/* Gráfico de evolución + Distribución */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Evolución del valor</CardTitle>
            <CardDescription>Últimos 90 días</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={history.map((p) => ({
                    ...p,
                    label: new Date(p.capturedAt).toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "short",
                    }),
                  }))}
                  margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    minTickGap={32}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={90}
                    tickFormatter={(v: number) => formatARS(v)}
                  />
                  <Tooltip
                    formatter={(value) => [formatARS(Number(value ?? 0)), "Valor total"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalValue"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#valueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribución por activo */}
        <Card>
          <CardHeader>
            <CardTitle>Distribución</CardTitle>
            <CardDescription>Composición de tu portafolio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 w-full items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={portfolio.distribution}
                    dataKey="pct"
                    nameKey="label"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {portfolio.distribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, "Portafolio"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-1.5">
              {portfolio.distribution.map((item, i) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span className="text-muted-foreground">{item.label}</span>
                  </span>
                  <span className="font-medium tabular-nums">{item.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Total consolidado */}
      <Card>
        <CardHeader>
          <CardTitle>Total</CardTitle>
          <CardDescription>Consolidado de tu cartera</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Pesos (ARS)</p>
              <p className="text-2xl font-bold">{formatARS(portfolio.totalArs)}</p>
              <p className="text-xs text-muted-foreground">
                Rendimiento:{" "}
                <span className="font-medium text-emerald-600">
                  +{formatARS(portfolio.gainLossArs)}
                </span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Dólares (USD)</p>
              <p className="text-2xl font-bold">{formatUSD(portfolio.totalUsd)}</p>
              <p className="text-xs text-muted-foreground">
                Rendimiento:{" "}
                <span className="font-medium text-muted-foreground">
                  {portfolio.gainLossUsd !== 0 ? formatUSD(portfolio.gainLossUsd) : "—"}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de posiciones */}
      <Card>
        <CardHeader>
          <CardTitle>Posiciones</CardTitle>
          <CardDescription>{portfolio.positions.length} activos en cartera</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 lg:hidden">
            {portfolio.positions.map((pos) => (
              <PortfolioMobileCard key={`${pos.symbol}-${pos.market}`} mode="real" position={pos} />
            ))}
          </div>
          <div className="hidden lg:block">
            <PortfolioPositionsTable mode="real" positions={portfolio.positions} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
