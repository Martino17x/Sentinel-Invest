import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface QuotesPaginationProps {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  loading?: boolean;
  /** Alignment of controls */
  align?: "start" | "end" | "center";
  /** Compat aliases for generic pagination contract (currentPage/totalPages/onPageChange) */
  currentPage?: number;
  onPageChange?: (p: number) => void;
}

/**
 * Pagination presentational — wrapper of pagination controls.
 * Pure: props-only, no fetching. Renders null when totalPages <= 1.
 */
export function QuotesPagination({
  page,
  totalPages,
  onPrev,
  onNext,
  loading = false,
  align = "end",
  currentPage,
  onPageChange,
}: QuotesPaginationProps) {
  const p = currentPage ?? page;
  const tp = totalPages;

  const handlePrev = onPageChange ? () => onPageChange(Math.max(1, p - 1)) : onPrev;
  const handleNext = onPageChange ? () => onPageChange(Math.min(tp, p + 1)) : onNext;

  if (tp <= 1) return null;

  const justify =
    align === "end" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <div className={`flex items-center gap-1 ${justify}`}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 cursor-pointer px-2"
        onClick={handlePrev}
        disabled={p <= 1 || loading}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-16 text-center text-xs font-medium tabular-nums text-muted-foreground">
        {p} / {tp}
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-8 cursor-pointer px-2"
        onClick={handleNext}
        disabled={p >= tp || loading}
        aria-label="Página siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default QuotesPagination;
