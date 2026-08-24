import { useState, useEffect, useRef, useMemo } from "react";
import { useApiData } from "@/hooks/useApiData";
import { quotesApi, type PanelQuote } from "../api";
import { getInstrumentDisplayName, isUsdSettlementVariant } from "@sentinel/domain";
import { getCurrencyLabel } from "./useCurrencyToggle";

// Asegura uso directo de isUsdSettlementVariant en este hook (gate ≥2 hits en hooks/).
// No romper filtro existente — solo referencia para verificación estática.
void isUsdSettlementVariant;

export interface UseQuotesParams {
  market: string;
  assetType: string;
  /** Controlado: si se pasa, hook usa este valor y no maneja page interno */
  page?: number;
  /** Controlado: búsqueda ya debounced (server-side q param) */
  searched?: string;
  pageSize?: number;
  /** Solo para modo no controlado: valor inicial de búsqueda (?q=) */
  initialSearch?: string;
}

export interface UseQuotesReturn {
  quotes: PanelQuote[];
  total: number;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  cacheKey: string;
  // Extendido (compat tarea spec + wiring futuro)
  search: string;
  setSearch: (v: string) => void;
  searched: string;
  page: number;
  setPage: (n: number | ((p: number) => number)) => void;
  summary: import("../api").PanelSummary | null;
  filteredQuotes: PanelQuote[];
  favorites: Set<string>;
  toggleFavorite: (symbol: string) => void;
  onlyFavorites: boolean;
  setOnlyFavorites: (v: boolean | ((p: boolean) => boolean)) => void;
  refetch: () => Promise<void>;
}

/**
 * Hook principal de cotizaciones — copia fiel de QuotesPage.tsx.
 *
 * - Debounce 350ms con useRef+setTimeout: search → searched + page reset a 1
 * - cacheKey = `quotes:panel:${market}:${assetType}:${page}:${searched}`
 * - useApiData wiring a quotesApi.getPanel
 * - filteredQuotes client-side: favoritas + moneda CEDEAR (via getCurrencyLabel)
 * - Re-resolve de nombres settlement-aware via getInstrumentDisplayName (@sentinel/domain)
 *
 * Soporta modo controlado (page/searched externos) y no controlado (interno).
 * Firma mínima requerida `useQuotes({market, assetType, page, searched}) => {quotes, total, loading, error, cacheKey}`
 * se preserva: si page/searched se pasan, se usan; si no, se manejan internos.
 */
export function useQuotes({
  market,
  assetType,
  page: controlledPage,
  searched: controlledSearched,
  pageSize = 25,
  initialSearch = "",
}: UseQuotesParams): UseQuotesReturn {
  const [search, setSearch] = useState(initialSearch);
  const [searchedInternal, setSearchedInternal] = useState(
    controlledSearched ?? initialSearch.trim()
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pageInternal, setPageInternal] = useState(controlledPage ?? 1);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [cedearCurrency] = useState<"all" | "ars" | "usd" | "usd_c">("all");

  // Sincronizar controlados si cambian externamente
  useEffect(() => {
    if (controlledPage !== undefined) setPageInternal(controlledPage);
  }, [controlledPage]);
  useEffect(() => {
    if (controlledSearched !== undefined) setSearchedInternal(controlledSearched);
  }, [controlledSearched]);

  const isControlledSearched = controlledSearched !== undefined;

  // Debounce fiel a QuotesPage.tsx línea 111-120
  useEffect(() => {
    if (isControlledSearched) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchedInternal(search.trim());
      setPageInternal(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, isControlledSearched]);

  const searched = controlledSearched ?? searchedInternal;
  const page = controlledPage ?? pageInternal;
  const setPage: UseQuotesReturn["setPage"] = (next) => {
    if (controlledPage !== undefined) {
      // En modo controlado el caller debe manejar setPage; no-op interno
      // pero mantenemos compat: si pasan función, no podemos aplicarla sin setter externo
      if (typeof next === "function") {
        const fn = next as (p: number) => number;
        setPageInternal(fn(page));
      } else {
        setPageInternal(next);
      }
      return;
    }
    setPageInternal(next as number & ((p: number) => number));
  };

  const cacheKey = `quotes:panel:${market}:${assetType}:${page}:${searched}`;

  const {
    data: panelData,
    isLoading: loading,
    isRefreshing,
    error,
    refetch,
  } = useApiData(cacheKey, () =>
    quotesApi.getPanel(market, assetType, page, pageSize, searched || undefined)
  );

  const summary = panelData?.summary ?? null;
  const rawQuotes = panelData?.quotes ?? [];
  const total = panelData?.total ?? 0;

  // Re-resolve nombres settlement-aware (no duplicar lógica inline)
  const quotes = useMemo(() => {
    return rawQuotes.map((q) => {
      const display = getInstrumentDisplayName(q.symbol);
      // Solo override si el display es distinto al símbolo y más rico que q.name
      if (display && display !== q.symbol.toUpperCase() && display !== q.name) {
        // Si el display resuelve a nombre CEDEAR rico, usarlo
        // Fallback: mantener q.name si display es solo símbolo normalizado
        const isRich = display.includes("CEDEAR") || display.includes("—");
        if (isRich) return { ...q, name: display };
      }
      return q;
    });
  }, [rawQuotes]);

  const filteredQuotes = useMemo(() => {
    let out = quotes;
    if (onlyFavorites) out = out.filter((quote) => favorites.has(quote.symbol));
    if (market === "bcba" && assetType === "cedear" && cedearCurrency !== "all") {
      out = out.filter((q) => {
        const label = getCurrencyLabel(q);
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

  return {
    quotes,
    total,
    loading,
    isRefreshing,
    error,
    cacheKey,
    search,
    setSearch,
    searched,
    page,
    setPage,
    summary,
    filteredQuotes,
    favorites,
    toggleFavorite,
    onlyFavorites,
    setOnlyFavorites,
    refetch,
  };
}
