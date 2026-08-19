import { useEffect, useState } from "react";
import { CalendarDays, Coins, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  operationsApi,
  seriesApi,
  type CalendarDay,
  type Operation,
  type SeriesDay,
  type SeriesPositionPoint,
} from "@/lib/api";
import { artDateKeyFromUtc, dayLabel } from "@/lib/art-time";

// ============================================================
// DAY DETAIL DIALOG — detalle de un día del calendario (F2-R2/R3).
// Mobile → Drawer (bottom sheet); desktop → Dialog. Contenido:
// snapshot (total, Δ%, cash), composición (snapshot_positions vía
// /series?includePositions), operaciones del día (/operations
// filtrado por fecha ART) y movimientos de dinero (count del día;
// el listado llega con el cash ledger — F3-5).
// Día sin snapshot → estado vacío explícito (nunca inventar datos).
// Las animaciones enter/exit son las nativas de Dialog/Drawer
// (tw-animate-css) y respetan prefers-reduced-motion vía el guard
// global de index.css.
// ============================================================

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

const TYPE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venta",
  subscription: "Suscripción",
  redemption: "Rescate",
};

function pctColor(value: number | null | undefined) {
  if (value == null) return "text-muted-foreground";
  return value > 0.01 ? "text-emerald-600" : value < -0.01 ? "text-red-600" : "text-muted-foreground";
}

function pctSign(value: number | null | undefined) {
  if (value == null) return "";
  return value > 0.01 ? "+" : "";
}

function useIsDesktop(query = "(min-width: 640px)"): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

interface DayDetailDialogProps {
  day: CalendarDay | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DayDetailDialog({ day, open, onOpenChange }: DayDetailDialogProps) {
  const isDesktop = useIsDesktop();
  const [snapshot, setSnapshot] = useState<SeriesDay | null>(null);
  const [positions, setPositions] = useState<SeriesPositionPoint[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = day?.date ?? null;

  useEffect(() => {
    if (!open || !date) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [seriesRes, opsRes] = await Promise.all([
          seriesApi.get(date, date, true),
          operationsApi.getAll(),
        ]);
        if (cancelled) return;
        setSnapshot(seriesRes.days[0] ?? null);
        setPositions(seriesRes.positions ?? []);
        setOperations(
          opsRes.operations.filter((op) => artDateKeyFromUtc(new Date(op.date)) === date)
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el detalle del día");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, date]);

  const hasSnapshot = day?.totalValue != null;
  const opsSorted = [...operations].sort((a, b) => b.date.localeCompare(a.date));

  const Shell = isDesktop ? Dialog : Drawer;
  const ShellContent = isDesktop ? DialogContent : DrawerContent;
  const ShellHeader = isDesktop ? DialogHeader : DrawerHeader;
  const ShellTitle = isDesktop ? DialogTitle : DrawerTitle;
  const ShellDescription = isDesktop ? DialogDescription : DrawerDescription;

  return (
    <Shell open={open} onOpenChange={onOpenChange}>
      <ShellContent
        className="max-h-[88dvh] overflow-y-auto sm:max-w-lg"
        showCloseButton={isDesktop}
      >
        <ShellHeader>
          <ShellTitle>Detalle del día</ShellTitle>
          <ShellDescription>
            {date ? dayLabel(date) : ""}
            {day?.source && (
              <Badge
                variant={day.source === "real" ? "default" : "secondary"}
                className="ml-2"
              >
                {day.source === "real" ? "Real" : "Reconstruido"}
              </Badge>
            )}
          </ShellDescription>
        </ShellHeader>

        <div className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : loading && !snapshot && !hasSnapshot ? (
            <div className="space-y-3">
              <Skeleton className="h-20" />
              <Skeleton className="h-32" />
            </div>
          ) : (
            <>
              {/* Snapshot del día — o estado vacío explícito */}
              {hasSnapshot ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Valor total</p>
                    <p className="text-lg font-bold tabular-nums">
                      {formatterARS.format(snapshot?.totalValue ?? day!.totalValue!)}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-3">
                    <p className="text-xs text-muted-foreground">Variación del día</p>
                    <p className={`text-lg font-bold tabular-nums ${pctColor(snapshot?.dayChangePct ?? day!.dayChangePct)}`}>
                      {pctSign(snapshot?.dayChangePct ?? day!.dayChangePct)}
                      {(snapshot?.dayChangePct ?? day!.dayChangePct ?? 0).toFixed(2)}%
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-3">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Wallet className="h-3 w-3" /> Cash ARS
                    </p>
                    <p className="text-base font-semibold tabular-nums">
                      {snapshot != null
                        ? formatterARS.format(snapshot.cashArs)
                        : formatterARS.format(day!.cashArs ?? 0)}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-card p-3">
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Coins className="h-3 w-3" /> Cash USD
                    </p>
                    <p className="text-base font-semibold tabular-nums">
                      {snapshot != null
                        ? formatterUSD.format(snapshot.cashUsd)
                        : formatterUSD.format(day!.cashUsd ?? 0)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in-0 rounded-xl border border-dashed bg-muted/40 p-6 text-center">
                  <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">Sin snapshot este día</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                    Este día no se capturó el valor de la cartera — no inventamos datos. Los
                    snapshots se generan cada día hábil a las 17:30 (hora Argentina).
                  </p>
                </div>
              )}

              {/* Composición — snapshot_positions */}
              {loading && !snapshot ? (
                <Skeleton className="h-24" />
              ) : positions.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Composición</h3>
                  <div className="hidden overflow-hidden rounded-lg border sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Símbolo</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Último precio</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positions.map((p) => (
                          <TableRow key={`${p.symbol}-${p.market}`}>
                            <TableCell className="font-medium">{p.symbol}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.quantity.toLocaleString("es-AR")}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {p.lastPrice != null ? formatterARS.format(p.lastPrice) : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {formatterARS.format(p.totalValue)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="space-y-2 sm:hidden">
                    {positions.map((p) => (
                      <div
                        key={`${p.symbol}-${p.market}`}
                        className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold">{p.symbol}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {p.quantity.toLocaleString("es-AR")} ×{" "}
                            {p.lastPrice != null ? formatterARS.format(p.lastPrice) : "—"}
                          </p>
                        </div>
                        <p className="text-sm font-bold tabular-nums">
                          {formatterARS.format(p.totalValue)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : hasSnapshot ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Cartera sin posiciones abiertas este día
                </p>
              ) : null}

              {/* Operaciones del día */}
              {loading && !snapshot ? (
                <Skeleton className="h-24" />
              ) : (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Operaciones ({opsSorted.length})
                  </h3>
                  {opsSorted.length === 0 ? (
                    <p className="rounded-lg border border-dashed bg-muted/40 py-4 text-center text-xs text-muted-foreground">
                      Sin operaciones este día
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {opsSorted.map((op) => (
                        <div
                          key={op.iolOperationId}
                          className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold">
                              {op.symbol}
                              <Badge variant={op.type === "buy" ? "default" : "secondary"}>
                                {TYPE_LABELS[op.type] ?? op.type}
                              </Badge>
                            </p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {op.quantity.toLocaleString("es-AR")} ×{" "}
                              {formatterARS.format(op.price)}
                            </p>
                          </div>
                          <p
                            className={`shrink-0 text-sm font-bold tabular-nums ${
                              op.type === "sell" ? "text-emerald-600" : ""
                            }`}
                          >
                            {op.type === "sell" ? "+" : "−"}
                            {formatterARS.format(op.total)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Movimientos de dinero — count del día (listado llega con F3-5) */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Movimientos de dinero</h3>
                {day && day.movementCount > 0 ? (
                  <p className="rounded-lg border bg-card px-3 py-3 text-sm">
                    {day.movementCount} movimiento{day.movementCount === 1 ? "" : "s"} de dinero
                    registrado{day.movementCount === 1 ? "" : "s"} este día.
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      El detalle del libro mayor llega con el registro de movimientos.
                    </span>
                  </p>
                ) : (
                  <p className="rounded-lg border border-dashed bg-muted/40 py-4 text-center text-xs text-muted-foreground">
                    Sin movimientos de dinero este día
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </ShellContent>
    </Shell>
  );
}