import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Clock, Newspaper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

/**
 * NewsWidget — teaser moderno de noticias para HomePage (D.5).
 * - Fetch top 5 via newsApi.getFeed(5)
 * - Compacto: no domina el HomePage (max ~ 380px height)
 * - Degrada silenciosamente si API falla o vacío → retorna null
 * - Cada item → /news/:id con encodeURIComponent
 * - CTA "Ver todas →" → /news
 * - Skeleton mientras carga, hover states, animated enter
 * - Respeta prefers-reduced-motion, rounded cards, accent gradient
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

  const list: NewsItem[] = Array.isArray(items) ? items.slice(0, 5) : [];

  // Degrade gracefully: si error o vacío (y no está cargando) → ocultar
  if (error) return null;
  if (!isLoading && list.length === 0) return null;

  return (
    <Card className="relative overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-reduce:animate-none">
      {/* Accent gradient top bar */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary via-primary/60 to-violet-500/60"
      />

      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/15">
            <Newspaper className="h-4 w-4 text-primary" />
          </span>
          <div>
            <CardTitle className="text-sm font-semibold leading-none">Noticias del mercado</CardTitle>
            <p className="text-xs text-muted-foreground">Lo último — feed general</p>
          </div>
        </div>

        <Button variant="ghost" size="sm" asChild className="h-7 gap-1 text-xs">
          <Link to="/news">
            Ver todas <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>

      <Separator />

      <CardContent className="p-2 sm:p-3">
        {isLoading && list.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex gap-3 rounded-xl border border-transparent p-3"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-3 w-3/5" />
                  <div className="flex items-center gap-2 pt-1">
                    <Skeleton className="h-4 w-14 rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="hidden h-14 w-20 shrink-0 rounded-lg sm:block" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {list.map((item) => {
              const imageUrl =
                (item as unknown as { image?: string; imageUrl?: string }).image ??
                (item as unknown as { imageUrl?: string }).imageUrl ??
                null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/news/${encodeURIComponent(item.id)}`)}
                  className="flex w-full gap-3 rounded-xl border border-transparent p-3 text-left transition-colors hover:border-border/60 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 className="line-clamp-2 text-sm font-medium leading-snug">
                      {item.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Badge variant="secondary" className="text-[10px] leading-none">
                        {item.source}
                      </Badge>
                      {item.publishedAt && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          {timeAgo(item.publishedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt=""
                      className="hidden h-14 w-20 shrink-0 rounded-lg object-cover sm:block"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="hidden h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-muted sm:flex"
                    >
                      <Newspaper className="h-5 w-5 text-muted-foreground/50" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
