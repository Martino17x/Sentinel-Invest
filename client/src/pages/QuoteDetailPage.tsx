import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { useSmartBack } from "@/lib/use-smart-back";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TradingViewWidget } from "@/components/ui/tradingview-widget";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { quotesApi, type Quote } from "@/lib/api";

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

function formatPrice(value: number, currency: string) {
  if (currency === "USD") return formatterUSD.format(value);
  return formatterARS.format(value);
}

export function QuoteDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const { goBack } = useSmartBack("/quotes");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [history, setHistory] = useState<{ date: string; close: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [chartMode, setChartMode] = useState<"simple" | "tradingview">("simple");

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    Promise.all([
      quotesApi.getQuote(symbol, "bcba"),
      quotesApi.getQuoteHistory(symbol, "bcba", 90),
    ])
      .then(([quoteRes, histRes]) => {
        setQuote(quoteRes.quote);
        setHistory(histRes.history);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "No se pudo cargar el activo")
      )
      .finally(() => setLoading(false));
  }, [symbol]);

  const chartData = useMemo(
    () =>
      history.map((p) => ({
        label: new Date(p.date).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "short",
        }),
        close: p.close,
      })),
    [history]
  );

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "Activo no encontrado"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isUp = quote.variationPct >= 0;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header con nombre del activo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Volver a cotizaciones"
          >
            <ArrowLeft className="h-4 w-4" />
            Cotizaciones
          </button>
          <span className="text-muted-foreground">/</span>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{quote.symbol}</h1>
            <button
              onClick={() => setIsFavorite((prev) => !prev)}
              className="cursor-pointer text-muted-foreground transition-colors hover:text-amber-400"
              title={isFavorite ? "Quitar favorito" : "Agregar favorito"}
              aria-label={isFavorite ? "Quitar favorito" : "Agregar favorito"}
            >
              <Star
                className={`h-5 w-5 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`}
              />
            </button>
          </div>
        </div>
        <Badge variant="secondary" className="font-mono text-xs">
          {quote.market.toUpperCase()}
        </Badge>
      </div>

      {/* Cards de datos */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Último precio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatPrice(quote.lastPrice, quote.currency)}
            </p>
            <p
              className={`text-sm font-medium tabular-nums ${
                isUp ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {isUp ? "▲" : "▼"} {isUp ? "+" : ""}
              {quote.variationPct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Moneda</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{quote.currency}</p>
            <p className="text-sm text-muted-foreground">Instrumento del panel</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Actualizado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {new Date(quote.updatedAt).toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="text-sm text-muted-foreground">Última cotización</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico histórico — tabs: Simplificado (propio) / TradingView (avanzado) */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Gráfico de precios</CardTitle>
            <CardDescription>{quote.symbol} — histórico reciente</CardDescription>
          </div>
          <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as "simple" | "tradingview")}>
            <TabsList>
              <TabsTrigger value="simple">Simplificado</TabsTrigger>
              <TabsTrigger value="tradingview">TradingView</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {chartMode === "simple" ? (
            chartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No hay datos históricos disponibles para {quote.symbol} (mercado cerrado o sin
                histórico).
              </p>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="quoteGradient" x1="0" y1="0" x2="0" y2="1">
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
                      tickFormatter={(v: number) => formatPrice(v, quote.currency)}
                    />
                    <Tooltip
                      formatter={(value) => [formatPrice(Number(value ?? 0), quote.currency), "Precio"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="close"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      fill="url(#quoteGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )
          ) : (
            <TradingViewWidget symbol={`BCBA:${quote.symbol}`} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
