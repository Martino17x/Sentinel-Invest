import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Zap, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DisclaimerBanner } from "@/components/ui/disclaimer-banner";
import { AddToTrackingModal } from "@/components/AddToTrackingModal";
import { type PanelQuote } from "./api";
import { useQuotes } from "./hooks/useQuotes";
import { useCurrencyToggle } from "./hooks/useCurrencyToggle";
import { QuotesToolbar } from "./components/QuotesToolbar";
import { QuotesTable } from "./components/QuotesTable";
import { QuoteMobileCard } from "./components/QuoteMobileCard";
import { QuotesPagination } from "./components/QuotesPagination";

function isMarketHoursART(now = new Date()): boolean {
  const art = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const d = art.getUTCDay();
  if (d === 0 || d === 6) return false;
  const m = art.getUTCHours() * 60 + art.getUTCMinutes();
  return m >= 660 && m < 1020;
}

export function QuotesPage() {
  const [searchParams] = useSearchParams();
  const [market, setMarket] = useState("bcba");
  const [assetType, setAssetType] = useState("cedear");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [searched, setSearched] = useState(searchParams.get("q")?.trim() ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [trackingQuote, setTrackingQuote] = useState<PanelQuote | null>(null);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const { cedearCurrency, setCedearCurrency, getCurrencyLabel } = useCurrencyToggle();

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

  const { quotes, total, loading, isRefreshing, error, summary, refetch, favorites, toggleFavorite, onlyFavorites, setOnlyFavorites } =
    useQuotes({ market, assetType, page, searched });

  const isBonoTab = assetType === "bono" || assetType === "on";
  const curveMap = useMemo(() => new Map<string, { tir: number; md: number }>(), []);
  const totalPages = Math.max(1, Math.ceil(total / 25));

  const filteredQuotes = useMemo(() => {
    let out = quotes;
    if (onlyFavorites) out = out.filter((q) => favorites.has(q.symbol));
    if (market === "bcba" && assetType === "cedear" && cedearCurrency !== "all") {
      out = out.filter((q) => {
        const l = getCurrencyLabel(q);
        if (cedearCurrency === "ars") return l === "AR$";
        if (cedearCurrency === "usd") return l === "US$";
        if (cedearCurrency === "usd_c") return l === "US$ C";
        return true;
      });
    }
    return out;
  }, [quotes, onlyFavorites, favorites, market, assetType, cedearCurrency, getCurrencyLabel]);

  const sortedQuotes = useMemo(
    () =>
      [...filteredQuotes].sort((a, b) => {
        const af = favorites.has(a.symbol) ? 0 : 1;
        const bf = favorites.has(b.symbol) ? 0 : 1;
        if (af !== bf) return af - bf;
        return a.symbol.localeCompare(b.symbol);
      }),
    [filteredQuotes, favorites],
  );

  const panelIsUp = (summary?.totalVariationPct ?? 0) >= 0;
  const isClosedState = Boolean(summary && !summary.isRealtime);
  const isByma502 = error ? /BYMA|HTTP 502/i.test(error) : false;
  const shouldShowError = Boolean(error && !isClosedState && !(isByma502 && !isMarketHoursART()));
  const openTracking = (q: PanelQuote) => {
    setTrackingQuote(q);
    setTrackingOpen(true);
  };

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden space-y-0">
      <DisclaimerBanner />
      <div className="mx-auto min-w-0 max-w-7xl space-y-6 overflow-x-hidden p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
            <p className="text-sm text-muted-foreground">Mercado argentino y americano — en tiempo real</p>
          </div>
          {summary?.isRealtime && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Zap className="h-3.5 w-3.5" />En tiempo real
            </span>
          )}
          {isRefreshing && <span className="text-xs text-muted-foreground animate-pulse">Actualizando…</span>}
        </div>

        <QuotesToolbar
          search={search}
          onSearchChange={setSearch}
          onlyFavorites={onlyFavorites}
          onToggleFavorites={() => setOnlyFavorites((p) => !p)}
          favoritesCount={favorites.size}
          market={market}
          assetType={assetType}
          onMarketChange={(v) => {
            setMarket(v);
            setPage(1);
          }}
          onAssetTypeChange={(v) => {
            setAssetType(v);
            setPage(1);
            setCedearCurrency("all");
          }}
          cedearCurrency={cedearCurrency}
          onCedearCurrencyChange={setCedearCurrency}
        />

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Panel</span>
          <span className={`font-medium tabular-nums ${panelIsUp ? "text-emerald-600" : "text-red-600"}`}>
            {panelIsUp ? "▲" : "▼"} {Math.abs(summary?.totalVariationPct ?? 0).toFixed(2)}%
          </span>
        </div>

        {shouldShowError && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>
                {assetType} {market === "bcba" ? "Argentina" : "EEUU"}
              </CardTitle>
              <CardDescription>{total > 0 ? `${total} instrumentos` : `${sortedQuotes.length} instrumentos`}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <QuotesPagination page={page} totalPages={totalPages} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} loading={loading && quotes.length === 0} />
              <Button variant="ghost" size="icon" onClick={() => refetch()} title="Actualizar">
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
                <div className="space-y-3 lg:hidden">
                  {sortedQuotes.map((q) => (
                    <QuoteMobileCard key={q.symbol} quote={q} isFav={favorites.has(q.symbol)} onFav={toggleFavorite} onBuy={openTracking} onTrack={openTracking} currencyLabel={getCurrencyLabel(q)} curveMap={curveMap} />
                  ))}
                </div>
                <QuotesTable quotes={sortedQuotes} favorites={favorites} onFav={toggleFavorite} onBuy={openTracking} onTrack={openTracking} curveMap={curveMap} isBonoTab={isBonoTab} />
                {sortedQuotes.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <QuotesPagination page={page} totalPages={totalPages} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => Math.min(totalPages, p + 1))} loading={loading && quotes.length === 0} align="end" />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {trackingQuote && (
        <AddToTrackingModal open={trackingOpen} onOpenChange={(v) => { setTrackingOpen(v); if (!v) setTrackingQuote(null); }} symbol={trackingQuote.symbol} market={trackingQuote.market} lastPrice={trackingQuote.lastPrice} currency={trackingQuote.currency} />
      )}
    </div>
  );
}

export default QuotesPage;
