import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, LineChart, TriangleAlert } from "lucide-react";
import { useSmartBack } from "@/lib/use-smart-back";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { analysisApi, type Analysis, type AnalysisSignalFactor } from "@/lib/api";
import { formatPct } from "@/lib/format";

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

function formatPrice(value: number, currency: string | null) {
  if (currency === "USD") return formatterUSD.format(value);
  return formatterARS.format(value);
}

/** n → "n/d" cuando es null; permite suffix (ej: "%") */
function fmtOrNa(value: number | null | undefined, digits = 2, suffix = ""): string {
  if (value == null || !Number.isFinite(value)) return "n/d";
  return `${value.toLocaleString("es-AR", { maximumFractionDigits: digits })}${suffix}`;
}

const VERDICT_STYLES: Record<string, { badge: string; text: string; bar: string }> = {
  bullish: {
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
    text: "text-emerald-600",
    bar: "bg-emerald-500",
  },
  bearish: {
    badge: "border-red-500/30 bg-red-500/10 text-red-600",
    text: "text-red-600",
    bar: "bg-red-500",
  },
  neutral: {
    badge: "bg-secondary text-secondary-foreground",
    text: "text-muted-foreground",
    bar: "bg-slate-400",
  },
};

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles = VERDICT_STYLES[verdict as keyof typeof VERDICT_STYLES] ?? VERDICT_STYLES.neutral;
  const label =
    verdict === "bullish" ? "Alcista" : verdict === "bearish" ? "Bajista" : "Neutral";
  return (
    <Badge variant="outline" className={`border-0 ${styles.badge}`}>
      {label}
    </Badge>
  );
}

/** SMA simple sobre una serie (para el overlay del sparkline) */
function smaSeries(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = [];
  let windowSum = 0;
  for (let i = 0; i < closes.length; i++) {
    windowSum += closes[i];
    if (i >= n) windowSum -= closes[i - n];
    out.push(i >= n - 1 ? windowSum / n : null);
  }
  return out;
}

function SignalCard({ signal }: { signal: NonNullable<Analysis["signal"]> }) {
  const score = Math.round(signal.score);
  const styles = VERDICT_STYLES[signal.verdict];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-medium">Señal técnica</CardTitle>
          <CardDescription>Score compuesto 0-100 con pesos renormaliados</CardDescription>
        </div>
        <VerdictBadge verdict={signal.verdict} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={`text-3xl font-bold tabular-nums ${styles.text}`}>{score}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${styles.bar} transition-all`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {signal.breakdown.map((factor) => (
            <FactorRow key={factor.id} factor={factor} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FactorRow({ factor }: { factor: AnalysisSignalFactor }) {
  const score = Math.round(factor.score);
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{factor.label}</p>
          <p className="truncate text-xs text-muted-foreground">{factor.detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{Math.round(factor.weight * 100)}%</span>
          <span className="w-10 text-right text-sm font-semibold tabular-nums">{score}</span>
        </div>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}

const FUNDAMENTAL_CARDS: { key: keyof NonNullable<Analysis["fundamentals"]>; label: string; format: (v: number | null) => string }[] = [
  { key: "pe", label: "PER", format: (v) => fmtOrNa(v) },
  { key: "eps", label: "EPS", format: (v) => fmtOrNa(v) },
  { key: "beta", label: "Beta", format: (v) => fmtOrNa(v) },
  { key: "margin", label: "Margen", format: (v) => fmtOrNa(v != null ? v * 100 : null, 1, "%") },
  { key: "roe", label: "ROE", format: (v) => fmtOrNa(v != null ? v * 100 : null, 1, "%") },
  { key: "debtEquity", label: "Deuda / Equity", format: (v) => fmtOrNa(v) },
  { key: "dividendYield", label: "Dividend yield", format: (v) => fmtOrNa(v != null ? v * 100 : null, 2, "%") },
  { key: "marketCap", label: "Market cap", format: (v) => fmtOrNa(v, 0) },
];

function FundamentalsGrid({ fundamentals }: { fundamentals: Analysis["fundamentals"] }) {
  // Solo mostramos las métricas con datos: evita el muro de "n/d" cuando
  // Yahoo no tiene el dato del activo (común en CEDEARs locales).
  const available = fundamentals
    ? FUNDAMENTAL_CARDS.filter((card) => fundamentals[card.key] != null)
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Fundamentales</CardTitle>
        <CardDescription>
          {available.length > 0
            ? "Datos de Yahoo Finance (trimestrales)"
            : "No disponibles — análisis solo técnico"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {available.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No hay datos de fundamentales disponibles para este activo.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {available.map((card) => (
              <div key={card.key} className="rounded-lg border bg-card p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className="mt-1 truncate text-base font-semibold tabular-nums">
                  {card.format(fundamentals![card.key])}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TechnicalsCard({ analysis }: { analysis: Analysis }) {
  const t = analysis.technicals;
  const chartData = useMemo(() => {
    if (!t) return [];
    const sma50 = smaSeries(analysis.series.map((p) => p.close), 50);
    return analysis.series.map((p, i) => ({
      label: new Date(p.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }),
      close: p.close,
      sma50: sma50[i],
    }));
  }, [analysis.series, t]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Técnicos</CardTitle>
        <CardDescription>RSI, MACD y medias móviles sobre el cierre diario</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="RSI (14)" value={fmtOrNa(t?.rsi, 1)} />
          <Metric
            label="MACD histograma"
            value={t?.macd ? t.macd.histogram.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "n/d"}
          />
          <Metric label="Volumen" value={fmtOrNa(t?.volumeRatio, 2, "x")} />
          <Metric label="SMA 20" value={fmtOrNa(t?.sma20)} />
          <Metric label="SMA 50" value={fmtOrNa(t?.sma50)} />
          <Metric label="SMA 200" value={fmtOrNa(t?.sma200)} />
        </div>

        {chartData.length > 1 ? (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="analysisGradient" x1="0" y1="0" x2="0" y2="1">
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
                  width={80}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => formatPrice(v, analysis.currency)}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatPrice(Number(value ?? 0), analysis.currency),
                    name === "sma50" ? "SMA 50" : "Cierre",
                  ]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#analysisGradient)"
                />
                <Area
                  type="monotone"
                  dataKey="sma50"
                  stroke="var(--chart-2)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="none"
                  connectNulls
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay serie histórica disponible.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Range52wBar({ analysis }: { analysis: Analysis }) {
  const { low, high } = analysis.range52w;
  const pos = analysis.technicals?.position52w;
  if (low == null || high == null) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Rango 52 semanas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Datos no disponibles.</p>
        </CardContent>
      </Card>
    );
  }

  const pct = pos != null ? Math.min(1, Math.max(0, pos)) * 100 : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Rango 52 semanas</CardTitle>
        <CardDescription>
          {pct != null ? `El precio se ubica en el ${Math.round(pct)}% del rango anual` : "Posición del precio no disponible"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Mín {formatPrice(low, analysis.currency)}</span>
          <span>Máx {formatPrice(high, analysis.currency)}</span>
        </div>
        <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-red-500/50 via-amber-500/50 to-emerald-500/50">
          {pct != null && (
            <div
              className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow"
              style={{ left: `${pct}%` }}
              title={`${Math.round(pct)}%`}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function StockAnalysisPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const { goBack } = useSmartBack("/quotes");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    analysisApi
      .getAnalysis(symbol)
      .then((res) => setAnalysis(res.analysis))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "No se pudo analizar el activo")
      )
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive" className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription>
            {error ?? "Activo no encontrado"}
            <button
              type="button"
              onClick={goBack}
              className="mt-2 block cursor-pointer text-sm font-medium underline underline-offset-4 hover:text-foreground"
            >
              ← Volver a cotizaciones
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isUp = (analysis.changePct ?? 0) >= 0;
  const signal = analysis.signal;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header: breadcrumb + símbolo + nombre + precio */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
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
            <h1 className="text-2xl font-semibold tracking-tight">{analysis.symbol}</h1>
          </div>
          {analysis.name && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{analysis.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {analysis.market && (
            <Badge variant="secondary" className="font-mono text-xs">
              {analysis.market.toUpperCase()}
            </Badge>
          )}
          <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
            {analysis.tickerYahoo}
          </Badge>
        </div>
      </div>

      {/* Precio + variación */}
      <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Último cierre</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-3xl font-bold tabular-nums">
              {analysis.price != null ? formatPrice(analysis.price, analysis.currency) : "—"}
            </p>
            {analysis.changePct != null && (
              <Badge
                variant="outline"
                className={`border-0 ${
                  isUp
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-red-500/10 text-red-600"
                }`}
              >
                {isUp ? "▲" : "▼"} {formatPct(analysis.changePct)}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {analysis.isMarketClosed
              ? `Mercado cerrado — último cierre ${analysis.lastCloseDate ?? ""}`
              : "Mercado abierto — datos en tiempo real"}
            {analysis.stale && " · datos en caché vencida"}
          </p>
        </CardContent>
      </Card>

      {/* Señal */}
      <div
        className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
        style={{ animationDelay: "60ms" }}
      >
        {signal ? (
        <SignalCard signal={signal} />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Señal técnica</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sin datos suficientes para calcular la señal.
            </p>
          </CardContent>
        </Card>
      )}
      </div>

      {/* Fundamentales */}
      <div
        className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
        style={{ animationDelay: "120ms" }}
      >
        <FundamentalsGrid fundamentals={analysis.fundamentals} />
      </div>

      {/* Técnicos + sparkline */}
      <div
        className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
        style={{ animationDelay: "180ms" }}
      >
        <TechnicalsCard analysis={analysis} />
      </div>

      {/* Rango 52 semanas */}
      <div
        className="animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none"
        style={{ animationDelay: "240ms" }}
      >
        <Range52wBar analysis={analysis} />
      </div>

      {/* Detalle textual del server (summary) */}
      {analysis.summary && (
        <p className="animate-in fade-in-0 duration-300 motion-reduce:animate-none whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          <LineChart className="mr-1 inline h-3.5 w-3.5" />
          {analysis.summary}
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Datos: Yahoo Finance — análisis educativo, no asesoramiento
      </p>
    </div>
  );
}
