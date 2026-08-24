import { useEffect, useRef, useState, useMemo } from "react";
import { Search, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { AssetTypeBadge } from "@/components/ui/asset-type-badge";
import { quotesApi } from "@/features/cotizaciones/api";
import { bondsApi } from "@/features/renta-fija/api";
import { useApiData } from "@/hooks/useApiData";
import CompanyLogo from "@/components/ui/company-logo";

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatPrice(v: number | null | undefined) {
  if (v == null) return "—";
  return formatterARS.format(v);
}

function VariationBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-muted-foreground tabular-nums text-sm">—</span>;
  if (pct > 0.01) return <span className="font-medium tabular-nums text-emerald-600">▲ {pct.toFixed(2)}%</span>;
  if (pct < -0.01) return <span className="font-medium tabular-nums text-red-600">▼ {Math.abs(pct).toFixed(2)}%</span>;
  return <span className="font-medium tabular-nums text-muted-foreground">= 0,00%</span>;
}

export interface PickedInstrument {
  symbol: string;
  name: string;
  lastPrice: number | null;
  variationPct: number | null;
  assetType: string;
  currency: "ARS" | "USD";
  market: "bcba" | "bonds";
}

type AssetFilter = "cedear" | "accion" | "bono" | "on";

interface InstrumentPickerProps {
  onPick: (instrument: PickedInstrument) => void;
  initialMarket?: "bcba" | "bonds";
}

function mapInitialMarketToFilter(m: "bcba" | "bonds"): AssetFilter {
  return m === "bonds" ? "bono" : "cedear";
}

export function InstrumentPicker({ onPick, initialMarket = "bcba" }: InstrumentPickerProps) {
  const [assetFilter, setAssetFilter] = useState<AssetFilter>(() => mapInitialMarketToFilter(initialMarket));
  const [search, setSearch] = useState("");
  const [searched, setSearched] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50>(25);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearched(search.trim());
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // Reset page on filter or search change
  useEffect(() => {
    setPage(1);
  }, [assetFilter, searched, pageSize]);

  const isBono = assetFilter === "bono";
  const isOn = assetFilter === "on";

  // BCBA-like: cedear / accion / on -> quotes panel with real pagination
  const bcbaCacheKey =
    !isBono ? `picker:${assetFilter}:${searched}:${page}:${pageSize}` : null;
  const {
    data: bcbaData,
    isLoading: bcbaLoading,
    error: bcbaError,
  } = useApiData(
    bcbaCacheKey,
    async () => {
      const res = await quotesApi.getPanel("bcba", assetFilter, page, pageSize, searched || undefined);
      const quotes = res.quotes ?? [];
      const total = res.total ?? quotes.length;
      return { quotes, total };
    },
    { enabled: !isBono }
  );

  // Bonos: panel paginado cuando sin búsqueda, screener + paginación cliente cuando con q
  // Screener cache key sin page/pageSize para no refetchear en cada paginación cliente
  const bonoCacheKey = isBono
    ? searched
      ? `picker:bono:q:${searched}`
      : `picker:bono:panel:${page}:${pageSize}`
    : null;
  const {
    data: bonoData,
    isLoading: bonoLoading,
    error: bonoError,
  } = useApiData(
    bonoCacheKey,
    async () => {
      if (searched) {
        const res = await bondsApi.getScreener({ q: searched });
        const rows = (res as unknown as { rows?: unknown[]; data?: unknown[] }).rows ?? (res as unknown as { data?: unknown[] }).data ?? [];
        const allMapped = (rows as Array<{
          symbol: string;
          precio: number;
          moneda: "ARS" | "USD";
          cuadroTecnico?: { emisor?: string | null };
          tir?: number | null;
          md?: number | null;
        }>).map((r) => ({
          symbol: r.symbol,
          name: r.cuadroTecnico?.emisor ?? r.symbol,
          lastPrice: r.precio ?? null,
          variationPct: null as number | null,
          assetType: "bono",
          currency: (r.moneda as "ARS" | "USD") ?? "ARS",
          market: "bonds" as const,
        }));
        // Devolvemos TODO y paginamos en useMemo para no refetchear por página
        return { hits: allMapped, total: allMapped.length };
      }
      const panel = await bondsApi.getPanel({ page, pageSize, sort: "tir", order: "desc" });
      const rows = (panel as unknown as { data?: unknown[]; rows?: unknown[] }).data ?? (panel as unknown as { rows?: unknown[] }).rows ?? [];
      const total = (panel as unknown as { pagination?: { total?: number } }).pagination?.total ?? (panel as unknown as { total?: number }).total ?? rows.length;
      const mapped = (rows as Array<{
        symbol: string;
        precio: number;
        moneda: "ARS" | "USD";
        cuadroTecnico?: { emisor?: string | null };
      }>).map((r) => ({
        symbol: r.symbol,
        name: r.cuadroTecnico?.emisor ?? r.symbol,
        lastPrice: r.precio ?? null,
        variationPct: null,
        assetType: "bono",
        currency: (r.moneda as "ARS" | "USD") ?? "ARS",
        market: "bonds" as const,
      }));
      return { hits: mapped, total };
    },
    { enabled: isBono }
  );

  const isLoading = isBono ? bonoLoading : bcbaLoading;
  const error = isBono ? bonoError : bcbaError;

  const { hits, total }: { hits: PickedInstrument[]; total: number } = useMemo(() => {
    if (isBono) {
      const d = bonoData as { hits?: PickedInstrument[]; total?: number } | null;
      const all = d?.hits ?? [];
      const t = d?.total ?? 0;
      // Cuando hay búsqueda, paginar en cliente (cache key no incluye page)
      if (searched) {
        const start = (page - 1) * pageSize;
        return { hits: all.slice(start, start + pageSize), total: t };
      }
      return { hits: all, total: t };
    }
    const quotes = (bcbaData as { quotes?: Array<{ symbol: string; name: string; lastPrice: number; variationPct: number; assetType: string; currency: string }> } | null)?.quotes ?? [];
    const mapped: PickedInstrument[] = quotes.map((q) => ({
      symbol: q.symbol,
      name: q.name,
      lastPrice: q.lastPrice,
      variationPct: q.variationPct,
      assetType: q.assetType,
      currency: (q.currency === "USD" ? "USD" : "ARS") as "ARS" | "USD",
      market: (isOn ? "bonds" : "bcba") as "bcba" | "bonds",
    }));
    // ONs vienen de BYMA market bcba/on pero se muestran como bonos en picking; mantener market bcba para compat con virtualPositions
    // VirtualPortfolioPage acepta market bcba|bonds, así que marcamos bonos reales como bonds, ONs como bonds también para coherencia
    const adjusted = isOn
      ? mapped.map((m) => ({ ...m, market: "bonds" as const, assetType: "bono" }))
      : mapped;
    const t = (bcbaData as { total?: number } | null)?.total ?? adjusted.length;
    return { hits: adjusted, total: t };
  }, [isBono, isOn, bcbaData, bonoData, searched, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const placeholder =
    assetFilter === "cedear"
      ? "Buscar CEDEAR — ej: AAPL, MSFT, NVDA"
      : assetFilter === "accion"
        ? "Buscar acción — ej: GGAL, YPFD, TXAR"
        : assetFilter === "on"
          ? "Buscar ON — ej: YMCJO, PAMPCO, IR30"
          : "Buscar bono — ej: AL30, GD30, TX26";

  function PaginationBar() {
    if (total === 0) return null;
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t pt-4 mt-2">
        <p className="text-xs text-muted-foreground tabular-nums text-center sm:text-left">
          Mostrando {start}–{end} de {total} · página {page} de {totalPages}
        </p>
        <div className="flex items-center justify-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {/* page numbers 1..N window 5 */}
            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => {
                  if (totalPages <= 7) return true;
                  if (n === 1 || n === totalPages) return true;
                  if (Math.abs(n - page) <= 1) return true;
                  if (page <= 3 && n <= 4) return true;
                  if (page >= totalPages - 2 && n >= totalPages - 3) return true;
                  return false;
                })
                .reduce<(number | string)[]>((acc, n, idx, arr) => {
                  const prev = arr[idx - 1];
                  if (prev != null && typeof prev === "number" && (n as number) - prev > 1) acc.push("…");
                  acc.push(n);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "…" ? (
                    <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <Button
                      key={item}
                      variant={page === item ? "default" : "outline"}
                      size="sm"
                      className="h-8 min-w-8 px-2 text-xs"
                      onClick={() => setPage(item as number)}
                      disabled={isLoading}
                      aria-label={`Ir a página ${item}`}
                      aria-current={page === item ? "page" : undefined}
                    >
                      {item}
                    </Button>
                  )
                )}
            </div>
            <span className="sm:hidden min-w-14 text-center text-xs font-medium tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              aria-label="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="hidden sm:flex items-center gap-1 ml-2 border-l pl-2">
            <span className="text-xs text-muted-foreground hidden lg:inline">Por página:</span>
            <Button
              variant={pageSize === 25 ? "default" : "outline"}
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setPageSize(25)}
              aria-pressed={pageSize === 25}
            >
              25
            </Button>
            <Button
              variant={pageSize === 50 ? "default" : "outline"}
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setPageSize(50)}
              aria-pressed={pageSize === 50}
            >
              50
            </Button>
          </div>
          <div className="flex sm:hidden items-center gap-1 ml-1 border-l pl-2">
            <Button
              variant={pageSize === 25 ? "default" : "outline"}
              size="xs"
              className="text-xs"
              onClick={() => setPageSize(25)}
            >
              25
            </Button>
            <Button
              variant={pageSize === 50 ? "default" : "outline"}
              size="xs"
              className="text-xs"
              onClick={() => setPageSize(50)}
            >
              50
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      {/* Search + Filter Chips */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar instrumento"
          />
        </div>
        <Tabs value={assetFilter} onValueChange={(v) => setAssetFilter(v as AssetFilter)}>
          <TabsList className="w-full grid grid-cols-2 sm:flex sm:w-auto h-auto p-1 gap-1">
            <TabsTrigger value="cedear" className="text-xs sm:text-sm data-[state=active]:bg-foreground data-[state=active]:text-background">
              CEDEARs
            </TabsTrigger>
            <TabsTrigger value="accion" className="text-xs sm:text-sm data-[state=active]:bg-foreground data-[state=active]:text-background">
              Acciones
            </TabsTrigger>
            <TabsTrigger value="bono" className="text-xs sm:text-sm data-[state=active]:bg-foreground data-[state=active]:text-background">
              Bonos
            </TabsTrigger>
            <TabsTrigger value="on" className="text-xs sm:text-sm data-[state=active]:bg-foreground data-[state=active]:text-background">
              ONs
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">
          {assetFilter === "cedear" && "CEDEARs — panel BYMA cedears · paginado server-side"}
          {assetFilter === "accion" && "Acciones líderes y generales — panel BYMA leading-equity"}
          {assetFilter === "bono" && (searched ? `Bonos filtrados por "${searched}" — screener con paginación cliente` : "Bonos soberanos — panel TIR desc · paginado server-side")}
          {assetFilter === "on" && "Obligaciones Negociables — panel negociable-obligations (BYMA)"}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: pageSize === 50 ? 6 : 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] rounded-xl" />
          ))}
        </div>
      ) : hits.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">
            {searched ? `No se encontraron instrumentos para "${searched}"` : assetFilter === "bono" ? "Sin bonos disponibles" : assetFilter === "on" ? "Sin ONs disponibles" : "Sin instrumentos"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Probá con otro símbolo o cambiá de filtro. Página {page} de {totalPages}.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {hits.map((h) => (
              <div key={h.symbol} className="rounded-xl border bg-card p-4 shadow-sm animate-in fade-in-0 duration-150">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <CompanyLogo symbol={h.symbol} market={h.market} size={28} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{h.symbol}</p>
                      <p className="truncate text-xs text-muted-foreground">{h.name}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        <AssetTypeBadge type={h.assetType} className="text-[10px] font-mono" />
                        <span className="text-xs text-muted-foreground">{h.currency}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums">{formatPrice(h.lastPrice)}</p>
                    <div className="mt-0.5 text-xs">
                      <VariationBadge pct={h.variationPct} />
                    </div>
                  </div>
                </div>
                <Button size="sm" className="mt-3 w-full gap-1.5" onClick={() => onPick(h)}>
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block">
            <ResponsiveTable
              columns={[
                {
                  key: "activo",
                  header: "Activo",
                  sortable: true,
                  sortValue: (h) => h.symbol,
                  render: (h) => (
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CompanyLogo symbol={h.symbol} market={h.market} size={28} className="shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium">{h.symbol}</div>
                        <div className="max-w-56 truncate text-xs text-muted-foreground">{h.name}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "ultimo",
                  header: "Último",
                  sortable: true,
                  sortValue: (h) => h.lastPrice ?? 0,
                  align: "right",
                  render: (h) => <span className="font-medium tabular-nums">{formatPrice(h.lastPrice)}</span>,
                },
                {
                  key: "variacion",
                  header: "Variación",
                  sortable: true,
                  sortValue: (h) => h.variationPct ?? 0,
                  align: "right",
                  render: (h) => <VariationBadge pct={h.variationPct} />,
                },
                {
                  key: "tipo",
                  header: "Tipo",
                  render: (h) => <AssetTypeBadge type={h.assetType} className="font-mono text-[10px]" />,
                },
                {
                  key: "accion",
                  header: "",
                  align: "right",
                  render: (h) => (
                    <Button size="xs" className="gap-1" onClick={() => onPick(h)}>
                      <Plus className="h-3.5 w-3.5" /> Agregar
                    </Button>
                  ),
                },
              ]}
              data={hits}
              rowKey={(h) => h.symbol}
            />
          </div>
          <PaginationBar />
        </>
      )}
    </div>
  );
}
