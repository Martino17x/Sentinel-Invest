import { useNavigate, Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
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

/**
 * NewsWidget — versión compacta TradingView para Home.
 * Mismo lenguaje visual que NewsPage: avatar + metadata + título,
 * grilla 3 columnas, mucho whitespace, sin badges ni gradientes.
 */
export function NewsWidget() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useApiData(
    "news:feed:5",
    () => newsApi.getFeed(5),
    { enabled: true },
  );

  const items: NewsItem[] =
    ((data as { items?: NewsItem[]; news?: NewsItem[] } | null)?.items ??
      (data as { news?: NewsItem[] } | null)?.news ??
      []) as NewsItem[];

  const list: NewsItem[] = Array.isArray(items) ? items.slice(0, 3) : [];

  if (error) return null;
  if (!isLoading && list.length === 0) return null;

  return (
    <section
      aria-labelledby="news-widget-heading"
      className="space-y-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
        <h2
          id="news-widget-heading"
          className="flex items-center gap-1.5 text-sm font-semibold tracking-tight"
        >
          Historias destacadas
          <span aria-hidden className="text-base font-normal leading-none text-muted-foreground">
            ›
          </span>
        </h2>
        <Link
          to="/news"
          className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver todas →
        </Link>
      </div>

      {isLoading && list.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 p-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-3 w-24" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-3 md:gap-6">
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
                className="group flex cursor-pointer flex-col gap-2.5 rounded-xl p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-safe:transition-colors md:p-4"
              >
                <span
                  aria-hidden
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tracking-wide text-muted-foreground ring-1 ring-border/50"
                >
                  {initialsFromSource(item.source)}
                </span>
                {meta && <p className="text-xs leading-none text-muted-foreground">{meta}</p>}
                <h3 className="line-clamp-3 text-sm font-medium leading-snug text-foreground">
                  {item.title}
                </h3>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
