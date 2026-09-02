import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
  /** Habilita ordenamiento al clickear el header (asc → desc → asc) */
  sortable?: boolean;
  /** Valor usado para ordenar (string o number); null/undefined van al final */
  sortValue?: (item: T) => string | number | null | undefined;
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
 * Las columnas con `sortable` ordenan al clickear el header (asc/desc).
 * Sin orden activo se conserva el orden de `data` tal cual viene.
 */
export function ResponsiveTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  tableClassName,
  emptyState,
}: ResponsiveTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "es", { numeric: true }) * dir;
    });
  }, [data, sort, columns]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      return prev.dir === "asc" ? { key, dir: "desc" } : { key, dir: "asc" };
    });
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
        {emptyState ?? "Sin datos"}
      </div>
    );
  }

  const rowClasses = cn(onRowClick && "cursor-pointer");
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
              {columns.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <TableHead
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.className
                    )}
                    aria-sort={
                      active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground",
                          active ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
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
        {sortedData.map((item) => (
          <div
            key={rowKey(item)}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            className={cardClasses}
          >
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {columns.map((col) => (
                <div
                  key={col.key}
                  className={cn("min-w-0", col.align === "right" && "text-right")}
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
