import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Download, Scale, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import { bondsApi, type BondAnalytics } from "@/features/renta-fija/api";
import { useApiData } from "@/hooks/useApiData";
import { useSmartBack } from "@/lib/use-smart-back";
import { compareToCsvRows, toCsv, downloadCsv } from "@/lib/csv";

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function fmtNum(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}
function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(v);
}

export function RentaFijaComparePage() {
  const { goBack } = useSmartBack("/renta-fija");
  const [input, setInput] = useState("AL30,GD30");
  const [symbols, setSymbols] = useState<string[]>(["AL30", "GD30"]);

  const cacheKey = symbols.length >= 2 ? `bonds:compare:${symbols.slice().sort().join(",")}` : null;
  const { data, isLoading, error, refetch, isRefreshing } = useApiData(
    cacheKey,
    () => bondsApi.getCompare(symbols),
    { enabled: symbols.length >= 2 && symbols.length <= 4 }
  );

  const analytics: BondAnalytics[] = (data as { analytics: BondAnalytics[] } | null)?.analytics ?? [];
  const diff = (data as { diff?: Record<string, any> } | null)?.diff ?? null;

  const validationError = useMemo(() => {
    const parts = input
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const uniq = [...new Set(parts)];
    if (uniq.length > 4) return "Máximo 4 símbolos";
    return null;
  }, [input]);

  function handleCompare() {
    const parts = input
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const uniq = [...new Set(parts)].filter((s) => /^[A-Z0-9]{2,12}$/.test(s));
    if (uniq.length < 2) return;
    if (uniq.length > 4) return;
    setSymbols(uniq);
  }

  function removeSymbol(s: string) {
    const next = symbols.filter((x) => x !== s);
    setSymbols(next);
    setInput(next.join(","));
  }

  function handleExport() {
    if (analytics.length === 0) return;
    const rows = compareToCsvRows(analytics);
    const cols = [
      { key: "symbol", header: "Symbol" },
      { key: "precio", header: "Precio" },
      { key: "tir", header: "TIR" },
      { key: "md", header: "MD" },
      { key: "duration", header: "Duration" },
      { key: "paridad", header: "Paridad" },
      { key: "vencimiento", header: "Vencimiento" },
      { key: "moneda", header: "Moneda" },
      { key: "tipo", header: "Tipo" },
    ];
    const csv = toCsv(rows, cols);
    downloadCsv(`comparador-${symbols.join("-")}.csv`, csv);
  }

  return (
    <div className="space-y-0">
      <DisclaimerBanner />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out motion-reduce:animate-none">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
          <button type="button" onClick={goBack} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Renta Fija
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium text-foreground" aria-current="page">Comparador</span>
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Scale className="h-6 w-6 text-primary" /> Comparador
            </h1>
            <p className="text-sm text-muted-foreground">2 a 4 bonos — diff TIR/duration/paridad</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={analytics.length === 0} className="gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Actualizar" title="Actualizar">
              <RefreshCw className={`h-4 w-4 ${isRefreshing || isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Símbolos</CardTitle>
            <CardDescription>Separados por coma — ej: AL30,GD30,GD35</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="AL30,GD30,GD35" className="font-mono" onKeyDown={(e) => e.key === "Enter" && handleCompare()} />
              <Button onClick={handleCompare} disabled={!!validationError} className="cursor-pointer">
                Comparar
              </Button>
            </div>
            {validationError && <p className="text-xs text-destructive">{validationError}</p>}
            <div className="flex flex-wrap gap-1.5">
              {symbols.map((s) => (
                <Badge key={s} variant="secondary" className="gap-1 font-mono pr-1">
                  {s}
                  <button type="button" onClick={() => removeSymbol(s)} className="ml-1 rounded-full p-0.5 hover:bg-muted" aria-label={`Quitar ${s}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" className="animate-in fade-in-0 duration-150 motion-reduce:animate-none">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : analytics.length > 0 ? (
          <div className="space-y-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tabla diff</CardTitle>
                <CardDescription>
                  {analytics.length} bonos · Δ TIR {diff?.tir ? `${fmtPct(diff.tir.min as number)} → ${fmtPct(diff.tir.max as number)} (Δ ${(diff.tir.diffBps as number) ?? "—"} bps)` : "—"}
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-2 py-2 text-xs uppercase tracking-wide text-muted-foreground">Métrica</th>
                      {analytics.map((a) => (
                        <th key={a.symbol} className="px-2 py-2 text-right font-mono">
                          <Link to={`/renta-fija/${a.symbol}`} className="hover:underline">
                            {a.symbol}
                          </Link>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Δ (max-min)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">TIR</td>
                      {analytics.map((a) => (
                        <td key={a.symbol} className="px-2 py-2 text-right tabular-nums">
                          {fmtPct(a.tir)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">{diff?.tir?.diff != null ? `${fmtPct(diff.tir.diff as number)} (${diff.tir.diffBps as number} bps)` : "—"}</td>
                    </tr>
                    <tr className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">MD</td>
                      {analytics.map((a) => (
                        <td key={a.symbol} className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {fmtNum(a.md)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">{diff?.md?.diff != null ? fmtNum(diff.md.diff as number) : "—"}</td>
                    </tr>
                    <tr className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">Duration</td>
                      {analytics.map((a) => (
                        <td key={a.symbol} className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {fmtNum(a.duration)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">{diff?.duration?.diff != null ? fmtNum(diff.duration.diff as number) : "—"}</td>
                    </tr>
                    <tr className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">Paridad</td>
                      {analytics.map((a) => (
                        <td key={a.symbol} className="px-2 py-2 text-right tabular-nums">
                          {fmtNum(a.paridad, 1)}%
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">{diff?.paridad?.diff != null ? `${fmtNum(diff.paridad.diff as number, 2)}%` : "—"}</td>
                    </tr>
                    <tr className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">Precio</td>
                      {analytics.map((a) => (
                        <td key={a.symbol} className="px-2 py-2 text-right tabular-nums">
                          {fmtPrice(a.precio)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right tabular-nums font-semibold">{diff?.precio?.diff != null ? fmtPrice(diff.precio.diff as number) : "—"}</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-2 font-medium">Vto</td>
                      {analytics.map((a) => (
                        <td key={a.symbol} className="px-2 py-2 text-right tabular-nums text-muted-foreground text-xs">
                          {a.schedule.vencimiento}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right" />
                    </tr>
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {analytics.map((a) => (
                <Card key={a.symbol} className="animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-mono text-base">{a.symbol}</CardTitle>
                    <CardDescription>
                      {a.schedule.moneda} · {a.schedule.tipo} · {a.schedule.vencimiento}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm tabular-nums space-y-1">
                    <p>TIR {fmtPct(a.tir)}</p>
                    <p className="text-muted-foreground">MD {fmtNum(a.md)} · Dur {fmtNum(a.duration)}</p>
                    <p className="text-muted-foreground">Paridad {fmtNum(a.paridad, 1)}%</p>
                    <Link to={`/renta-fija/${a.symbol}`} className="inline-flex text-xs text-primary hover:underline mt-2">Ver ficha →</Link>
                  </CardContent>
                </Card>
              ))}
            </div>

            {data?.disclaimer && <p className="text-center text-xs text-muted-foreground">{data.disclaimer}</p>}
          </div>
        ) : (
          !isLoading && (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-sm font-medium">Elegí 2 a 4 símbolos para comparar</p>
                <p className="mt-1 text-sm text-muted-foreground">Ej: AL30,GD30,GD35</p>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

export default RentaFijaComparePage;
