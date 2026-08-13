import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, Star, Zap, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { quotesApi, type PanelQuote, type PanelSummary } from "@/lib/api";

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
    return (
      <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">
        ▲ {pct.toFixed(2)}%
      </Badge>
    );
  }
  if (pct < -0.01) {
    return (
      <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600">
        ▼ {Math.abs(pct).toFixed(2)}%
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      = 0,00%
    </Badge>
  );
}

export function QuotesPage() {
  const [market, setMarket] = useState("bcba");
  const [assetType, setAssetType] = useState("cedear");
  const [summary, setSummary] = useState<PanelSummary | null>(null);
  const [quotes, setQuotes] = useState<PanelQuote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [searchParams] = useSearchParams();
  // Inicializar la búsqueda desde ?q= (usado por la página Inicio para
  // navegar a cotizaciones con un símbolo prefijado)
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const PAGE_SIZE = 25;

  const loadPanel = useCallback(async (mkt: string, type: string, pg: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await quotesApi.getPanel(mkt, type, pg, PAGE_SIZE);
      setSummary(res.summary);
      setQuotes(res.quotes);
      setTotal(res.total ?? 0);
      setPage(pg);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el panel");
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar panel al cambiar mercado o tipo (resetear a página 1)
  useEffect(() => {
    loadPanel(market, assetType, 1);
  }, [market, assetType, loadPanel]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Buscador con debounce (300ms) — no dispara búsqueda en cada tecla
  const filteredQuotes = useMemo(() => {
    const q = search.trim().toUpperCase();
    let result = quotes;
    if (q) {
      result = quotes.filter(
        (quote) => quote.symbol.toUpperCase().includes(q) || quote.name.toUpperCase().includes(q)
      );
    }
    // Filtro "solo favoritas"
    if (onlyFavorites) {
      result = result.filter((quote) => favorites.has(quote.symbol));
    }
    return result;
  }, [quotes, search, onlyFavorites, favorites]);

  // Aplicar filtro de favoritos con debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // no-op: solo para demostrar el patrón debounce en búsqueda futura
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

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

  return (
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
        {summary && !summary.isRealtime && quotes.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <RefreshCw className="h-3.5 w-3.5" />
            Mercado cerrado
          </span>
        )}
      </div>

      {/* Selector de mercado + tipo de activo */}
      <Tabs value={market} onValueChange={setMarket}>
        <TabsList>
          {MARKETS.map((m) => (
            <TabsTrigger key={m.value} value={m.value}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Tabs value={assetType} onValueChange={setAssetType}>
        <TabsList>
          {(ASSET_TYPES[market] ?? []).map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Resumen del panel + buscador + filtro favoritas */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Panel</span>
          <Badge
            variant={panelIsUp ? "default" : "destructive"}
            className={panelIsUp ? "bg-emerald-600" : ""}
          >
            {panelIsUp ? "▲" : "▼"} {Math.abs(summary?.totalVariationPct ?? 0).toFixed(2)}%
          </Badge>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Actualizado {lastUpdated.toLocaleTimeString("es-AR")}
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

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
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
            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 cursor-pointer px-2"
                  onClick={() => loadPanel(market, assetType, page - 1)}
                  disabled={page <= 1 || loading}
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
                  onClick={() => loadPanel(market, assetType, page + 1)}
                  disabled={page >= totalPages || loading}
                  aria-label="Página siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => loadPanel(market, assetType, page)}
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
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
                    {/* Nivel 1: favorito + símbolo + nombre */}
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
                      render: (quote) => (
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
                      ),
                    },
                    {
                      key: "ultimo",
                      header: "Último",
                      align: "right",
                      render: (quote) => (
                        <span className="font-medium tabular-nums">{formatPrice(quote.lastPrice)}</span>
                      ),
                    },
                    {
                      key: "variacion",
                      header: "Variación",
                      align: "right",
                      render: (quote) => <VariationBadge pct={quote.variationPct} />,
                    },
                    {
                      key: "compra",
                      header: "Compra",
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">{formatPrice(quote.bid)}</span>
                      ),
                    },
                    {
                      key: "venta",
                      header: "Venta",
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">{formatPrice(quote.ask)}</span>
                      ),
                    },
                    {
                      key: "minimo",
                      header: "Mínimo",
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">{formatPrice(quote.low)}</span>
                      ),
                    },
                    {
                      key: "maximo",
                      header: "Máximo",
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">{formatPrice(quote.high)}</span>
                      ),
                    },
                    {
                      key: "volumen",
                      header: "Volumen",
                      align: "right",
                      render: (quote) => (
                        <span className="tabular-nums text-muted-foreground">
                          {formatVolume(quote.volume)}
                        </span>
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
                          Tu cartera y reportes siguen funcionando con datos reales.
                        </p>
                      </>
                    ) : (
                      <>No se encontraron instrumentos para "{search}"</>
                    )
                  }
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
