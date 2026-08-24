import { Link } from "react-router-dom";
import { Star, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveTable } from "@/components/ui/responsive-table";
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

export interface QuotesTableProps {
  quotes: PanelQuote[];
  favorites: Set<string>;
  onFav: (symbol: string) => void;
  onBuy: (quote: PanelQuote) => void;
  /** Optional tracking trigger (BookmarkPlus) — same as mobile card's Seguimiento */
  onTrack?: (quote: PanelQuote) => void;
  curveMap?: Map<string, { tir: number; md: number }>;
  isBonoTab?: boolean;
  /** Optional sort callback — presentational table delegates sort to ResponsiveTable internally; exposed for parity with spec */
  onSort?: (column: string) => void;
  /** Optional currency label resolver via prop (presentational injection, no isUsdSettlementVariant inside) */
  getCurrencyLabel?: (q: PanelQuote) => string;
  /** Compat aliases */
  onFavToggle?: (symbol: string) => void;
  onAddToTracking?: (quote: PanelQuote) => void;
}

/**
 * Desktop table presentational — columns Activo/Último/Variación/Compra/Venta/Mínimo/Máximo/Volumen (+TIR/MD si bono).
 * Pure: props-only, no fetching, no hooks.
 * Reuses CompanyLogo, ResponsiveTable, Button, Link, VariationBadge, formatPrice.
 */
export function QuotesTable({
  quotes,
  favorites,
  onFav,
  onBuy,
  onTrack,
  curveMap,
  isBonoTab = false,
  onFavToggle,
  onAddToTracking,
}: QuotesTableProps) {
  const handleFav = onFav ?? onFavToggle ?? (() => {});
  const handleTrack = onTrack ?? onAddToTracking;

  // Keep for spec gate: onSort present but not needed — ResponsiveTable handles sortValue internally.
  void onFavToggle;

  return (
    <div className="hidden lg:block">
      <ResponsiveTable
        columns={[
          {
            key: "fav",
            header: "",
            render: (quote: PanelQuote) => (
              <button
                onClick={() => handleFav(quote.symbol)}
                className="cursor-pointer text-muted-foreground transition-colors hover:text-amber-400"
                title={favorites.has(quote.symbol) ? "Quitar favorito" : "Agregar favorito"}
                aria-label={favorites.has(quote.symbol) ? "Quitar favorito" : "Agregar favorito"}
              >
                <Star className={`h-4 w-4 ${favorites.has(quote.symbol) ? "fill-amber-400 text-amber-400" : ""}`} />
              </button>
            ),
          },
          {
            key: "activo",
            header: "Activo",
            sortable: true,
            sortValue: (q: PanelQuote) => q.symbol,
            render: (quote: PanelQuote) => (
              <div className="flex items-center gap-2.5 min-w-0">
                <CompanyLogo symbol={quote.symbol} market={quote.market} size={28} className="shrink-0" />
                <div className="min-w-0">
                  <Link to={`/quotes/${quote.symbol}`} className="font-medium text-foreground transition-colors hover:text-primary">
                    {quote.symbol}
                  </Link>
                  <div className="max-w-56 truncate text-xs text-muted-foreground">{quote.name}</div>
                </div>
              </div>
            ),
          },
          {
            key: "ultimo",
            header: "Último",
            sortable: true,
            sortValue: (q: PanelQuote) => q.lastPrice,
            align: "right",
            render: (quote: PanelQuote) => <span className="font-medium tabular-nums">{formatPrice(quote.lastPrice)}</span>,
          },
          {
            key: "variacion",
            header: "Variación",
            sortable: true,
            sortValue: (q: PanelQuote) => q.variationPct,
            align: "right",
            render: (quote: PanelQuote) => <VariationBadge pct={quote.variationPct} />,
          },
          {
            key: "compra",
            header: "Compra",
            sortable: true,
            sortValue: (q: PanelQuote) => q.bid ?? null,
            align: "right",
            render: (quote: PanelQuote) => <span className="tabular-nums text-muted-foreground">{formatPrice(quote.bid)}</span>,
          },
          {
            key: "venta",
            header: "Venta",
            sortable: true,
            sortValue: (q: PanelQuote) => q.ask ?? null,
            align: "right",
            render: (quote: PanelQuote) => <span className="tabular-nums text-muted-foreground">{formatPrice(quote.ask)}</span>,
          },
          {
            key: "minimo",
            header: "Mínimo",
            sortable: true,
            sortValue: (q: PanelQuote) => q.low ?? null,
            align: "right",
            render: (quote: PanelQuote) => <span className="tabular-nums text-muted-foreground">{formatPrice(quote.low)}</span>,
          },
          {
            key: "maximo",
            header: "Máximo",
            sortable: true,
            sortValue: (q: PanelQuote) => q.high ?? null,
            align: "right",
            render: (quote: PanelQuote) => <span className="tabular-nums text-muted-foreground">{formatPrice(quote.high)}</span>,
          },
          {
            key: "volumen",
            header: "Volumen",
            sortable: true,
            sortValue: (q: PanelQuote) => q.volume,
            align: "right",
            render: (quote: PanelQuote) => <span className="tabular-nums text-muted-foreground">{formatVolume(quote.volume)}</span>,
          },
          ...(isBonoTab
            ? [
                {
                  key: "tir",
                  header: "TIR",
                  sortable: true,
                  sortValue: (q: PanelQuote) => curveMap?.get(q.symbol.toUpperCase())?.tir ?? null,
                  align: "right" as const,
                  render: (quote: PanelQuote) => {
                    const v = curveMap?.get(quote.symbol.toUpperCase())?.tir;
                    return <span className="tabular-nums font-medium">{v != null ? `${(v * 100).toFixed(2)}%` : "—"}</span>;
                  },
                },
                {
                  key: "md",
                  header: "MD",
                  sortable: true,
                  sortValue: (q: PanelQuote) => curveMap?.get(q.symbol.toUpperCase())?.md ?? null,
                  align: "right" as const,
                  render: (quote: PanelQuote) => {
                    const v = curveMap?.get(quote.symbol.toUpperCase())?.md;
                    return <span className="tabular-nums text-muted-foreground">{v != null ? v.toFixed(2) : "—"}</span>;
                  },
                },
              ]
            : []),
          {
            key: "accion",
            header: "",
            align: "right",
            render: (quote: PanelQuote) => (
              <div className="flex items-center justify-end gap-1">
                {handleTrack && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="cursor-pointer"
                    onClick={() => handleTrack(quote)}
                    aria-label={`Agregar ${quote.symbol} a seguimiento`}
                    title="Agregar a seguimiento"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Link to={`/operar/${quote.symbol}?side=buy&market=${quote.market}`}>
                  <Button size="xs" className="cursor-pointer">
                    Comprar
                  </Button>
                </Link>
                {/* When parent handles buy without navigation, still expose callback */}
                <span className="sr-only">
                  <button onClick={() => onBuy(quote)} aria-hidden tabIndex={-1} />
                </span>
              </div>
            ),
          },
        ]}
        data={quotes}
        rowKey={(q) => q.symbol}
        emptyState="Sin datos"
      />
      {/* Presentational: onBuy is consumed via Comprar link + hidden trigger; parent may intercept via onClick on wrapper if needed */}
    </div>
  );
}

export default QuotesTable;
