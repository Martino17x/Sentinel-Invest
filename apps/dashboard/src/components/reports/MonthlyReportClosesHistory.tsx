import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatArs, formatUsd } from "@/lib/format";
import { monthLabel } from "@/lib/art-time";
import type { MonthClose } from "@/lib/api";

interface MonthlyReportClosesHistoryProps {
  closes: MonthClose[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}

function pctColor(value: number) {
  if (value > 0.01) return "text-emerald-600 dark:text-emerald-400";
  if (value < -0.01) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function pctSign(value: number) {
  return value > 0.01 ? "+" : "";
}

export function MonthlyReportClosesHistory({
  closes,
  selectedMonth,
  onSelectMonth,
}: MonthlyReportClosesHistoryProps) {
  const closesSorted = [...closes].sort((a, b) => a.month.localeCompare(b.month));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Historial de cierres</CardTitle>
        <CardDescription>
          Comparativa mensual de valor de cartera, rendimiento real (TWR) y flujo de fondos
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Mobile / Tablet cards (< 1024px) */}
        <div className="space-y-3 lg:hidden">
          {closesSorted.map((close) => {
            const isSelected = close.month === selectedMonth;
            return (
              <div
                key={close.month}
                onClick={() => onSelectMonth(close.month)}
                className={`cursor-pointer rounded-xl border p-4 shadow-xs transition-colors ${
                  isSelected
                    ? "border-primary/50 bg-accent/40 ring-1 ring-primary/20"
                    : "bg-card hover:bg-accent/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold capitalize">
                    {monthLabel(close.month)}
                  </p>
                  <p className={`text-sm font-bold tabular-nums ${pctColor(close.twrPct)}`}>
                    {pctSign(close.twrPct)}{close.twrPct.toFixed(2)}% TWR
                  </p>
                </div>
                <div className="mt-2.5 rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Valor al cierre
                  </p>
                  <p className="text-base font-bold tabular-nums">
                    {formatArs(close.closingValueArs)}
                  </p>
                </div>
                <dl className="mt-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between gap-3 text-muted-foreground">
                    <dt>Ganancia bruta</dt>
                    <dd className={`font-medium tabular-nums ${pctColor(close.grossChangeArs)}`}>
                      {pctSign(close.grossChangeArs)}{formatArs(close.grossChangeArs)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-muted-foreground">
                    <dt>Cierre USD</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {close.closingValueUsd > 0 ? formatUsd(close.closingValueUsd) : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-muted-foreground">
                    <dt>Aportes netos</dt>
                    <dd className="font-medium text-foreground tabular-nums">
                      {close.netContributionsArs === 0
                        ? "—"
                        : `${pctSign(close.netContributionsArs)}${formatArs(close.netContributionsArs)}`}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>

        {/* Desktop Table (>= 1024px) */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Cierre ARS</TableHead>
                <TableHead className="text-right">Cierre USD</TableHead>
                <TableHead className="text-right">Ganancia bruta</TableHead>
                <TableHead className="text-right">Rendimiento (TWR)</TableHead>
                <TableHead className="text-right">Aportes netos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closesSorted.map((close) => {
                const isSelected = close.month === selectedMonth;
                return (
                  <TableRow
                    key={close.month}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? "bg-accent/40 font-medium" : "hover:bg-muted/40"
                    }`}
                    onClick={() => onSelectMonth(close.month)}
                  >
                    <TableCell className="capitalize">
                      {monthLabel(close.month)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono">
                      {formatArs(close.closingValueArs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                      {close.closingValueUsd > 0 ? formatUsd(close.closingValueUsd) : "—"}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-mono ${pctColor(close.grossChangeArs)}`}>
                      {pctSign(close.grossChangeArs)}{formatArs(close.grossChangeArs)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-mono font-semibold ${pctColor(close.twrPct)}`}>
                      {pctSign(close.twrPct)}{close.twrPct.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                      {close.netContributionsArs === 0
                        ? "—"
                        : `${pctSign(close.netContributionsArs)}${formatArs(close.netContributionsArs)}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
