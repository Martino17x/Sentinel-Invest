import { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatArs } from "@/lib/format";
import { monthLabel } from "@/lib/art-time";
import type { MonthlyReport, Operation } from "@/lib/api";

interface MonthlyReportOperationsProps {
  report: MonthlyReport;
}

const TYPE_LABELS: Record<string, string> = {
  buy: "Compra",
  sell: "Venta",
  subscription: "Suscripción",
  redemption: "Rescate",
};

export function MonthlyReportOperations({ report }: MonthlyReportOperationsProps) {
  const operations = useMemo(() => {
    const all = [...(report.buys ?? []), ...(report.sells ?? [])];
    return all.sort((a, b) => a.date.localeCompare(b.date));
  }, [report.buys, report.sells]);

  const totalOps = operations.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Movimientos del mes</CardTitle>
        <CardDescription>
          {totalOps === 0
            ? "Sin operaciones registradas en el período"
            : `${totalOps} operaciones — compras ${formatArs(report.totalBuysArs)} / ventas ${formatArs(report.totalSellsArs)}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {totalOps === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="rounded-full bg-muted/60 p-3 mb-3">
              <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Sin operaciones en {monthLabel(report.month)}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              No se registraron compras, ventas ni suscripciones ejecutadas durante este mes.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile / Tablet cards (< 1024px) */}
            <div className="space-y-3 lg:hidden">
              {operations.map((op: Operation) => (
                <div
                  key={op.iolOperationId}
                  className="rounded-xl border bg-card p-4 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                      {new Date(op.date).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                    <Badge variant={op.type === "buy" ? "default" : "secondary"}>
                      {TYPE_LABELS[op.type] ?? op.type}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold">{op.symbol}</span>
                    <span className="text-base font-bold tabular-nums">
                      {formatArs(op.total)}
                    </span>
                  </div>
                  <dl className="space-y-1 pt-1 border-t text-xs">
                    <div className="flex items-center justify-between gap-3 text-muted-foreground">
                      <dt>Cantidad</dt>
                      <dd className="font-medium text-foreground tabular-nums font-mono">
                        {op.quantity.toLocaleString("es-AR")}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-muted-foreground">
                      <dt>Precio unitario</dt>
                      <dd className="font-medium text-foreground tabular-nums font-mono">
                        {formatArs(op.price)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= 1024px) */}
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Fecha</TableHead>
                    <TableHead className="w-[120px]">Operación</TableHead>
                    <TableHead>Símbolo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operations.map((op: Operation) => (
                    <TableRow key={op.iolOperationId}>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {new Date(op.date).toLocaleDateString("es-AR", {
                          day: "2-digit",
                          month: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={op.type === "buy" ? "default" : "secondary"}>
                          {TYPE_LABELS[op.type] ?? op.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{op.symbol}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono">
                        {op.quantity.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                        {formatArs(op.price)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono font-semibold">
                        {formatArs(op.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
