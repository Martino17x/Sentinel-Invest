import { Skeleton } from "@/components/ui/skeleton";

export function MonthlyReportSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero row skeleton - 4 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>

      {/* Secondary row skeleton - 4 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      {/* Chart skeleton */}
      <Skeleton className="h-[360px] rounded-xl" />

      {/* Daily stats skeleton - 3 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      {/* Operations table skeleton */}
      <Skeleton className="h-64 rounded-xl" />

      {/* Closes history skeleton */}
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
