import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { calendarApi, type CalendarDay } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { artTodayMonthKey, dayLabel, monthLabel, shiftMonthKey } from "@/lib/art-time";
import { DayDetailDialog } from "./DayDetailDialog";

// ============================================================
// CALENDAR VIEW — grid mensual del valor de cartera (F2-R1/R3/R4).
// TODOS los días del mes se ven; los que no tienen snapshot quedan
// en estado vacío/muted (nunca inventar datos — F2-R3) pero siguen
// siendo clickeables → DayDetailDialog con estado vacío explícito.
// Tooltip por día con total, Δ%, cash ARS/USD y source (contrato
// /calendar/:month). Animaciones enter con stagger vía
// tw-animate-css; prefers-reduced-motion se respeta con el guard
// global de index.css + motion-reduce:animate-none por celda.
// ============================================================

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const formatterUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const formatterCompactARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  notation: "compact",
  maximumFractionDigits: 1,
});

function pctColor(value: number | null | undefined) {
  if (value == null) return "text-muted-foreground";
  return value > 0.01 ? "text-emerald-600" : value < -0.01 ? "text-red-600" : "text-muted-foreground";
}

function pctSign(value: number | null | undefined) {
  if (value == null) return "";
  return value > 0.01 ? "+" : "";
}

interface DayCellProps {
  day: CalendarDay;
  index: number;
  onSelect: (day: CalendarDay) => void;
}

function DayCell({ day, index, onSelect }: DayCellProps) {
  const hasData = day.totalValue != null;
  const dayNumber = Number(day.date.slice(8));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onSelect(day)}
          aria-label={
            hasData
              ? `${dayLabel(day.date)}: ${formatterARS.format(day.totalValue!)}`
              : `${dayLabel(day.date)}: sin datos`
          }
          className={cn(
            "relative flex min-h-14 flex-col items-start gap-0.5 rounded-lg border p-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none",
            hasData
              ? "cursor-pointer border-border bg-card shadow-sm hover:bg-accent/60"
              : "cursor-pointer border-dashed border-muted-foreground/25 bg-muted/30 hover:bg-muted/60"
          )}
          style={{ animationDelay: `${Math.min(index * 14, 400)}ms` }}
        >
          <span
            className={cn(
              "text-[11px] font-semibold tabular-nums",
              hasData ? "text-foreground" : "text-muted-foreground/60"
            )}
          >
            {dayNumber}
          </span>

          {hasData ? (
            <>
              <span className="w-full truncate text-[11px] font-bold tabular-nums text-foreground">
                {formatterCompactARS.format(day.totalValue!)}
              </span>
              {day.dayChangePct != null && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-[10px] font-semibold tabular-nums",
                    pctColor(day.dayChangePct)
                  )}
                >
                  <span aria-hidden className="text-[8px]">
                    {day.dayChangePct > 0.01 ? "▲" : day.dayChangePct < -0.01 ? "▼" : "•"}
                  </span>
                  {pctSign(day.dayChangePct)}
                  {day.dayChangePct.toFixed(2)}%
                </span>
              )}
              {day.movementCount > 0 && (
                <span
                  className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
                  title={`${day.movementCount} movimiento${day.movementCount === 1 ? "" : "s"} de dinero`}
                >
                  {day.movementCount}
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground/40">sin datos</span>
          )}
        </button>
      </TooltipTrigger>

      {hasData && (
        <TooltipContent sideOffset={8} className="max-w-60">
          <div className="space-y-1 text-xs">
            <p className="font-semibold">{dayLabel(day.date)}</p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold tabular-nums">{formatterARS.format(day.totalValue!)}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Δ día</span>
              <span className={cn("font-semibold tabular-nums", pctColor(day.dayChangePct))}>
                {pctSign(day.dayChangePct)}
                {day.dayChangePct?.toFixed(2)}%
              </span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Cash ARS</span>
              <span className="font-medium tabular-nums">{formatterARS.format(day.cashArs ?? 0)}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Cash USD</span>
              <span className="font-medium tabular-nums">{formatterUSD.format(day.cashUsd ?? 0)}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Origen</span>
              <span className="font-medium capitalize">{day.source}</span>
            </p>
            {day.movementCount > 0 && (
              <p className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Movimientos</span>
                <span className="font-medium">{day.movementCount}</span>
              </p>
            )}
          </div>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

export function CalendarView() {
  const [month, setMonth] = useState(() => artTodayMonthKey());
  const [selectedDay, setSelectedDay] = useState<CalendarDay | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const {
    data,
    isLoading: loading,
    error,
  } = useApiData(`calendar:${month}`, () => calendarApi.getMonth(month));

  // Celdas en blanco iniciales: semanas L→D (convención es-AR)
  const leadingBlanks = useMemo(() => {
    if (!data) return 0;
    const [year, mon] = data.month.split("-").map(Number);
    return (new Date(year, mon - 1, 1).getDay() + 6) % 7;
  }, [data]);

  const capturedCount = useMemo(
    () => data?.days.filter((d) => d.totalValue != null).length ?? 0,
    [data]
  );

  function openDay(day: CalendarDay) {
    setSelectedDay(day);
    setDialogOpen(true);
  }

  function handlePrevMonth() {
    setMonth((m) => shiftMonthKey(m, -1));
  }

  function handleNextMonth() {
    setMonth((m) => shiftMonthKey(m, 1));
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* Header con navegación de mes y resumen */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 cursor-pointer"
              onClick={handlePrevMonth}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold capitalize">
              {monthLabel(month)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 cursor-pointer"
              onClick={handleNextMonth}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {capturedCount} {capturedCount === 1 ? "día registrado" : "días registrados"} en el mes
          </p>
        </div>

        {/* Resumen del mes (3 metric cards compactas) */}
        {data && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
              <span className="text-xs text-muted-foreground">Rendimiento mensual</span>
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  pctColor(data.monthReturn)
                )}
              >
                {data.monthReturn != null ? (
                  <>
                    {pctSign(data.monthReturn)}
                    {data.monthReturn.toFixed(2)}%
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
              <span className="text-xs text-muted-foreground">Mejor día</span>
              <span className="text-sm font-bold text-emerald-600 tabular-nums">
                {data.bestDay ? (
                  <>
                    +{data.bestDay.pct.toFixed(2)}%{" "}
                    <span className="font-medium text-muted-foreground">
                      {data.bestDay.date.slice(8)}/{data.bestDay.date.slice(5, 7)}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
              <span className="text-xs text-muted-foreground">Peor día</span>
              <span className="text-sm font-bold text-red-600 tabular-nums">
                {data.worstDay ? (
                  <>
                    {data.worstDay.pct.toFixed(2)}%{" "}
                    <span className="font-medium text-muted-foreground">
                      {data.worstDay.date.slice(8)}/{data.worstDay.date.slice(5, 7)}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
          </div>
        )}

        {/* Grid mensual */}
        {error && !data ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : loading || !data ? (
          <div className="rounded-xl border p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {w}
                </div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-background p-3 sm:p-4">
            {/* key={month}: re-monta el grid al cambiar de mes → la animación
                de entrada (fade + stagger por celda) corre de nuevo */}
            <div key={month} className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    {w}
                  </div>
                ))}
                {Array.from({ length: leadingBlanks }).map((_, i) => (
                  <div key={`blank-${i}`} aria-hidden />
                ))}
                {data.days.map((day, i) => (
                  <DayCell key={day.date} day={day} index={i} onSelect={openDay} />
                ))}
              </div>
            </div>

            {capturedCount === 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Sin snapshots en {monthLabel(month)} — se generan cada día hábil a las 17:30
                (hora Argentina).
              </p>
            )}
          </div>
        )}

        <DayDetailDialog day={selectedDay} open={dialogOpen} onOpenChange={setDialogOpen} />
      </div>
    </TooltipProvider>
  );
}