import { Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MARKETS = [
  { value: "bcba", label: "🇦🇷 Argentina" },
  { value: "nyse", label: "🇺🇸 EEUU" },
] as const;

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

export type CedearCurrency = "all" | "ars" | "usd" | "usd_c";

export interface QuotesToolbarProps {
  search: string;
  onSearchChange: (v: string) => void;
  /** fav filter — supports both naming aliases */
  onlyFavorites?: boolean;
  onlyFav?: boolean;
  onToggleFavorites?: () => void;
  onToggleFav?: () => void;
  favoritesCount: number;
  market: string;
  assetType: string;
  onMarketChange: (v: string) => void;
  onAssetTypeChange: (v: string) => void;
  /** Optional CEDEAR currency filter (only shown when bcba+cedear) */
  cedearCurrency?: CedearCurrency;
  onCedearCurrencyChange?: (v: CedearCurrency) => void;
}

/**
 * Presentational toolbar — Tabs (market + assetType) + CEDEAR currency toggle + search + fav filter.
 * Pure: props-only, no fetching, no debounce logic (parent owns debounce).
 */
export function QuotesToolbar({
  search,
  onSearchChange,
  onlyFavorites,
  onlyFav,
  onToggleFavorites,
  onToggleFav,
  favoritesCount,
  market,
  assetType,
  onMarketChange,
  onAssetTypeChange,
  cedearCurrency,
  onCedearCurrencyChange,
}: QuotesToolbarProps) {
  const isFavActive = onlyFavorites ?? onlyFav ?? false;
  const handleToggleFav = onToggleFavorites ?? onToggleFav ?? (() => {});

  const showCurrency =
    market === "bcba" && assetType === "cedear" && cedearCurrency !== undefined && onCedearCurrencyChange !== undefined;

  return (
    <div className="space-y-4">
      <Tabs value={market} onValueChange={onMarketChange} className="min-w-0 max-w-full overflow-x-hidden">
        <div className="-mx-4 max-w-[100vw] overflow-x-auto overflow-y-hidden px-4 pb-1 sm:mx-0 sm:max-w-full sm:px-0">
          <TabsList className="w-max max-w-none">
            {MARKETS.map((m) => (
              <TabsTrigger key={m.value} value={m.value}>
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Tabs
        value={assetType}
        onValueChange={onAssetTypeChange}
        className="min-w-0 max-w-full overflow-x-hidden"
      >
        <div className="-mx-4 max-w-[100vw] overflow-x-auto overflow-y-hidden px-4 pb-1 sm:mx-0 sm:max-w-full sm:px-0">
          <TabsList className="w-max max-w-none">
            {(ASSET_TYPES[market] ?? []).map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {showCurrency && (
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
                onClick={() => onCedearCurrencyChange!(opt.value)}
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

      <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
        <Button
          variant={isFavActive ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={handleToggleFav}
          aria-pressed={isFavActive}
        >
          <Star className={`h-3.5 w-3.5 ${isFavActive ? "fill-current" : ""}`} />
          Favoritas
          {favoritesCount > 0 && <span className="text-xs opacity-70">({favoritesCount})</span>}
        </Button>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar símbolo — ej: NVDA"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export default QuotesToolbar;
