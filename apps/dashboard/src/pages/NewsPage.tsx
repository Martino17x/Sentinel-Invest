import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { newsApi, type NewsItem } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import CompanyLogo from "@/components/ui/company-logo";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace instantes";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "hace 1 día";
  return `hace ${days} días`;
}

function initialsFromSource(source: string): string {
  const s = source.trim();
  if (!s) return "N";
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return s.slice(0, 2).toUpperCase();
}

export function NewsPage() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useApiData(
    "news:feed:20",
    () => newsApi.getFeed(20),
    { enabled: true },
  );

  const items: NewsItem[] =
    ((data as { items?: NewsItem[]; news?: NewsItem[] } | null)?.items ??
      (data as { news?: NewsItem[] } | null)?.news ??
      []) as NewsItem[];
  const list: NewsItem[] = Array.isArray(items) ? items : [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Header centrado — TradingView style */}
      <header className="py-6 text-center motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none sm:py-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Noticias</h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          No te pierdas ningún movimiento — mantenete al día con lo esencial del mercado.
        </p>
      </header>

      {/* Sección Top stories */}
      <section
        aria-labelledby="top-stories-heading"
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-reduce:animate-none"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2
            id="top-stories-heading"
            className="flex items-center gap-1.5 text-sm font-semibold tracking-tight"
          >
            Historias destacadas
            <span aria-hidden className="text-base font-normal leading-none text-muted-foreground">
              ›
            </span>
          </h2>
          <span className="font-mono text-xs text-muted-foreground">
            {list.length} {list.length === 1 ? "historia" : "historias"}
          </span>
        </div>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading && list.length === 0 ? (
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3 p-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-3 w-28" />
                <div className="space-y-2 pt-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !error && list.length === 0 ? (
          <Alert className="mt-6">
            <AlertDescription>Sin noticias para mostrar.</AlertDescription>
          </Alert>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {list.map((item) => {
              const metaTime = item.publishedAt ? timeAgo(item.publishedAt) : "";
              const meta = [metaTime, item.source].filter(Boolean).join(" · ");
              const imageUrl = (item.imageUrl ?? item.image ?? null) as string | null;
              const hasImage = Boolean(imageUrl?.trim());
              const isDegraded = Boolean(item.degraded) || item.provider === "tradingview";
              const symbolForLogo = item.symbol?.trim() ?? null;
              return (
                <article
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/news/${encodeURIComponent(item.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/news/${encodeURIComponent(item.id)}`);
                    }
                  }}
                  className="group flex cursor-pointer flex-col gap-3 overflow-hidden rounded-xl border border-transparent p-4 text-left transition-colors hover:bg-muted/40 hover:border-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors"
                >
                  {/* Thumb 16:9 — imageUrl with lazy load, fallback handled by initials/logo below */}
                  {hasImage && (
                    <div className="overflow-hidden rounded-lg bg-muted">
                      <img
                        src={imageUrl!}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transform-none"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  )}

                  {/* Logo row: CompanyLogo when symbol available, else initials fallback */}
                  <div className="flex items-center gap-2">
                    {symbolForLogo ? (
                      <CompanyLogo symbol={symbolForLogo} size={32} className="shrink-0" />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tracking-wide text-muted-foreground ring-1 ring-border/50"
                      >
                        {initialsFromSource(item.source)}
                      </span>
                    )}
                    {isDegraded && (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                        Degradado
                      </span>
                    )}
                  </div>

                  {/* Metadata */}
                  {meta && <p className="text-xs leading-none text-muted-foreground">{meta}</p>}

                  {/* Title */}
                  <h3 className="line-clamp-3 text-[15px] font-medium leading-snug text-foreground">
                    {item.title}
                  </h3>

                  {/* Description preview when available (non-degraded) */}
                  {(item.description ?? item.summary) && !isDegraded && (
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {item.description ?? item.summary}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
