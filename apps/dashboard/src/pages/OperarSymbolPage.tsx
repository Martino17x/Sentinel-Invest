import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { quotesApi, portfolioApi, type OrderMarket, type OrderSide } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { TradeForm, formatMoney } from "@/components/trade/TradeDialog";

function MarketBadge({ market }: { market: string }) {
  const labels: Record<string, string> = { bcba: "BCBA", nyse: "NYSE", nasdaq: "NASDAQ", bonds: "BONOS" };
  return <Badge variant="secondary" className="font-mono text-xs">{labels[market] ?? market.toUpperCase()}</Badge>;
}

/**
 * Página de operación (referencia: pantalla "Comprar/Vender" de IOL).
 * La ORDEN domina la pantalla; en desktop los datos del activo van como
 * aside a la derecha y en mobile arriba de todo (expandidos por defecto).
 */
export function OperarSymbolPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const [searchParams] = useSearchParams();
  const sideParam = (searchParams.get("side") as OrderSide | null) ?? "buy";
  const marketParam = (searchParams.get("market") as OrderMarket | null) ?? "bcba";
  const specieParam = searchParams.get("specie") === "D" ? "D" : undefined;

  const [showData, setShowData] = useState(true);

  const cacheKey = symbol ? `operar:${symbol}:${marketParam}` : null;
  const { data, isLoading: loading, error } = useApiData(
    cacheKey,
    async () => {
      const [q, h, pf] = await Promise.all([
        quotesApi.getQuote(symbol!, marketParam),
        quotesApi.getQuoteHistory(symbol!, marketParam, 90),
        portfolioApi.get().catch(() => null),
      ]);
      const pos = pf ? pf.portfolio.positions.find((p) => p.symbol === q.quote.symbol) : null;
      return {
        quote: q.quote,
        history: h.history,
        availableArs: pf ? pf.portfolio.cashArs : null,
        availableUsd: pf ? pf.portfolio.cashUsd : null,
        availableQty: pos?.quantity ?? null,
      };
    },
    { enabled: Boolean(symbol) }
  );

  const quote = data?.quote ?? null;
  const history = data?.history ?? [];
  const availableArs = data?.availableArs ?? null;
  const availableUsd = data?.availableUsd ?? null;
  const availableQty = data?.availableQty ?? null;

  const chartData = useMemo(
    () =>
      history.map((p) => ({
        label: new Date(p.date).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }),
        close: p.close,
      })),
    [history]
  );

  if (loading && !quote) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>{error ?? "Activo no encontrado"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>Activo no encontrado</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isMep = specieParam === "D";

  const dataCard = (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setShowData((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between text-left"
          aria-expanded={showData}
        >
          <CardTitle className="text-sm font-medium">Datos del activo</CardTitle>
          {showData ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>
      {showData && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-2">
            {[
              { label: "Apertura", value: quote.open != null ? formatMoney(quote.open, quote.currency) : "—" },
              { label: "Máximo", value: quote.high != null ? formatMoney(quote.high, quote.currency) : "—" },
              { label: "Mínimo", value: quote.low != null ? formatMoney(quote.low, quote.currency) : "—" },
              { label: "Cierre ant.", value: quote.prevClose != null ? formatMoney(quote.prevClose, quote.currency) : "—" },
              { label: "Volumen", value: quote.volume != null ? quote.volume.toLocaleString("es-AR") : "—" },
            ].map((d) => (
              <div key={d.label} className="rounded-lg border bg-muted/40 p-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{d.label}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{d.value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico reciente</p>
            {chartData.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin histórico disponible.</p>
            ) : (
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="operarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={32} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={80} tickFormatter={(v: number) => formatMoney(v, quote.currency)} />
                    <Tooltip formatter={(value) => [formatMoney(Number(value ?? 0), quote.currency), "Precio"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }} />
                    <Area type="monotone" dataKey="close" stroke="var(--chart-1)" strokeWidth={2} fill="url(#operarGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            La API de IOL no opera criptomonedas. El dólar se compra vía MEP (especie D).
          </p>
        </CardContent>
      )}
    </Card>
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
      {/* Header compacto */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link to={`/quotes/${quote.symbol}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {sideParam === "buy" ? "Comprar" : "Vender"} {quote.symbol}
              </h1>
              <MarketBadge market={marketParam} />
            </div>
            {quote.name && <p className="truncate text-xs text-muted-foreground">{quote.name}</p>}
          </div>
        </div>
        {marketParam === "bcba" && !isMep && (
          <Link
            to={`/operar/${quote.symbol}?side=${sideParam}&market=bcba&specie=D`}
            className="shrink-0 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20"
          >
            Comprar dólar MEP →
          </Link>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        {/* Datos del activo — mobile: arriba de todo; desktop: aside derecho */}
        <section className="space-y-4 lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4">{dataCard}</section>

        {/* Tarjeta central: la orden */}
        <section className="space-y-4 lg:col-start-1 lg:row-start-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">
                {isMep ? "Dólar MEP" : sideParam === "buy" ? "Comprar" : "Vender"} {quote.symbol}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TradeForm
                symbol={quote.symbol}
                market={marketParam}
                currency={isMep ? "ARS" : quote.currency}
                lastPrice={quote.lastPrice}
                variationPct={quote.variationPct}
                allowMep={marketParam === "bcba"}
                defaultSide={sideParam}
                defaultSpecie={isMep ? "D" : "normal"}
                availableCashArs={availableArs ?? undefined}
                availableCashUsd={availableUsd ?? undefined}
                availableQty={availableQty ?? undefined}
                bid={quote.bid ?? null}
                ask={quote.ask ?? null}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
