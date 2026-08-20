import { useEffect, useRef, useState, useMemo } from "react";
import { Search, RefreshCw, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import CompanyLogo from "@/components/ui/company-logo";
import { radarApi, type RadarRow } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

// ============================================================
// Formatters
// ============================================================

const fmtARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const fmtUSD = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatArs(v: number | null): string {
  if (v == null) return "—";
  return fmtARS.format(v);
}

function formatUsd(v: number | null): string {
  if (v == null) return "—";
  return fmtUSD.format(v);
}

function formatCcl(v: number | null): string {
  if (v == null) return "—";
  return fmtARS.format(v);
}

function formatSpread(v: number | null): string {
  if (v == null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// ============================================================
// RadarPage — /radar
// ============================================================

export function RadarPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<"spread" | "symbol">("spread");
  const limit = 50;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce 300ms server q
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  const cacheKey = `radar:ccl:q=${debouncedQ}:page=${page}:limit=${limit}:sort=${sort}`;

  const { data, isLoading, isRefreshing, error, refetch } = useApiData(
    cacheKey,
    () => radarApi.getRadar({ q: debouncedQ || undefined, page, limit, sort }),
  );

  const items: RadarRow[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const cclPromedio: number | null = data?.cclPromedio ?? null;
  const generatedAt: string | null = data?.generatedAt ?? null;
  const isMarketClosed: boolean = data?.isMarketClosed ?? false;
  const disclaimer: string | null = data?.disclaimer ?? null;
  const status: string | null = data?.status ?? null;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Derive lastCloseDate from first stale row if market closed
  const lastCloseDate = useMemo(() => {
    if (!isMarketClosed) return null;
    const withDate = items.find((r) => r.lastCloseDate);
    return withDate?.lastCloseDate ?? null;
  }, [isMarketClosed, items]);

  const hasStale = useMemo(() => items.some((r) => r.stale), [items]);

  const columns: Column<RadarRow>[] = useMemo(
    () => [
      {
        key: "activo",
        header: "Activo",
        sortable: true,
        sortValue: (r) => r.symbol,
        render: (r) => (
          <div className="flex items-center gap-2 min-w-0">
            <CompanyLogo symbol={r.symbol} size={28} className="shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-semibold">{r.symbol}</span>
                {r.stale && (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] font-medium border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    stale
                  </Badge>
                )}
              </div>
              <div className="max-w-36 truncate text-xs text-muted-foreground" title={r.name}>
                {r.name}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "ratio",
        header: "Ratio",
        align: "right",
        className: "tabular-nums",
        render: (r) => <span className="tabular-nums text-muted-foreground">{r.ratio}:1</span>,
      },
      {
        key: "cedearPrice",
        header: "Precio CEDEAR",
        align: "right",
        sortable: true,
        sortValue: (r) => r.cedearPrice,
        className: "tabular-nums",
        render: (r) => <span className="tabular-nums font-medium">{formatArs(r.cedearPrice)}</span>,
      },
      {
        key: "underlyingPrice",
        header: "Precio US",
        align: "right",
        sortable: true,
        sortValue: (r) => r.underlyingPrice ?? null,
        className: "tabular-nums",
        render: (r) => <span className="tabular-nums text-muted-foreground">{formatUsd(r.underlyingPrice)}</span>,
      },
      {
        key: "ccl",
        header: "CCL implícito",
        align: "right",
        sortable: true,
        sortValue: (r) => r.ccl ?? null,
        className: "tabular-nums",
        render: (r) => (
          <span className="tabular-nums font-semibold">
            {r.ccl != null ? formatCcl(r.ccl) : <span className="text-muted-foreground">—</span>}
          </span>
        ),
      },
      {
        key: "spread",
        header: "Desvío",
        align: "right",
        sortable: true,
        sortValue: (r) => r.spreadVsAvg ?? null,
        className: "tabular-nums",
        render: (r) => {
          if (r.spreadVsAvg == null) return <span className="tabular-nums text-muted-foreground">—</span>;
          const isPos = r.spreadVsAvg > 0.01;
          const isNeg = r.spreadVsAvg < -0.01;
          return (
            <span
              className={`tabular-nums font-medium ${isPos ? "text-foreground" : isNeg ? "text-foreground" : "text-muted-foreground"}`}
            >
              {formatSpread(r.spreadVsAvg)}
            </span>
          );
        },
      },
    ],
    [],
  );

  // Sort toggle for server-side sort (spread vs symbol). ResponsiveTable handles client sort too.
  // We keep page reset on sort change via UI buttons if needed.

  function PaginationControls({ align }: { align?: "end" }) {
    if (totalPages <= 1) return null;
    return (
      <div className={`flex items-center gap-1 ${align === "end" ? "justify-end" : ""}`}>
        <Button
          variant="outline"
          size="sm"
          className="h-8 cursor-pointer px-2"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || (isLoading && items.length === 0)}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-16 text-center text-xs font-medium tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 cursor-pointer px-2"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || (isLoading && items.length === 0)}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <DisclaimerBanner />

      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header: título + cclPromedio + generatedAt */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Radar CCL</h1>
            <p className="text-sm text-muted-foreground">CCL implícito por CEDEAR y desvío vs promedio</p>
          </div>
          <div className="flex flex-col items-start gap-1 text-xs text-muted-foreground sm:items-end">
            {cclPromedio != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 font-medium tabular-nums">
                Promedio CCL: <span className="font-semibold text-foreground">{formatCcl(cclPromedio)}</span>
              </span>
            )}
            {generatedAt && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="h-3 w-3" />
                Actualizado: {formatDate(generatedAt)}
              </span>
            )}
            {status === "partial" && (
              <span className="text-amber-600">Datos parciales — algunos símbolos no disponibles</span>
            )}
          </div>
        </div>

        {/* Market-closed banner */}
        {isMarketClosed && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertDescription className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 shrink-0" />
              Mercado cerrado — datos último cierre{lastCloseDate ? ` (${formatDate(lastCloseDate)})` : ""}.
              {hasStale && <span className="ml-1">Algunos valores pueden estar desactualizados.</span>}
            </AlertDescription>
          </Alert>
        )}

        {/* Controls: search + sort + pagination top */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar símbolo o nombre — ej: AAPL"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar en radar CCL"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border p-1">
              <button
                type="button"
                onClick={() => { setSort("spread"); setPage(1); }}
                aria-pressed={sort === "spread"}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${sort === "spread" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                Desvío
              </button>
              <button
                type="button"
                onClick={() => { setSort("symbol"); setPage(1); }}
                aria-pressed={sort === "symbol"}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${sort === "symbol" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                Símbolo
              </button>
            </div>
            {isRefreshing && <span className="text-xs text-muted-foreground animate-pulse">Actualizando…</span>}
            <Button variant="ghost" size="icon" onClick={() => refetch()} title="Actualizar" aria-label="Actualizar radar">
              <RefreshCw className={`h-4 w-4 ${isRefreshing || isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Error with retry */}
        {error && (
          <Alert variant="destructive" className="flex items-center justify-between gap-2">
            <AlertDescription>{error}</AlertDescription>
            <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={() => refetch({ forceLoading: true })}>
              Reintentar
            </Button>
          </Alert>
        )}

        {/* Table card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base">CEDEARs — CCL implícito</CardTitle>
              <CardDescription>
                {total > 0 ? `${total} instrumento${total !== 1 ? "s" : ""} · ` : ""}
                Ratio entero verificada BYMA · CCL = ARS × ratio / USD
              </CardDescription>
            </div>
            <PaginationControls />
          </CardHeader>
          <CardContent>
            {isLoading && items.length === 0 ? (
              <div className="space-y-2" aria-busy="true" aria-label="Cargando radar">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !error && items.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm font-medium">Sin resultados</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {debouncedQ ? `No se encontraron instrumentos para "${debouncedQ}"` : "No hay datos disponibles."}
                </p>
              </div>
            ) : (
              <>
                <ResponsiveTable
                  columns={columns}
                  data={items}
                  rowKey={(r) => r.symbol}
                  emptyState={
                    debouncedQ ? <>No se encontraron instrumentos para &quot;{debouncedQ}&quot;</> : <>Sin datos para mostrar</>
                  }
                />
                {items.length > 0 && (
                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Mostrando {items.length} de {total} · página {page} de {totalPages}
                    </span>
                    <PaginationControls align="end" />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Footer disclaimer */}
        {disclaimer && (
          <p className="text-center text-xs text-muted-foreground" role="note">
            {disclaimer}
          </p>
        )}
      </div>
    </div>
  );
}

export default RadarPage;
