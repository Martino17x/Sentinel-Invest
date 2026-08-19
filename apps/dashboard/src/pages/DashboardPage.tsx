import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Landmark } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { AssetTypeBadge } from "@/components/ui/asset-type-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { portfolioApi } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

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

  const isUp = portfolio.dayChangePct >= 0;
  const ChangeIcon = isUp ? TrendingUp : TrendingDown;

  // % total de ganancia/pérdida sobre el capital invertido. El server lo
  // manda como gainLossPct; si falta (server viejo), se calcula acá.
  const gainLossPct =
    portfolio.gainLossPct ??
    (portfolio.totalArs - portfolio.gainLossArs > 0
      ? (portfolio.gainLossArs / (portfolio.totalArs - portfolio.gainLossArs)) * 100
      : 0);

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
            <ChangeIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {/* El monto grande es la ganancia ACUMULADA, con su % TOTAL al lado
                (estilo IOL: el % sin "+" en positivos, coloreado según signo).
                No es el balance del día — solo el % total lleva color. */}
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <div className="text-xl font-bold">{formatARS(portfolio.gainLossArs)}</div>
              {gainLossPct !== 0 && (
                <span
                  className={`text-lg font-bold tabular-nums ${
                    gainLossPct >= 0 ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {gainLossPct.toFixed(2)}%
                </span>
              )}
            </div>
            {/* Solo la variación del DÍA va en verde/rojo, con su monto en $ */}
            <p className="text-xs">
              <span className={isUp ? "text-emerald-600" : "text-red-600"}>
                {isUp ? "+" : ""}
                {portfolio.dayChangePct.toFixed(2)}% hoy
                {portfolio.dayChangeAmountArs !== 0 && (
                  <>
                    {" "}
                    ({isUp ? "+" : "-"}
                    {formatARS(Math.abs(portfolio.dayChangeAmountArs))})
                  </>
                )}
              </span>
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
                  </div>

                  {/* Nivel 2: rendimiento (HERO) */}
                  <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5">
                    <div className="flex items-baseline justify-between">
                      <span
                        className={`text-xl font-bold tabular-nums ${
                          gainPositive ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {gainPositive ? "" : "-"}
                        {formatARS(Math.abs(pos.gainLossAmount))}
                      </span>
                      <span
                        className={`text-xs font-medium tabular-nums ${
                          gainPositive ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {pos.gainLossPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Rendimiento
                      </span>
                      <span
                        className={`text-xs font-medium tabular-nums ${
                          pos.dayChangePct > 0.01
                            ? "text-emerald-600"
                            : pos.dayChangePct < -0.01
                              ? "text-red-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {pos.dayChangePct > 0.01
                          ? `▲ ${pos.dayChangePct.toFixed(2)}%`
                          : pos.dayChangePct < -0.01
                            ? `▼ ${Math.abs(pos.dayChangePct).toFixed(2)}%`
                            : "= 0,00%"}
                        {pos.totalValue > 0 && pos.dayChangePct !== 0 && (
                          <>
                            {" "}
                            (
                            {pos.dayChangePct > 0 ? "+" : "-"}
                            {formatARS(
                              Math.abs(
                                pos.totalValue *
                                  (pos.dayChangePct / (100 + pos.dayChangePct))
                              )
                            )}
                            )
                          </>
                        )}
                      </span>
                    </div>
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
                        Valor bruto
                      </p>
                      <p className="text-sm font-medium tabular-nums">{formatARS(pos.totalValue)}</p>
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
                  sortable: true,
                  sortValue: (pos) => pos.symbol,
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
                  sortable: true,
                  sortValue: (pos) => pos.assetType,
                  render: (pos) => <AssetTypeBadge type={pos.assetType} />,
                },
                {
                  key: "cantidad",
                  header: "Cantidad",
                  sortable: true,
                  sortValue: (pos) => pos.quantity,
                  align: "right",
                  render: (pos) => (
                    <span className="tabular-nums">{pos.quantity.toLocaleString("es-AR")}</span>
                  ),
                },
                {
                  key: "variacion-diaria",
                  header: "Variación diaria",
                  sortable: true,
                  sortValue: (pos) => pos.dayChangePct,
                  align: "right",
                  render: (pos) => {
                    // Monto del día: totalValue × pct/(100+pct) — el % es relativo
                    // al cierre anterior, así el cambio en $ es exacto.
                    // OJO: NO usar quantity × lastPrice: para bonos/ONs IOL
                    // reporta el precio por VN 100 (100× el precio unitario),
                    // por lo que quantity × lastPrice ≠ totalValue (inflan 100×).
                    const dayAmount =
                      pos.totalValue > 0
                        ? pos.totalValue * (pos.dayChangePct / (100 + pos.dayChangePct))
                        : 0;
                    const dayUp = pos.dayChangePct > 0.01;
                    const dayDown = pos.dayChangePct < -0.01;
                    return (
                      <div className="text-right">
                        <div
                          className={`tabular-nums ${
                            dayUp ? "text-emerald-600" : dayDown ? "text-red-600" : "text-muted-foreground"
                          }`}
                        >
                          {dayUp ? "▲" : dayDown ? "▼" : "="} {Math.abs(pos.dayChangePct).toFixed(2)}%
                        </div>
                        {dayAmount !== 0 && (
                          <div
                            className={`text-xs tabular-nums ${
                              dayUp ? "text-emerald-600" : dayDown ? "text-red-600" : "text-muted-foreground"
                            }`}
                          >
                            ({dayUp ? "+" : dayDown ? "-" : ""}
                            {formatARS(Math.abs(dayAmount))})
                          </div>
                        )}
                      </div>
                    );
                  },
                },
                {
                  key: "ultimo",
                  header: "Último",
                  sortable: true,
                  sortValue: (pos) => pos.lastPrice,
                  align: "right",
                  render: (pos) => <span className="tabular-nums">{formatARS(pos.lastPrice)}</span>,
                },
                {
                  key: "promedio",
                  header: "Prom. compra",
                  sortable: true,
                  sortValue: (pos) => pos.avgPrice,
                  align: "right",
                  render: (pos) => <span className="tabular-nums">{formatARS(pos.avgPrice)}</span>,
                },
                {
                  key: "rendimiento",
                  header: "Rendimiento",
                  sortable: true,
                  sortValue: (pos) => pos.gainLossPct,
                  align: "right",
                  render: (pos) => {
                    const gainPositive = pos.gainLossPct >= 0;
                    // Estilo IOL: % sin "+" en positivos, monto con $ y signo
                    return (
                      <div className="text-right">
                        <div
                          className={`font-medium tabular-nums ${
                            gainPositive ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {pos.gainLossPct.toFixed(2)}%
                        </div>
                        <div
                          className={`text-xs tabular-nums ${
                            gainPositive ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {gainPositive ? "" : "-"}
                          {formatARS(Math.abs(pos.gainLossAmount))}
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "valorizado",
                  header: "Valorizado",
                  sortable: true,
                  sortValue: (pos) => pos.totalValue,
                  align: "right",
                  render: (pos) => (
                    <span className="font-medium tabular-nums">{formatARS(pos.totalValue)}</span>
                  ),
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
