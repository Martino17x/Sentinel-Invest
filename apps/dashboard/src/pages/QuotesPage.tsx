import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Star, Zap, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import { quotesApi, bondsApi } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import CompanyLogo from "@/components/ui/company-logo";

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatPrice(value: number | null) {
  if (value === null) return "—";
  return formatterARS.format(value);
}

function formatVolume(value: number) {
  if (value === 0) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

// Tabs de mercado (como IOL pero moderno)
const MARKETS = [
  { value: "bcba", label: "🇦🇷 Argentina" },
  { value: "nyse", label: "🇺🇸 EEUU" },
];

// Tipos de activo por mercado
const ASSET_TYPES: Record<string, { value: string; label: string }[]> = {
  bcba: [
    { value: "cedear", label: "CEDEARs" },
    { value: "accion", label: "Acciones" },
    { value: "bono", label: "Bonos" },
    { value: "on", label: "Obligaciones Neg." },
    { value: "caucion", label: "Cauciones" },
  ],
  nyse: [
    { value: "accion", label: "Acciones" },
    { value: "cedear", label: "ETF" },
  ],
};

function VariationBadge({ pct }: { pct: number }) {
  if (pct > 0.01) {
    return <span className="font-medium tabular-nums text-emerald-600">▲ {pct.toFixed(2)}%</span>;
  }
  if (pct < -0.01) {
    return <span className="font-medium tabular-nums text-red-600">▼ {Math.abs(pct).toFixed(2)}%</span>;
  }
  return <span className="font-medium tabular-nums text-muted-foreground">= 0,00%</span>;
}

// Helper moneda CEDEAR — solo lógica, sin UI pastel
function getQuoteCurrencyLabel(q: { symbol: string; market: string; currency: string }): "AR$" | "US$" | "US$ C" {
  if (q.market !== "bcba") return "US$";
  if (q.currency === "USD") {
    const s = q.symbol.trim().toUpperCase();
    if (s.endsWith("C")) return "US$ C";
    return "US$";
  }
  return "AR$";
}

function isMarketHoursART(now: Date = new Date()): boolean {
  const artMs = now.getTime() - 3 * 60 * 60 * 1000;
  const art = new Date(artMs);
  const day = art.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = art.getUTCHours() * 60 + art.getUTCMinutes();
  return mins >= 11 * 60 && mins < 17 * 60;
}

export function QuotesPage() {
  const [market, setMarket] = useState("bcba");
  const [assetType, setAssetType] = useState("cedear");
  const [page, setPage] = useState(1);
  const [cedearCurrency, setCedearCurrency] = useState<"all" | "ars" | "usd" | "usd_c">("all");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [searchParams] = useSearchParams();
  // Inicializar la búsqueda desde ?q= (usado por la página Inicio para
  // navegar a cotizaciones con un símbolo prefijado)
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [searched, setSearched] = useState(searchParams.get("q")?.trim() ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const PAGE_SIZE = 25;

  // Búsqueda SERVER-SIDE con debounce (350ms): el server filtra el catálogo
  // completo ANTES de paginar, así "NVDA" aparece aunque no esté en la página 1.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearched(search.trim());
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const cacheKey = `quotes:panel:${market}:${assetType}:${page}:${searched}`;

  const {
    data: panelData,
    isLoading: loading,
    isRefreshing,
    error,
    refetch,
  } = useApiData(cacheKey, () =>
    quotesApi.getPanel(market, assetType, page, PAGE_SIZE, searched || undefined)
  );

  const summary = panelData?.summary ?? null;
  const quotes = panelData?.quotes ?? [];
  const total = panelData?.total ?? 0;

  // Renta fija: enrich bono/on tabs with TIR/MD from curve (SwrCache 15min)
  const isBonoTab = assetType === "bono" || assetType === "on";
  const { data: curveUsd } = useApiData(
    isBonoTab ? "bonds:curve:USD-hard-dollar" : null,
    () => bondsApi.getCurve("USD-hard-dollar"),
    { enabled: isBonoTab }
  );
  const { data: curveCer } = useApiData(
    isBonoTab ? "bonds:curve:CER" : null,
    () => bondsApi.getCurve("CER"),
    { enabled: isBonoTab }
  );
  const { data: curveBopreal } = useApiData(
    isBonoTab ? "bonds:curve:BOPREAL" : null,
    () => bondsApi.getCurve("BOPREAL"),
    { enabled: isBonoTab }
  );
  const { data: curveLecap } = useApiData(
    isBonoTab ? "bonds:curve:LECAP/BONCAP" : null,
    () => bondsApi.getCurve("LECAP/BONCAP"),
    { enabled: isBonoTab }
  );

  const curveMap = useMemo(() => {
    if (!isBonoTab) return new Map<string, { tir: number; md: number }>();
    const map = new Map<string, { tir: number; md: number }>();
    for (const src of [curveUsd, curveCer, curveBopreal, curveLecap]) {
      for (const p of src?.points ?? []) {
        map.set(p.ticker.toUpperCase(), { tir: p.tir, md: p.md });
      }
    }
    return map;
  }, [isBonoTab, curveUsd, curveCer, curveBopreal, curveLecap]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Filtro client-side: favoritas + moneda CEDEAR (AR$ / US$ / US$ C)
  const filteredQuotes = useMemo(() => {
    let out = quotes;
    if (onlyFavorites) out = out.filter((quote) => favorites.has(quote.symbol));
    if (market === "bcba" && assetType === "cedear" && cedearCurrency !== "all") {
      out = out.filter((q) => {
        const label = getQuoteCurrencyLabel(q);
        if (cedearCurrency === "ars") return label === "AR$";
        if (cedearCurrency === "usd") return label === "US$";
        if (cedearCurrency === "usd_c") return label === "US$ C";
        return true;
      });
    }
    return out;
  }, [quotes, onlyFavorites, favorites, market, assetType, cedearCurrency]);

  function toggleFavorite(symbol: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }

  // Ordenar: favoritos primero, luego por símbolo
  const sortedQuotes = useMemo(() => {
    return [...filteredQuotes].sort((a, b) => {
      const aFav = favorites.has(a.symbol) ? 0 : 1;
      const bFav = favorites.has(b.symbol) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [filteredQuotes, favorites]);

  const panelIsUp = (summary?.totalVariationPct ?? 0) >= 0;

  // Banner rojo 502 solo en horario abierto. Fuera de horario el mensaje
  // gris "El mercado está cerrado" (cached/emptyState) ya es suficiente.
  const isClosedState = Boolean(panelData?.cached || summary?.isRealtime === false);
  const isByma502 = error ? /BYMA|HTTP 502/i.test(error) : false;
  const shouldShowError = Boolean(error && !isClosedState && !(isByma502 && !isMarketHoursART()));

  /** Controles de paginación (reutilizados arriba y abajo de la tabla) */
  function PaginationControls({ align }: { align?: "end" }) {
    if (totalPages <= 1) return null;
    return (
      <div className={`flex items-center gap-1 ${align === "end" ? "justify-end" : ""}`}>
        <Button
          variant="outline"
          size="sm"
          className="h-8 cursor-pointer px-2"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || (loading && quotes.length === 0)}
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
          disabled={page >= totalPages || (loading && quotes.length === 0)}
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">
            Mercado argentino y americano — en tiempo real
          </p>
        </div>
        {summary?.isRealtime && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <Zap className="h-3.5 w-3.5" />
            En tiempo real
          </span>
        )}
        {panelData?.cached && panelData?.message && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <RefreshCw className="h-3.5 w-3.5" />
            {panelData.message}
          </span>
        )}
        {summary && !summary.isRealtime && !panelData?.cached && quotes.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <RefreshCw className="h-3.5 w-3.5" />
            Mercado cerrado
          </span>
        )}
      </div>

      {/* Selector de mercado + tipo de activo */}
      <Tabs value={market} onValueChange={(v) => { setMarket(v); setPage(1); }}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max">
            {MARKETS.map((m) => (
              <TabsTrigger key={m.value} value={m.value}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Tabs value={assetType} onValueChange={(v) => { setAssetType(v); setPage(1); setCedearCurrency("all"); }}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="w-max">
            {(ASSET_TYPES[market] ?? []).map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {market === "bcba" && assetType === "cedear" && (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { value: "all" as const, label: "Todos", flag: null as string | null },
              { value: "ars" as const, label: "AR$", flag: "🇦🇷" },
              { value: "usd" as const, label: "US$", flag: "🇺🇸" },
              { value: "usd_c" as const, label: "US$ C", flag: "🇺🇸" },
            ] as const
          ).map((opt) => {
            const active = cedearCurrency === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCedearCurrency(opt.value)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors ${active ? "border-foreground bg-foreground text-background ring-1 ring-foreground" : "border-border bg-white text-foreground hover:bg-muted"}`}
              >
                {opt.flag && <span aria-hidden>{opt.flag}</span>}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Resumen del panel + buscador + filtro favoritas */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Panel</span>
          <span className={`font-medium tabular-nums ${panelIsUp ? "text-emerald-600" : "text-red-600"}`}>
            {panelIsUp ? "▲" : "▼"} {Math.abs(summary?.totalVariationPct ?? 0).toFixed(2)}%
          </span>
          {isRefreshing && (
            <span className="text-xs text-muted-foreground animate-pulse">
              Actualizando…
            </span>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button
            variant={onlyFavorites ? "default" : "outline"}
            size="sm"
            className={onlyFavorites ? "gap-1.5" : "gap-1.5"}
            onClick={() => setOnlyFavorites((prev) => !prev)}
          >
            <Star className={`h-3.5 w-3.5 ${onlyFavorites ? "fill-current" : ""}`} />
            Favoritas
            {favorites.size > 0 && (
              <span className="text-xs opacity-70">({favorites.size})</span>
            )}
          </Button>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar símbolo — ej: NVDA"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {shouldShowError && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Datos cacheados al cierre — sólido per anti-vibecoded #6/#10: pastel prohibido */}
      {panelData?.cached && panelData?.message && (
        <Alert className="border-amber-600 bg-amber-500 text-white dark:border-amber-600 dark:bg-amber-500 dark:text-white [&_svg]:text-white">
          <AlertDescription className="flex items-center gap-2 text-sm text-white">
            <RefreshCw className="h-4 w-4 shrink-0 text-white" />
            <span className="text-white">{panelData.message} — El mercado está cerrado / Las cotizaciones se muestran en horario de mercado (lun-vie 11:00-17:00).</span>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabla de cotizaciones */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>
              {ASSET_TYPES[market]?.find((t) => t.value === assetType)?.label ?? assetType}{" "}
              {market === "bcba" ? "Argentina" : "EEUU"}
            </CardTitle>
            <CardDescription>
              {total > 0 ? `${total} instrumentos en total` : `${sortedQuotes.length} instrumentos`}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Paginación (arriba) */}
            <PaginationControls />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => refetch()}
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing || loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && quotes.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <>
              {/* ===== MOBILE / TABLET: cards con jerarquía ===== */}
              <div className="space-y-3 lg:hidden">
                {sortedQuotes.map((quote) => (
                  <div key={quote.symbol} className="rounded-xl border bg-card p-4 shadow-sm">
                    {/* Nivel 1: favorito + logo + símbolo + nombre */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <button
                          onClick={() => toggleFavorite(quote.symbol)}
                          className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-amber-400"
                          title={favorites.has(quote.symbol) ? "Quitar favorito" : "Agregar favorito"}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              favorites.has(quote.symbol) ? "fill-amber-400 text-amber-400" : ""
                            }`}
                          />
                        </button>
                        <CompanyLogo symbol={quote.symbol} market={quote.market} size={28} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                            <Link
                              to={`/quotes/${quote.symbol}`}
                              className="text-base font-semibold text-foreground transition-colors hover:text-primary"
                            >
                              {quote.symbol}
                            </Link>
                          <p className="truncate text-xs text-muted-foreground">{quote.name}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold tabular-nums">
                          {formatPrice(quote.lastPrice)}
                        </p>
                        <div className="mt-0.5">
                          <VariationBadge pct={quote.variationPct} />
                        </div>
                      </div>
                    </div>

                    {/* Nivel 2: bid/ask en fila destacada */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Compra
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatPrice(quote.bid)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-3 py-2">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Venta
                        </p>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatPrice(quote.ask)}
                        </p>
                      </div>
                    </div>

                    {/* Nivel 3: rango del día + volumen en filas label/valor */}
                    <dl className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs text-muted-foreground">Mínimo del día</dt>
                        <dd className="text-sm font-medium tabular-nums">{formatPrice(quote.low)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs text-muted-foreground">Máximo del día</dt>
                        <dd className="text-sm font-medium tabular-nums">{formatPrice(quote.high)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-xs text-muted-foreground">Volumen</dt>
                        <dd className="text-sm font-medium tabular-nums">
                          {formatVolume(quote.volume)}
                        </dd>
                      </div>
                      {isBonoTab && (() => {
                        const v = curveMap.get(quote.symbol.toUpperCase());
                        return v ? (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-xs text-muted-foreground">TIR</dt>
                              <dd className="text-sm font-medium tabular-nums">{`${(v.tir * 100).toFixed(2)}%`}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <dt className="text-xs text-muted-foreground">MD</dt>
                              <dd className="text-sm font-medium tabular-nums">{v.md.toFixed(2)}</dd>
                            </div>
                          </>
                        ) : null;
                      })()}
                    </dl>
                  </div>
                ))}
              </div>

              {/* ===== DESKTOP: tabla completa ===== */}
              <div className="hidden lg:block">
                <ResponsiveTable
                  columns={[
                    {
                      key: "fav",
                      header: "",
                      render: (quote) => (
                        <button
                          onClick={() => toggleFavorite(quote.symbol)}
                          className="cursor-pointer text-muted-foreground transition-colors hover:text-amber-400"
                          title={favorites.has(quote.symbol) ? "Quitar favorito" : "Agregar favorito"}
                        >
                          <Star
                            className={`h-4 w-4 ${
                              favorites.has(quote.symbol) ? "fill-amber-400 text-amber-400" : ""
                            }`}
                          />
                        </button>
                      ),
                    },
                    {
                      key: "activo",
                      header: "Activo",
                      sortable: true,
                      sortValue: (q) => q.symbol,
                      render: (quote) => (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CompanyLogo symbol={quote.symbol} market={quote.market} size={28} className="shrink-0" />
                          <div className="min-w-0">
                            <Link
                              to={`/quotes/${quote.symbol}`}
                              className="font-medium text-foreground transition-colors hover:text-primary"
                            >
                              {quote.symbol}
                            </Link>
                            <div className="max-w-56 truncate text-xs text-muted-foreground">
                              {quote.name}
                            </div>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "ultimo",
                      header: "Último",
                      sortable: true,
                      sortValue: (q) => q.lastPrice,
                      align: "right",
                      render: (quote) => (
                        <span className="font-medium tabular-nums">{formatPrice(quote.lastPrice)}</span>
                      ),
                    },
                    {
                      key: "variacion",
                      header: "Variación",
                      sortable: true,
                      sortValue: (q) => q.variationPct,
                      align: "right",
                      render: (quote) => <VariationBadge pct={quote.variationPct} />,
                    },
                    {
                      key: "compra",
                      header: "Compra",
                      sortable: true,
                      sortValue: (q) => q.bid ?? null,
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">{formatPrice(quote.bid)}</span>
                      ),
                    },
                    {
                      key: "venta",
                      header: "Venta",
                      sortable: true,
                      sortValue: (q) => q.ask ?? null,
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">{formatPrice(quote.ask)}</span>
                      ),
                    },
                    {
                      key: "minimo",
                      header: "Mínimo",
                      sortable: true,
                      sortValue: (q) => q.low ?? null,
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">{formatPrice(quote.low)}</span>
                      ),
                    },
                    {
                      key: "maximo",
                      header: "Máximo",
                      sortable: true,
                      sortValue: (q) => q.high ?? null,
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">{formatPrice(quote.high)}</span>
                      ),
                    },
                    {
                      key: "volumen",
                      header: "Volumen",
                      sortable: true,
                      sortValue: (q) => q.volume,
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">
                          {formatVolume(quote.volume)}
                        </span>
                      ),
                    },
                    ...(isBonoTab
                      ? [
                          {
                            key: "tir",
                            header: "TIR",
                            sortable: true,
                            sortValue: (q: (typeof sortedQuotes)[number]) => curveMap.get(q.symbol.toUpperCase())?.tir ?? null,
                            align: "right" as const,
                            render: (quote: (typeof sortedQuotes)[number]) => {
                              const v = curveMap.get(quote.symbol.toUpperCase())?.tir;
                              return <span className="tabular-nums font-medium">{v != null ? `${(v * 100).toFixed(2)}%` : "—"}</span>;
                            },
                          },
                          {
                            key: "md",
                            header: "MD",
                            sortable: true,
                            sortValue: (q: (typeof sortedQuotes)[number]) => curveMap.get(q.symbol.toUpperCase())?.md ?? null,
                            align: "right" as const,
                            render: (quote: (typeof sortedQuotes)[number]) => {
                              const v = curveMap.get(quote.symbol.toUpperCase())?.md;
                              return <span className="tabular-nums text-muted-foreground">{v != null ? v.toFixed(2) : "—"}</span>;
                            },
                          },
                        ]
                      : []),
                    {
                      key: "accion",
                      header: "",
                      align: "right",
                      render: (quote) => (
                        <Link to={`/operar/${quote.symbol}?side=buy&market=${market}`}>
                          <Button size="xs" className="cursor-pointer">
                            Comprar
                          </Button>
                        </Link>
                      ),
                    },
                  ]}
                  data={sortedQuotes}
                  rowKey={(quote) => quote.symbol}
                  emptyState={
                    search.trim() === "" ? (
                      <>
                        <p className="mb-1 font-medium">El mercado está cerrado</p>
                        <p className="text-xs">
                          Las cotizaciones se muestran en horario de mercado (lun-vie 11:00-17:00).
                        </p>
                      </>
                    ) : (
                      <>No se encontraron instrumentos para "{search}"</>
                    )
                  }
                />
              </div>

              {/* Paginación (abajo) — misma navegación al final de la lista */}
              {!loading && sortedQuotes.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <PaginationControls align="end" />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
