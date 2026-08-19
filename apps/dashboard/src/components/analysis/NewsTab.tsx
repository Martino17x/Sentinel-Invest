import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { InsightBlock, NewsData } from "@/lib/api";

interface Props {
  block: InsightBlock<NewsData> | null | undefined;
  isLoading?: boolean;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export function NewsTab({ block, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!block || block.status === "error" || !block.data) {
    return (
      <Alert>
        <AlertDescription>
          Noticias no disponibles{block?.error ? ` — ${block.error}` : ""}.
        </AlertDescription>
      </Alert>
    );
  }

  const items = block.data.items ?? [];

  if (items.length === 0) {
    return (
      <Alert>
        <AlertDescription>Sin noticias recientes.</AlertDescription>
      </Alert>
    );
  }

  return (
    <ul className="divide-y rounded-lg border motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-1 p-3 hover:bg-muted/50">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium leading-snug hover:underline"
          >
            {item.title}
          </a>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{item.source}</span>
            {item.publishedAt && <span>· {timeAgo(item.publishedAt)}</span>}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs underline-offset-4 hover:underline"
            >
              Ver original
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
