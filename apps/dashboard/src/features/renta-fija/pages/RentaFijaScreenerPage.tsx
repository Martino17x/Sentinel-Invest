import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Download, Filter, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import { bondsApi } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useSmartBack } from "@/lib/use-smart-back";
import { bondPanelToCsvRows, toCsv, downloadCsv } from "@/lib/csv";

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function fmtNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

const SEGMENTS = ["", "USD-hard-dollar", "BOPREAL", "LECAP/BONCAP", "CER", "ONS"] as const;

export function RentaFijaScreenerPage() {
  const { goBack } = useSmartBack("/renta-fija");

  const [minTir, setMinTir] = useState("");
  const [maxMd, setMaxMd] = useState("");
  const [segment, setSegment] = useState("");
  const [ley, setLey] = useState("");
  const [moneda, setMoneda] = useState("");
  const [applied, setApplied] = useState<{
    minTir?: number;
    maxMd?: number;
    segment?: string;
    ley?: string;
    moneda?: string;
  }>({});

  const cacheKey = `bonds:screener:${JSON.stringify(applied)}`;
  const { data, isLoading, error, refetch, isRefreshing } = useApiData(cacheKey, () =>
    bondsApi.getScreener({
      minTir: applied.minTir,
      maxMd: applied.maxMd,
      segment: applied.segment || undefined,
      ley: applied.ley || undefined,
      moneda: applied.moneda || undefined,
    })
  );

  const rows = data?.data ?? data?.rows ?? [];
  const elapsed = data?.elapsedMs ?? null;

  function handleApply() {
    const next: typeof applied = {};
    const mt = parseFloat(minTir);
    if (Number.isFinite(mt)) next.minTir = mt / 100; // input en % -> decimal
    const xm = parseFloat(maxMd);
    if (Number.isFinite(xm)) next.maxMd = xm;
    if (segment) next.segment = segment;
    if (ley.trim()) next.ley = ley.trim();
    if (moneda) next.moneda = moneda;
    setApplied(next);
  }

  function handleClear() {
    setMinTir("");
    setMaxMd("");
    setSegment("");
    setLey("");
    setMoneda("");
    setApplied({});
  }

  function handleExport() {
    if (rows.length === 0) return;
    const csvRows = bondPanelToCsvRows(rows);
    const cols = [
      { key: "symbol", header: "Symbol" },
      { key: "tir", header: "TIR" },
      { key: "md", header: "MD" },
      { key: "duration", header: "Duration" },
      { key: "paridad", header: "Paridad" },
      { key: "precio", header: "Precio" },
      { key: "vencimiento", header: "Vencimiento" },
      { key: "moneda", header: "Moneda" },
      { key: "ley", header: "Ley" },
    ];
    const csv = toCsv(csvRows, cols);
    downloadCsv("screener.csv", csv);
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
          <span className="font-medium text-foreground" aria-current="page">Screener</span>
        </nav>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Filter className="h-6 w-6 text-primary" /> Screener
            </h1>
            <p className="text-sm text-muted-foreground">Filtros en memoria &lt;100ms · sobre panel</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0} className="gap-1.5">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Actualizar">
              <RefreshCw className={`h-4 w-4 ${isRefreshing || isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filtros</CardTitle>
            <CardDescription>minTir (%) · max MD (años) · segment · ley · moneda</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="screener-minTir" className="text-xs">Min TIR (%)</Label>
                <Input id="screener-minTir" type="number" step="0.1" placeholder="15" value={minTir} onChange={(e) => setMinTir(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="screener-maxMd" className="text-xs">Max MD (años)</Label>
                <Input id="screener-maxMd" type="number" step="0.1" placeholder="5" value={maxMd} onChange={(e) => setMaxMd(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Segmento</Label>
                <select value={segment} onChange={(e) => setSegment(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="">Todos</option>
                  {SEGMENTS.filter(Boolean).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="screener-ley" className="text-xs">Ley</Label>
                <Input id="screener-ley" placeholder="NY / AR" value={ley} onChange={(e) => setLey(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Moneda</Label>
                <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  <option value="">Ambas</option>
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleApply} className="cursor-pointer">Aplicar</Button>
              <Button variant="outline" onClick={handleClear} className="cursor-pointer">Limpiar</Button>
              {elapsed != null && <span className="ml-auto text-xs tabular-nums text-muted-foreground self-center">{elapsed}ms · {rows.length} resultados</span>}
            </div>
            {Object.keys(applied).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {applied.minTir != null && <Badge variant="secondary">minTir {(applied.minTir * 100).toFixed(1)}%</Badge>}
                {applied.maxMd != null && <Badge variant="secondary">maxMD {applied.maxMd}</Badge>}
                {applied.segment && <Badge variant="secondary">{applied.segment}</Badge>}
                {applied.ley && <Badge variant="secondary">ley {applied.ley}</Badge>}
                {applied.moneda && <Badge variant="secondary">{applied.moneda}</Badge>}
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">Resultados</CardTitle>
              <CardDescription>{rows.length} bonos filtrados {elapsed != null ? `· ${elapsed}ms` : ""}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (<Skeleton key={i} className="h-10 w-full" />))}
              </div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">Sin resultados</p>
                <p className="mt-1 text-sm text-muted-foreground">Ajustá los filtros o limpiá para ver todo el panel.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-2 py-2 text-xs uppercase tracking-wide text-muted-foreground">Ticker</th>
                      <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">TIR</th>
                      <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">MD</th>
                      <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Paridad</th>
                      <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Precio</th>
                      <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Vto</th>
                      <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Ley</th>
                      <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Moneda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r) => (
                      <tr key={r.symbol} className="border-b last:border-0 hover:bg-muted/50 transition-colors motion-reduce:transition-none">
                        <td className="px-2 py-2 font-mono font-medium"><Link to={`/renta-fija/${r.symbol}`} className="hover:underline">{r.symbol}</Link></td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtPct(r.tir)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(r.md)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.cuadroTecnico?.paridad != null ? `${fmtNum(r.cuadroTecnico.paridad)}%` : "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.precio?.toFixed(2) ?? "—"}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground text-xs">{r.vencimiento}</td>
                        <td className="px-2 py-2 text-right text-muted-foreground">{r.ley ?? r.cuadroTecnico?.ley ?? "—"}</td>
                        <td className="px-2 py-2 text-right"><Badge variant="outline" className="font-mono text-xs">{r.moneda}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 100 && <p className="mt-3 text-center text-xs text-muted-foreground">Mostrando 100 de {rows.length} — exportá CSV para ver todos.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" /> Screener en memoria · sin paginado servidor · filtro &lt;100ms
        </div>
      </div>
    </div>
  );
}

export default RentaFijaScreenerPage;
