import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MetricTooltip } from "./MetricTooltip";
import { monthLabel } from "@/lib/art-time";

interface MonthlyReportHeaderProps {
  selectedMonth: string | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function MonthlyReportHeader({
  selectedMonth,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: MonthlyReportHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Reporte mensual
          </h1>
          <MetricTooltip text="Cierre contable de cada mes con rendimiento real (TWR), actividad y comparativas de mercado. Se generan con snapshots diarios de tu cartera." />
        </div>
        <p className="text-sm text-muted-foreground">
          Rendimiento real acumulado, comparativa de benchmark y actividad operativa
        </p>
      </div>

      <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border bg-card p-1 shadow-xs">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-36 px-2 text-center text-sm font-medium capitalize select-none">
          {selectedMonth ? monthLabel(selectedMonth) : "—"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
