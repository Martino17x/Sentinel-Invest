import { Link } from "react-router-dom";
import { Star, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompanyLogo from "@/components/ui/company-logo";
import type { PanelQuote } from "../api";

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatPrice(value: number | null | undefined) {
  if (value == null) return "—";
  return formatterARS.format(value);
}

function formatVolume(value: number) {
  if (value === 0) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function VariationBadge({ pct }: { pct: number }) {
  if (pct > 0.01) {
    return <span className="font-medium tabular-nums text-emerald-600">▲ {pct.toFixed(2)}%</span>;
  }
  if (pct < -0.01) {
    return <span className="font-medium tabular-nums text-red-600">▼ {Math.abs(pct).toFixed(2)}%</span>;
  }
  return <span className="font-medium tabular-nums text-muted-foreground">= 0,00%</span>;
}

export interface QuoteMobileCardProps {
  quote: PanelQuote;
  isFav: boolean;
  onFav: (symbol: string) => void;
  onBuy: (quote: PanelQuote) => void;
  /** Display currency label (AR$ / US$ / US$ C) — optional for parity with table */
  currencyLabel?: string;
  /** Bono enrichment — optional TIR/MD */
  curveData?: { tir: number; md: number } | null;
  /** Compat: curveMap alternative so parent can pass map instead of single entry */
  curveMap?: Map<string, { tir: number; md: number }>;
  onTrack?: (quote: PanelQuote) => void;
}

/**
 * Mobile card presentational — 3 niveles (header logo+fav+precio+var, bid/ask grid, dl min/max/vol+tir/md).
 * Pure: props-only, no fetching.
 */
export function QuoteMobileCard({
  quote,
  isFav,
  onFav,
  onBuy,
  currencyLabel,
  curveData,
  curveMap,
  onTrack,
}: QuoteMobileCardProps) {
  const resolvedCurve = curveData ?? curveMap?.get(quote.symbol.toUpperCase()) ?? null;
  void currencyLabel;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      {/* Nivel 1: favorito + logo + símbolo + nombre | precio + variación */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <button
            onClick={() => onFav(quote.symbol)}
            className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-amber-400"
            title={isFav ? "Quitar favorito" : "Agregar favorito"}
            aria-label={isFav ? "Quitar favorito" : "Agregar favorito"}
          >
            <Star className={`h-4 w-4 ${isFav ? "fill-amber-400 text-amber-400" : ""}`} />
          </button>
          <CompanyLogo symbol={quote.symbol} market={quote.market} size={28} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <Link to={`/quotes/${quote.symbol}`} className="text-base font-semibold text-foreground transition-colors hover:text-primary">
              {quote.symbol}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{quote.name}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-bold tabular-nums">{formatPrice(quote.lastPrice)}</p>
          <div className="mt-0.5">
            <VariationBadge pct={quote.variationPct} />
          </div>
        </div>
      </div>

      {/* Nivel 2: bid/ask en fila destacada */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Compra</p>
          <p className="text-sm font-semibold tabular-nums">{formatPrice(quote.bid)}</p>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Venta</p>
          <p className="text-sm font-semibold tabular-nums">{formatPrice(quote.ask)}</p>
        </div>
      </div>

      {/* Nivel 3: rango del día + volumen + TIR/MD en filas label/valor */}
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
          <dd className="text-sm font-medium tabular-nums">{formatVolume(quote.volume)}</dd>
        </div>
        {resolvedCurve && (
          <>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-muted-foreground">TIR</dt>
              <dd className="text-sm font-medium tabular-nums">{`${(resolvedCurve.tir * 100).toFixed(2)}%`}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-muted-foreground">MD</dt>
              <dd className="text-sm font-medium tabular-nums">{resolvedCurve.md.toFixed(2)}</dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-3 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 cursor-pointer"
          onClick={() => (onTrack ? onTrack(quote) : onBuy(quote))}
          aria-label={`Agregar ${quote.symbol} a seguimiento`}
        >
          <BookmarkPlus className="h-4 w-4" />
          Seguimiento
        </Button>
        <Link to={`/operar/${quote.symbol}?side=buy&market=${quote.market}`} className="flex-1">
          <Button size="sm" className="w-full cursor-pointer" onClick={() => onBuy(quote)}>
            Comprar
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default QuoteMobileCard;
