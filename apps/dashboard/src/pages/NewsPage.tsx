import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { newsApi, type NewsItem } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";

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
                  className="group flex cursor-pointer flex-col gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors"
                >
                  {/* Avatar / logo */}
                  <span
                    aria-hidden
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tracking-wide text-muted-foreground ring-1 ring-border/50"
                  >
                    {initialsFromSource(item.source)}
                  </span>

                  {/* Metadata */}
                  {meta && <p className="text-xs leading-none text-muted-foreground">{meta}</p>}

                  {/* Title */}
                  <h3 className="line-clamp-3 text-[15px] font-medium leading-snug text-foreground">
                    {item.title}
                  </h3>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
