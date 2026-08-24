import { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Clock, ExternalLink, ArrowLeft, Newspaper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "long",
      timeStyle: "short",
    });
  } catch {
    return iso ?? "";
  }
}

function extractIdFromParams(
  params: Record<string, string | undefined>,
  pathname: string,
): string {
  // Prefer :newsId, then splat "*"
  let raw = params.newsId ?? (params as Record<string, string | undefined>)["*"] ?? params.splat;
  if (raw) {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  // Fallback: slice pathname after /news/
  const idx = pathname.indexOf("/news/");
  if (idx !== -1) {
    const enc = pathname.slice(idx + "/news/".length).split("?")[0].split("#")[0];
    if (enc) {
      try {
        return decodeURIComponent(enc);
      } catch {
        return enc;
      }
    }
  }
  return "";
}

export function NewsDetailPage() {
  const params = useParams();
  const { pathname } = useLocation();

  const newsId = useMemo(
    () => extractIdFromParams(params as Record<string, string | undefined>, pathname),
    [params, pathname],
  );

  const cacheKey = newsId ? `news:detail:${newsId}` : null;

  const { data, isLoading, error } = useApiData(
    cacheKey,
    () => newsApi.getDetail(newsId),
    { enabled: !!newsId },
  );

  const item: NewsItem | null =
    ((data as { news?: NewsItem; item?: NewsItem } | null)?.news ??
      (data as { item?: NewsItem } | null)?.item ??
      null) as NewsItem | null;

  // Detect 404 — ApiError.status 404 or message contains "no encontrada"
  const is404 =
    (error && /404|no encontrada/i.test(error)) ||
    (error && error.toLowerCase().includes("not found"));

  if (!newsId) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertTitle>Noticia no encontrada</AlertTitle>
          <AlertDescription>ID de noticia faltante.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/news">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a noticias
          </Link>
        </Button>
      </div>
    );
  }

  if (isLoading && !item) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardHeader className="space-y-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-40 w-full rounded-md" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if ((error && is404) || (!isLoading && !item && !error)) {
    // Honest 404 — backend returned symbol_not_found
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Alert>
          <Newspaper className="h-4 w-4" />
          <AlertTitle>Noticia no encontrada</AlertTitle>
          <AlertDescription>
            No se encontró la noticia solicitada. Puede haber sido removida o el ID es incorrecto.
            {newsId && (
              <span className="mt-1 block font-mono text-xs break-all text-muted-foreground">
                ID: {newsId}
              </span>
            )}
          </AlertDescription>
        </Alert>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/news">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver a noticias
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/inicio">Ir al inicio</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (error && !item) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertTitle>Error al cargar la noticia</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/news">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a noticias
          </Link>
        </Button>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Alert>
          <AlertDescription>Sin datos de noticia.</AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link to="/news">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver a noticias
          </Link>
        </Button>
      </div>
    );
  }

  const imageUrl =
    (item.imageUrl ?? item.image ?? null) as string | null;
  const hasImage = Boolean(imageUrl?.trim());
  const description = (item.description ?? item.summary ?? null) as string | null;
  const content = (item.content ?? null) as string | null;
  const hasBody = Boolean((content ?? description)?.trim());
  const isDegraded = Boolean(item.degraded) || item.provider === "tradingview";
  const symbolForLogo = item.symbol?.trim() ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/news">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a noticias
        </Link>
      </Button>

      <Card className="overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-reduce:animate-none">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {symbolForLogo && <CompanyLogo symbol={symbolForLogo} size={32} className="shrink-0" />}
            <span className="font-medium text-foreground">Fuente: {item.source}</span>
            {item.publishedAt && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span title={formatDate(item.publishedAt)}>{timeAgo(item.publishedAt)}</span>
              </span>
            )}
            {item.symbol && (
              <span className="font-mono text-xs font-medium text-foreground">{item.symbol}</span>
            )}
            {isDegraded && (
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                Degradado
              </span>
            )}
            {item.provider && (
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                {item.provider}
              </span>
            )}
          </div>
          <CardTitle className="text-xl leading-tight sm:text-2xl">{item.title}</CardTitle>
          {item.publishedAt && (
            <p className="text-xs text-muted-foreground">{formatDate(item.publishedAt)}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {hasImage ? (
            <img
              src={imageUrl!}
              alt=""
              className="aspect-[16/9] w-full rounded-lg object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              aria-label="Imagen no disponible"
              className="flex aspect-[16/9] w-full items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 via-primary/8 to-muted ring-1 ring-border/40"
            >
              <Newspaper className="h-10 w-10 text-muted-foreground/60" />
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Resumen</h3>
            {isDegraded || !hasBody ? (
              <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Newspaper className="h-4 w-4 text-muted-foreground/70" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">Resumen no disponible</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Esta noticia está en modo degradado (solo título). Abrí la fuente original para el contenido completo.
                    </p>
                  </div>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ver original <span aria-hidden>→</span>
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {description && (
                  <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                )}
                {content && content !== description && (
                  <p className="text-sm leading-relaxed text-foreground/90">{content}</p>
                )}
              </div>
            )}
            {/* D.7 no-body rule: NEVER invent body if not available — only render description/content when present, else degraded CTA */}
          </div>

          <Separator />

          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver original <ExternalLink className="h-4 w-4" />
          </a>
          <p className="text-xs break-all text-muted-foreground">{item.url}</p>
        </CardContent>
      </Card>
    </div>
  );
}
