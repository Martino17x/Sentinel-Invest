import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, RefreshCw, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { bondsApi } from "@/lib/api";
import type { BondPanelRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useSmartBack } from "@/lib/use-smart-back";

const VALID_SEGMENTS = ["USD-hard-dollar", "BOPREAL", "LECAP/BONCAP", "CER"] as const;
type SegmentOpt = (typeof VALID_SEGMENTS)[number] | "all";
type SortOpt = "tir" | "md" | "duration" | "paridad" | "precio" | "vencimiento" | "volumeEfectivo";
type OrderOpt = "desc" | "asc";

const PAGE_SIZE = 25;

function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(v);
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}
function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}
function fmtVol(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "—";
  if (v >= 1000000) return `${(v / 1000000).toFixed(2)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(Math.round(v));
}

function isParidadCalculable(row: BondPanelRow): boolean {
  return row.cuadroTecnico?.isParidadCalculable ?? row.cuadroTecnico?.paridadCalculable ?? row.cuadroTecnico?.paridad != null;
}

export function RentaFijaTablaPage() {
  const { goBack } = useSmartBack("/renta-fija/curva");
  const navigate = useNavigate();
  const [segment, setSegment] = useState<SegmentOpt>("all");
  const [sort, setSort] = useState<SortOpt>("tir");
  const [order, setOrder] = useState<OrderOpt>("desc");
  const [page, setPage] = useState(1);

  const cacheKey = `bonds:panel:${segment}:${sort}:${order}:${page}:${PAGE_SIZE}`;
  const { data, isLoading, error, refetch, isRefreshing } = useApiData(cacheKey, () =>
    bondsApi.getPanel({
      segment: segment === "all" ? undefined : segment,
      sort,
      order,
      page,
      pageSize: PAGE_SIZE,
    })
  );

  const rows = data?.data ?? data?.rows ?? [];
  const total = data?.pagination?.total ?? data?.total ?? rows.length;
  const isStale = data?.meta?.isStale ?? data?.stale ?? false;
  const generatedAt = data?.meta?.generatedAt ?? data?.generatedAt ?? null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleSort(nextSort: SortOpt) {
    if (sort === nextSort) {
      setOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSort(nextSort);
      setOrder(nextSort === "vencimiento" ? "asc" : "desc");
    }
    setPage(1);
  }

  function handleSegment(next: SegmentOpt) {
    setSegment(next);
    setPage(1);
  }

  function SortHeader({ label, field }: { label: string; field: SortOpt }) {
    const active = sort === field;
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        aria-sort={active ? (order === "asc" ? "ascending" : "descending") : undefined}
        className={`inline-flex cursor-pointer items-center gap-1 text-xs font-medium uppercase tracking-wide transition-colors hover:text-foreground ${active ? "text-foreground font-semibold" : "text-muted-foreground"}`}
      >
        {label}
        {active ? order === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
      </button>
    );
  }

  function PaginationControls({ align }: { align?: "end" }) {
    if (totalPages <= 1) return null;
    return (
      <div className={`flex items-center gap-1 ${align === "end" ? "justify-end" : ""}`}>
        <Button variant="outline" size="sm" className="h-8 cursor-pointer px-2" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isLoading} aria-label="Página anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-16 text-center text-xs font-medium tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button variant="outline" size="sm" className="h-8 cursor-pointer px-2" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isLoading} aria-label="Página siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-0">
        <DisclaimerBanner />
        <div className="space-y-6 p-4 sm:p-6 lg:p-8 animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out motion-reduce:animate-none motion-reduce:transition-none">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <button type="button" onClick={goBack} className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm" aria-label="Volver">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Renta Fija
            </button>
            <span className="text-muted-foreground" aria-hidden="true">/</span>
            <span className="font-medium text-foreground" aria-current="page">Tabla</span>
          </nav>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Renta Fija — Tabla Soberana</h1>
              <p className="text-sm text-muted-foreground">1018 soberanos sorteables por TIR — USD/ARS, CER, LECAP · server-sorted</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Actualizar" aria-label="Actualizar tabla">
              <RefreshCw className={`h-4 w-4 ${isRefreshing || isLoading ? "animate-spin motion-reduce:animate-none" : ""}`} />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => handleSegment("all")} aria-pressed={segment === "all"} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${segment === "all" ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"}`}>Todos</button>
            {VALID_SEGMENTS.map((s) => {
              const active = segment === s;
              return (
                <button key={s} type="button" onClick={() => handleSegment(s)} aria-pressed={active} className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${active ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-muted"}`}>
                  {s}
                </button>
              );
            })}
          </div>

          {isStale && (
            <Alert className="border-amber-600 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-500 dark:text-white animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              <AlertDescription className="flex items-center gap-2 text-white">
                <Clock className="h-4 w-4 shrink-0 text-white" />
                Datos del cierre anterior — BYMA/MAE no disponible, se muestra snapshot 17:10 ART.
                {generatedAt && <span className="ml-1 hidden text-xs tabular-nums sm:inline">Actualizado: {new Date(generatedAt).toLocaleString("es-AR")}</span>}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="flex items-center justify-between gap-2 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
              <AlertDescription>{error}</AlertDescription>
              <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={() => refetch({ forceLoading: true })}>Reintentar</Button>
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Tabla — TIR desc por defecto</CardTitle>
                <CardDescription>
                  {total > 0 ? `${total} bonos · página ${page}/${totalPages} · 25 por página` : sort === "tir" ? "Orden TIR desc · nulls al final" : `Orden ${sort} ${order}`}
                  {isStale && <Badge variant="outline" className="ml-2 border-amber-600 text-amber-600">STALE</Badge>}
                </CardDescription>
              </div>
              <PaginationControls />
            </CardHeader>
            <CardContent>
              {isLoading && rows.length === 0 ? (
                <div className="space-y-2" aria-busy="true" aria-label="Cargando tabla">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full motion-reduce:animate-none" />
                  ))}
                </div>
              ) : !error && rows.length === 0 ? (
                <div className="py-10 text-center animate-in fade-in-0 duration-150 motion-reduce:animate-none">
                  <p className="text-sm font-medium">Sin datos</p>
                  <p className="mt-1 text-sm text-muted-foreground">No hay bonos para segmento {segment} o filtros actuales.</p>
                  <Button variant="outline" size="sm" className="mt-4 cursor-pointer" onClick={() => refetch({ forceLoading: true })}>Reintentar</Button>
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="space-y-3 lg:hidden">
                    {rows.map((r) => {
                      const paridadOk = isParidadCalculable(r);
                      return (
                        <div key={r.symbol} role="button" tabIndex={0} onClick={() => navigate(`/renta-fija/${r.symbol}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/renta-fija/${r.symbol}`)} className="rounded-xl border bg-card p-4 shadow-sm cursor-pointer hover:bg-accent/50 transition-colors motion-reduce:transition-none animate-in fade-in-0 duration-150">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-mono text-base font-semibold">{r.symbol}</p>
                              <p className="text-xs text-muted-foreground">{r.ley ?? r.tipo ?? "—"} · Vto {r.vencimiento ? new Date(r.vencimiento).toLocaleDateString("es-AR") : "—"}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold tabular-nums">{fmtPrice(r.precio)}</p>
                              <p className={`text-xs tabular-nums ${r.tir != null ? "font-medium" : "text-muted-foreground"}`}>{r.tir != null ? fmtPct(r.tir) : "—"}</p>
                            </div>
                          </div>
                          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                            <div><dt className="text-muted-foreground">Bid/Ask</dt><dd className="tabular-nums">{r.marketData?.bid != null ? fmtPrice(r.marketData.bid) : "—"} / {r.marketData?.ask != null ? fmtPrice(r.marketData.ask) : "—"}</dd></div>
                            <div><dt className="text-muted-foreground">Vol Nom/Efe</dt><dd className="tabular-nums">{fmtVol(r.marketData?.volumeNominal)} / {fmtVol(r.marketData?.volumeEfectivo)}</dd></div>
                            <div><dt className="text-muted-foreground">MD / Duration</dt><dd className="tabular-nums">{fmtNum(r.md)} / {fmtNum(r.duration)}</dd></div>
                            <div>
                              <dt className="text-muted-foreground">Paridad</dt>
                              <dd className="tabular-nums">
                                {paridadOk && r.cuadroTecnico?.paridad != null ? `${fmtNum(r.cuadroTecnico.paridad, 1)}%` : (
                                  <Tooltip>
                                    <TooltipTrigger asChild><span className="cursor-help border-b border-dotted">—</span></TooltipTrigger>
                                    <TooltipContent>cupón no informado</TooltipContent>
                                  </Tooltip>
                                )}
                              </dd>
                            </div>
                            <div><dt className="text-muted-foreground">VT / Accrued</dt><dd className="tabular-nums">{fmtNum(r.cuadroTecnico?.vt)} / {r.cuadroTecnico?.accrued != null ? fmtNum(r.cuadroTecnico.accrued) : "—"}</dd></div>
                          </dl>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="px-2 py-2 font-medium text-xs uppercase tracking-wide text-muted-foreground">Ticker</th>
                          <th className="px-2 py-2 text-right"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Precio</span></th>
                          <th className="px-2 py-2 text-right"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Var</span></th>
                          <th className="px-2 py-2 text-right"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bid</span></th>
                          <th className="px-2 py-2 text-right"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ask</span></th>
                          <th className="px-2 py-2 text-right"><SortHeader label="VolNom" field="volumeEfectivo" /></th>
                          <th className="px-2 py-2 text-right"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">VolEfe</span></th>
                          <th className="px-2 py-2 text-right"><SortHeader label="TIR" field="tir" /></th>
                          <th className="px-2 py-2 text-right"><SortHeader label="MD" field="md" /></th>
                          <th className="px-2 py-2 text-right"><SortHeader label="Duration" field="duration" /></th>
                          <th className="px-2 py-2 text-right"><SortHeader label="Paridad" field="paridad" /></th>
                          <th className="px-2 py-2 text-right"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">VT</span></th>
                          <th className="px-2 py-2 text-right"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Accrued</span></th>
                          <th className="px-2 py-2 text-right"><SortHeader label="Vcto" field="vencimiento" /></th>
                          <th className="px-2 py-2 text-right"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ley</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const paridadOk = isParidadCalculable(r);
                          return (
                            <tr key={r.symbol} onClick={() => navigate(`/renta-fija/${r.symbol}`)} className="cursor-pointer border-b last:border-0 hover:bg-muted/50 transition-colors motion-reduce:transition-none animate-in fade-in-0 duration-150" title={`${r.symbol} — ver ficha`}>
                              <td className="px-2 py-2 font-mono font-medium">{r.symbol}</td>
                              <td className="px-2 py-2 text-right tabular-nums">{fmtPrice(r.precio)}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.precio != null && r.precioDirty != null && r.precio !== r.precioDirty ? `${(((r.precio - r.precioDirty) / r.precioDirty) * 100).toFixed(2)}%` : "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.marketData?.bid != null ? fmtPrice(r.marketData.bid) : "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.marketData?.ask != null ? fmtPrice(r.marketData.ask) : "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtVol(r.marketData?.volumeNominal)}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.marketData?.volumeEfectivo != null ? fmtVol(r.marketData.volumeEfectivo) : "—"}</td>
                              <td className={`px-2 py-2 text-right tabular-nums font-medium ${sort === "tir" ? "bg-muted/40" : ""}`}>{r.tir != null ? fmtPct(r.tir) : "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(r.md)}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(r.duration)}</td>
                              <td className="px-2 py-2 text-right tabular-nums">
                                {paridadOk && r.cuadroTecnico?.paridad != null ? `${fmtNum(r.cuadroTecnico.paridad, 2)}%` : (
                                  <Tooltip>
                                    <TooltipTrigger asChild><span className="cursor-help border-b border-dotted">—</span></TooltipTrigger>
                                    <TooltipContent>cupón no informado</TooltipContent>
                                  </Tooltip>
                                )}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.cuadroTecnico?.vt != null ? fmtNum(r.cuadroTecnico.vt, 2) : "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.cuadroTecnico?.accrued != null ? fmtNum(r.cuadroTecnico.accrued, 2) : "—"}</td>
                              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.vencimiento ? new Date(r.vencimiento).toLocaleDateString("es-AR") : "—"}</td>
                              <td className="px-2 py-2 text-right text-muted-foreground">{r.ley ?? r.cuadroTecnico?.ley ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 border-t pt-4 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground tabular-nums">{total} bonos · {totalPages} páginas</p>
                    <PaginationControls align="end" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {data?.disclaimer && <p className="text-center text-xs text-muted-foreground" role="note">{data.disclaimer}</p>}
          {!isStale && generatedAt && <p className="text-center text-xs tabular-nums text-muted-foreground">Actualizado: {new Date(generatedAt).toLocaleString("es-AR")}</p>}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default RentaFijaTablaPage;
