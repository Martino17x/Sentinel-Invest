import { useNavigate } from "react-router-dom";
import { Clock, ExternalLink, Newspaper } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso ?? "";
  }
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
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Newspaper className="h-6 w-6 text-primary" />
            Noticias
          </h1>
          <p className="text-sm text-muted-foreground">
            Últimas noticias del mercado — feed general
          </p>
        </div>
        <Badge variant="outline" className="w-fit font-mono text-xs">
          {list.length} noticia{list.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <Separator className="motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none" />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isLoading && list.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                  <Skeleton className="hidden h-20 w-28 shrink-0 rounded-md sm:block" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !error && list.length === 0 ? (
        <Alert>
          <AlertDescription>Sin noticias para mostrar.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-reduce:animate-none">
          {list.map((item) => {
            const imageUrl =
              (item as unknown as { image?: string; imageUrl?: string }).image ??
              (item as unknown as { imageUrl?: string }).imageUrl ??
              null;
            return (
              <Card
                key={item.id}
                className="cursor-pointer overflow-hidden transition-colors hover:bg-muted/40"
                onClick={() => navigate(`/news/${encodeURIComponent(item.id)}`)}
              >
                <CardContent className="p-4">
                  <div className="flex gap-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
                        {item.title}
                      </h3>
                      {item.summary && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {item.summary}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-[10px]">
                          {item.source}
                        </Badge>
                        {item.publishedAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span title={formatDate(item.publishedAt)}>{timeAgo(item.publishedAt)}</span>
                          </span>
                        )}
                        {item.symbol && (
                          <span className="font-mono text-[11px]">{item.symbol}</span>
                        )}
                        <span className="ml-auto inline-flex items-center gap-1 text-primary">
                          Ver detalle <ExternalLink className="h-3 w-3" />
                        </span>
                      </div>
                    </div>
                    {imageUrl && (
                      <img
                        src={imageUrl}
                        alt=""
                        className="hidden h-20 w-28 shrink-0 rounded-md object-cover sm:block"
                        loading="lazy"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
