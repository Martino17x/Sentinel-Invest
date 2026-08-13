import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Column<T> {
  /** Clave única */
  key: string;
  /** Título de la columna (desktop) */
  header: string;
  /** Render en desktop */
  render: (item: T) => ReactNode;
  /** Clases para la celda desktop */
  className?: string;
  /** Alineación (afecta al label en mobile) */
  align?: "left" | "right";
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (item: T) => string;
  /** Función opcional al hacer click en una card/fila */
  onRowClick?: (item: T) => void;
  /** Clases extra de la tabla desktop */
  tableClassName?: string;
  /** Render opcional cuando no hay datos (reemplaza el vacío) */
  emptyState?: ReactNode;
}

/**
 * Tabla responsive: desktop → tabla clásica, mobile/tablet (< lg) → cards.
 * Las cards muestran cada columna como par label/valor, evitando el
 * scroll horizontal que es incómodo en pantallas chicas.
 */
export function ResponsiveTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  tableClassName,
  emptyState,
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
        {emptyState ?? "Sin datos"}
      </div>
    );
  }

  const rowClasses = cn(
    onRowClick && "cursor-pointer"
  );

  const cardClasses = cn(
    "rounded-xl border bg-card p-4 shadow-sm",
    onRowClick && "cursor-pointer transition-colors hover:bg-accent/50"
  );

  return (
    <>
      {/* ===== DESKTOP (lg+) ===== */}
      <div className="hidden lg:block">
        <Table className={tableClassName}>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(col.align === "right" && "text-right", col.className)}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow
                key={rowKey(item)}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={rowClasses}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(col.align === "right" && "text-right", col.className)}
                  >
                    {col.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ===== MOBILE / TABLET (< lg) ===== */}
      <div className="space-y-3 lg:hidden">
        {data.map((item) => (
          <div
            key={rowKey(item)}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            className={cardClasses}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {columns.map((col) => (
                <div
                  key={col.key}
                  className={cn(
                    "min-w-0",
                    col.align === "right" && "text-right"
                  )}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {col.header}
                  </p>
                  <div className="truncate">{col.render(item)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
