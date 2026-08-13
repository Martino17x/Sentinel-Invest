import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Landmark } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { AssetTypeBadge } from "@/components/ui/asset-type-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  portfolioApi,
  type PortfolioSnapshotPoint,
  type PortfolioSummary,
} from "@/lib/api";

// Formateadores de moneda — ARS con separador de miles
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

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function DashboardPage() {
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [history, setHistory] = useState<PortfolioSnapshotPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pfRes, histRes] = await Promise.all([
        portfolioApi.get(),
        portfolioApi.getHistory(90),
      ]);
      setPortfolio(pfRes.portfolio);
      setHistory(histRes.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la cartera");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  if (error || !portfolio) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "No hay datos de cartera"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isUp = portfolio.dayChangePct >= 0;
  const ChangeIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="text-sm text-muted-foreground">
          Cuenta {portfolio.accountNumber} — resumen de tu cartera
        </p>
      </div>

      {/* Cards de estadísticas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancia / Pérdida</CardTitle>
            <ChangeIcon className={`h-4 w-4 ${isUp ? "text-emerald-500" : "text-red-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${isUp ? "text-emerald-600" : "text-red-600"}`}>
              {isUp ? "+" : ""}
              {formatARS(portfolio.gainLossArs)}
            </div>
            <p className="text-xs text-muted-foreground">
              {isUp ? "+" : ""}
              {portfolio.dayChangePct.toFixed(2)}% hoy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activos valorizados</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatARS(portfolio.positionsValueArs)}</div>
            <p className="text-xs text-muted-foreground">
              {portfolio.positionsValueUsd > 0
                ? `${formatUSD(portfolio.positionsValueUsd)} en USD`
                : "Solo posiciones en ARS"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponible ARS</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatARS(portfolio.cashArs)}</div>
            <p className="text-xs text-muted-foreground">Disponible para operar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponible USD</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatUSD(portfolio.cashUsd)}</div>
            <p className="text-xs text-muted-foreground">Disponible para operar</p>
          </CardContent>
        </Card>
      </div>

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
          {/* ===== MOBILE / TABLET: cards con jerarquía ===== */}
          <div className="space-y-3 lg:hidden">
            {portfolio.positions.map((pos) => {
              const gainPositive = pos.gainLossPct >= 0;
              return (
                <div key={`${pos.symbol}-${pos.market}`} className="rounded-xl border bg-card p-4 shadow-sm">
                  {/* Nivel 1: identificación */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/quotes/${pos.symbol}`}
                          className="text-base font-semibold text-foreground transition-colors hover:text-primary"
                        >
                          {pos.symbol}
                        </Link>
                        <AssetTypeBadge type={pos.assetType} className="font-mono text-[10px]" />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{pos.name}</p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        gainPositive ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {gainPositive ? "▲" : "▼"} {gainPositive ? "+" : ""}
                      {pos.gainLossPct.toFixed(2)}%
                    </span>
                  </div>

                  {/* Nivel 2: valor bruto (HERO) + variación diaria */}
                  <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-bold tabular-nums">
                        {formatARS(pos.totalValue)}
                      </span>
                      <span
                        className={`text-xs font-medium tabular-nums ${
                          gainPositive ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {gainPositive ? "+" : "-"}
                        {formatARS(Math.abs(pos.gainLossAmount))}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <span>Valor bruto</span>
                      <span
                        className={`normal-case tracking-normal ${
                          pos.dayChangePct >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {pos.dayChangePct >= 0 ? "▲" : "▼"} {pos.dayChangePct >= 0 ? "+" : ""}
                        {pos.dayChangePct.toFixed(2)}% hoy
                      </span>
                    </p>
                  </div>

                  {/* Nivel 3: detalles compactos */}
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md border px-1 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Cantidad
                      </p>
                      <p className="text-sm font-medium tabular-nums">
                        {pos.quantity.toLocaleString("es-AR")}
                      </p>
                    </div>
                    <div className="rounded-md border px-1 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Último
                      </p>
                      <p className="text-sm font-medium tabular-nums">{formatARS(pos.lastPrice)}</p>
                    </div>
                    <div className="rounded-md border px-1 py-1.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        P. compra
                      </p>
                      <p className="text-sm font-medium tabular-nums">{formatARS(pos.avgPrice)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ===== DESKTOP: tabla completa ===== */}
          <div className="hidden lg:block">
            <ResponsiveTable
              columns={[
                {
                  key: "activo",
                  header: "Activo",
                  render: (pos) => (
                    <div className="min-w-0">
                      <Link
                        to={`/quotes/${pos.symbol}`}
                        className="font-medium text-foreground transition-colors hover:text-primary"
                      >
                        {pos.symbol}
                      </Link>
                      <div className="max-w-48 truncate text-xs text-muted-foreground">
                        {pos.name}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "tipo",
                  header: "Tipo",
                  render: (pos) => <AssetTypeBadge type={pos.assetType} />,
                },
                {
                  key: "cantidad",
                  header: "Cantidad",
                  align: "right",
                  render: (pos) => (
                    <span className="tabular-nums">{pos.quantity.toLocaleString("es-AR")}</span>
                  ),
                },
                {
                  key: "ultimo",
                  header: "Último",
                  align: "right",
                  render: (pos) => <span className="tabular-nums">{formatARS(pos.lastPrice)}</span>,
                },
                {
                  key: "promedio",
                  header: "Prom. compra",
                  align: "right",
                  render: (pos) => <span className="tabular-nums">{formatARS(pos.avgPrice)}</span>,
                },
                {
                  key: "rendimiento",
                  header: "Rendimiento",
                  align: "right",
                  render: (pos) => {
                    const gainPositive = pos.gainLossPct >= 0;
                    return (
                      <div className="text-right">
                        <div
                          className={`font-medium tabular-nums ${
                            gainPositive ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {gainPositive ? "+" : ""}
                          {pos.gainLossPct.toFixed(2)}%
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {gainPositive ? "+" : "-"}
                          {formatARS(Math.abs(pos.gainLossAmount))}
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "valor-bruto",
                  header: "Valor bruto",
                  align: "right",
                  render: (pos) => {
                    const dayUp = pos.dayChangePct >= 0;
                    return (
                      <div className="text-right">
                        <div className="font-medium tabular-nums">{formatARS(pos.totalValue)}</div>
                        <div
                          className={`text-xs tabular-nums ${
                            dayUp ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {dayUp ? "▲" : "▼"} {dayUp ? "+" : ""}
                          {pos.dayChangePct.toFixed(2)}% hoy
                        </div>
                      </div>
                    );
                  },
                },
              ]}
              data={portfolio.positions}
              rowKey={(pos) => `${pos.symbol}-${pos.market}`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
