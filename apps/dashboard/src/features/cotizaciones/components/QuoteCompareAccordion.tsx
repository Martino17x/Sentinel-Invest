import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuoteCompare } from "../hooks/useQuoteCompare";
import type { Quote } from "../api";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diff / 1000));
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}m`;
  const h = Math.floor(min / 60);
  return `hace ${h}h`;
}

function sourceBadgeClass(source: string): string {
  if (source === "iol") return "bg-sky-100 text-sky-700 border-sky-200";
  if (source === "ppi") return "bg-violet-100 text-violet-700 border-violet-200";
  if (source === "byma") return "bg-amber-100 text-amber-700 border-amber-200";
  if (source === "cache") return "bg-zinc-100 text-zinc-700 border-zinc-200";
  if (source === "snapshot") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-muted text-muted-foreground";
}

export interface QuoteCompareAccordionProps {
  symbol: string;
  isOpen: boolean;
  onToggle?: () => void;
  /** Si se pasa data externa, no hace fetch interno */
  compareData?: ReturnType<typeof useQuoteCompare>["data"];
  loadingExternal?: boolean;
  /** providers a comparar — default iol,ppi,byma */
  providers?: string[];
  market?: string;
  /** Trigger id para a11y */
  triggerId?: string;
}

export function QuoteCompareAccordion({
  symbol,
  isOpen,
  onToggle,
  compareData,
  loadingExternal,
  providers = ["iol", "ppi", "byma"],
  market = "bcba",
  triggerId,
}: QuoteCompareAccordionProps) {
  const reducedMotion = usePrefersReducedMotion();
  const internal = useQuoteCompare(isOpen ? symbol : null, providers, market);
  const data = compareData !== undefined ? compareData : internal.data;
  const loading = loadingExternal !== undefined ? loadingExternal : internal.loading;

  const innerRef = React.useRef<HTMLDivElement>(null);
  const contentId = `compare-${symbol}-content`;

  // primary price para delta% (primer provider con quote)
  const primaryQuote: Quote | null = React.useMemo(() => {
    if (!data?.results) return null;
    for (const p of providers) {
      const r = data.results[p] as { quote?: Quote } | undefined;
      if (r && "quote" in r && (r as { quote: Quote }).quote) return (r as { quote: Quote }).quote;
    }
    return null;
  }, [data, providers]);

  return (
    <div className="w-full">
      {/* grid animation container */}
      <div
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        style={{
          display: "grid",
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          transition: reducedMotion ? "none" : "grid-template-rows 280ms ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div
            ref={innerRef}
            className="pt-3"
            aria-hidden={!isOpen}
          >
            <div className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Comparativa {symbol}</span>
                {data?.fetchedAt && <span className="text-[11px] text-muted-foreground">{formatRelativeTime(data.fetchedAt)}</span>}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {providers.map((provider) => {
                  const entry = data?.results?.[provider] as
                    | { quote: Quote; source: string; fetchedAt: string }
                    | { error: string; code: string }
                    | undefined;

                  const isLoadingCell = loading && !entry;

                  if (isLoadingCell) {
                    return (
                      <div key={provider} className="rounded-md border p-3 space-y-2">
                        <Skeleton className="h-3 w-12" />
                        <Skeleton className="h-5 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    );
                  }

                  if (!entry) {
                    return (
                      <div key={provider} className="rounded-md border border-dashed p-3 text-center">
                        <span className="text-xs text-muted-foreground">Sin datos {provider.toUpperCase()}</span>
                      </div>
                    );
                  }

                  if ("error" in entry) {
                    return (
                      <div key={provider} className="rounded-md border border-destructive/30 p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase">{provider}</span>
                          <span className="rounded border bg-destructive/10 px-1.5 py-0.5 text-[10px] text-destructive">{entry.code ?? "error"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{entry.error}</p>
                      </div>
                    );
                  }

                  const q = entry.quote as Quote;
                  const deltaPct =
                    primaryQuote && q.lastPrice && primaryQuote.lastPrice
                      ? ((q.lastPrice - primaryQuote.lastPrice) / primaryQuote.lastPrice) * 100
                      : null;
                  const isPrimary = primaryQuote?.lastPrice === q.lastPrice && primaryQuote?.source === q.source;

                  return (
                    <div key={provider} className="rounded-md border p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase">{provider}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${sourceBadgeClass(q.source ?? provider)}`}>
                          {q.source ?? provider}
                        </span>
                      </div>
                      <div className="text-sm font-semibold tabular-nums">
                        {q.currency === "USD" ? "US$" : "AR$"} {q.lastPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                      </div>
                      <div className={`text-xs tabular-nums ${q.variationPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {q.variationPct >= 0 ? "▲" : "▼"} {Math.abs(q.variationPct).toFixed(2)}%
                      </div>
                      {deltaPct !== null && !isPrimary ? (
                        <div className={`mt-1 text-[11px] tabular-nums ${deltaPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          Δ {deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(2)}% vs principal
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-muted-foreground">principal</div>
                      )}
                      <div className="mt-1 text-[11px] text-muted-foreground">{q.fetchedAt ? formatRelativeTime(q.fetchedAt) : ""}</div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-2 text-[11px] text-muted-foreground">Comparativa no es arbitraje — precios con delays distintos.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default QuoteCompareAccordion;
