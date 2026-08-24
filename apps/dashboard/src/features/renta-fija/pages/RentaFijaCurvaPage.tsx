import { useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import { bondsApi } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

const SEGMENTS = [
  { value: "USD-hard-dollar", label: "USD hard-dollar" },
  { value: "BOPREAL", label: "BOPREAL" },
  { value: "LECAP/BONCAP", label: "LECAP / BONCAP" },
  { value: "CER", label: "CER" },
] as const;

function formatTir(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

export function RentaFijaCurvaPage() {
  const [segment, setSegment] = useState<string>("USD-hard-dollar");
  const cacheKey = `bonds:curve:${segment}`;

  const { data, isLoading, error, refetch, isRefreshing } = useApiData(cacheKey, () => bondsApi.getCurve(segment));

  const points = data?.points ?? [];
  const isMarketClosed = data?.isMarketClosed ?? false;
  const isStale = data?.stale === true;

  const chartData = points.map((p) => ({
    ticker: p.ticker,
    tir: p.tir,
    md: p.md,
    vencimiento: p.vencimiento,
  }));

  return (
    <div className="space-y-0">
      <DisclaimerBanner />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Curva — TIR vs Duration</h1>
            <p className="text-sm text-muted-foreground">Puntos ordenados por duration modificada ascendente · {segment}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Actualizar" aria-label="Actualizar curva">
            <RefreshCw className={`h-4 w-4 ${isRefreshing || isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
          </Button>
        </div>

        {/* Segment selector */}
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map((s) => {
            const active = segment === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSegment(s.value)}
                aria-pressed={active}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Stale banner */}
        {isStale && (
          <Alert className="border-amber-600 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-500 dark:text-white [&_svg]:text-white animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <AlertDescription className="flex items-center gap-2 text-white">
              <Clock className="h-4 w-4 shrink-0 text-white" />
              Datos del cierre anterior — BYMA/MAE no disponible, se muestra snapshot 17:10 ART.
            </AlertDescription>
          </Alert>
        )}

        {isMarketClosed && !isStale && points.length === 0 && (
          <Alert className="border-amber-600 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-500 dark:text-white">
            <AlertDescription className="flex items-center gap-2 text-white">
              <Clock className="h-4 w-4 shrink-0 text-white" />
              Mercado cerrado — datos al cierre se mostrarán en horario de mercado.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="flex items-center justify-between gap-2 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
            <AlertDescription>{error}</AlertDescription>
            <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={() => refetch({ forceLoading: true })}>
              Reintentar
            </Button>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{segment} — Curva</CardTitle>
            <CardDescription>
              {points.length > 0 ? `${points.length} bonos · TIR vs MD` : "Curva por segmento"}
              {data?.generatedAt && (
                <span className="ml-2 tabular-nums text-xs text-muted-foreground">
                  Actualizado: {new Date(data.generatedAt).toLocaleString("es-AR")}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && points.length === 0 ? (
              <div className="space-y-2" aria-busy="true" aria-label="Cargando curva">
                <Skeleton className="h-64 w-full motion-reduce:animate-none" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              </div>
            ) : points.length === 0 ? (
              <div className="py-10 text-center animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                <p className="text-sm font-medium">Sin datos para este segmento</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No hay bonos con TIR calculable en {segment}. Probá otro segmento o reintentá.
                </p>
                <Button variant="outline" size="sm" className="mt-4 cursor-pointer" onClick={() => refetch({ forceLoading: true })}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <div className="h-[420px] w-full animate-in fade-in-0 duration-200 motion-reduce:animate-none">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 12, right: 16, left: 12, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      type="number"
                      dataKey="md"
                      name="MD"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "Duration modificada (años)", position: "insideBottom", offset: -4, fontSize: 11 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="tir"
                      name="TIR"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "TIR", angle: -90, position: "insideLeft", fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const d = payload[0]?.payload as { ticker: string; tir: number; md: number; vencimiento: string } | undefined;
                        if (!d) return null;
                        return (
                          <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-xs">
                            <p className="font-semibold">{d.ticker}</p>
                            <p className="tabular-nums">TIR: {formatTir(d.tir)}</p>
                            <p className="tabular-nums">MD: {d.md.toFixed(2)} años</p>
                            {d.vencimiento && <p className="text-muted-foreground">Vto: {d.vencimiento}</p>}
                          </div>
                        );
                      }}
                    />
                    <Scatter name={segment} data={chartData} fill="var(--chart-1)" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {data?.disclaimer && (
          <p className="text-center text-xs text-muted-foreground" role="note">
            {data.disclaimer}
          </p>
        )}
      </div>
    </div>
  );
}

export default RentaFijaCurvaPage;
