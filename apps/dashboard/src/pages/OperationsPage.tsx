import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { operationsApi, ordersApi, type Operation } from "@/lib/api";
import { useApiData, invalidateApiCache } from "@/hooks/useApiData";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MovementsPanel } from "@/components/movements/MovementsPanel";

const formatterARS = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const formatterUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatMoney(value: number, currency: string) {
  return currency === "USD" ? formatterUSD.format(value) : formatterARS.format(value);
}

const TYPE_LABELS: Record<Operation["type"], string> = {
  buy: "Compra",
  sell: "Venta",
  subscription: "Suscripción",
  redemption: "Rescate",
};

const STATUS_LABELS: Record<Operation["status"], string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

export function OperationsPage() {
  const navigate = useNavigate();
  const [cancelTarget, setCancelTarget] = useState<Operation | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const {
    data: opsData,
    isLoading: loading,
    error,
    refetch,
  } = useApiData("operations:all", () => operationsApi.getAll());

  const operations = opsData?.operations ?? [];

  async function handleCancel(op: Operation) {
    setCancelling(true);
    setCancelError(null);
    try {
      await ordersApi.cancelOrder(op.iolOperationId);
      setCancelTarget(null);
      invalidateApiCache("operations");
      invalidateApiCache("portfolio");
      await refetch();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "No se pudo cancelar la operación");
    } finally {
      setCancelling(false);
    }
  }

  if (loading && operations.length === 0) {
    return (
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error && operations.length === 0) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Ordenar por fecha descendente
  const sorted = [...operations].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Actividad</h1>
          <p className="text-sm text-muted-foreground">
            Tus operaciones y movimientos de efectivo en IOL
          </p>
        </div>
        <Button className="cursor-pointer" onClick={() => navigate("/operar")}>
          Nueva operación
        </Button>
      </div>

      <Tabs defaultValue="operaciones" className="space-y-6">
        <TabsList>
          <TabsTrigger value="operaciones">Operaciones</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>
        <TabsContent value="operaciones">
      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>{sorted.length} operaciones registradas</CardDescription>
        </CardHeader>
        <CardContent>
          {/* ===== MOBILE / TABLET: cards con jerarquía ===== */}
          <div className="space-y-3 lg:hidden">
            {sorted.map((op) => (
              <div key={op.iolOperationId} className="rounded-xl border bg-card p-4 shadow-sm">
                {/* Nivel 1: fecha + estado */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">
                    {new Date(op.date).toLocaleDateString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                  <Badge
                    variant={
                      op.status === "accepted"
                        ? "default"
                        : op.status === "pending"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {STATUS_LABELS[op.status]}
                  </Badge>
                </div>

                {/* Nivel 2: símbolo + operación */}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-semibold">{op.symbol}</span>
                  <Badge variant={op.type === "buy" ? "default" : "secondary"}>
                    {TYPE_LABELS[op.type]}
                  </Badge>
                </div>

                {/* Nivel 3: total (HERO) */}
                <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Total
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatMoney(op.total, op.currency)}
                  </p>
                </div>

                {/* Nivel 4: detalles en filas label/valor */}
                <dl className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Cantidad</dt>
                    <dd className="text-sm font-medium tabular-nums">
                      {op.quantity.toLocaleString("es-AR")}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Precio</dt>
                    <dd className="text-sm font-medium tabular-nums">
                      {formatMoney(op.price, op.currency)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Comisión</dt>
                    <dd className="text-sm font-medium tabular-nums">
                      {formatMoney(op.commission, op.currency)}
                    </dd>
                  </div>
                </dl>
                {op.status === "pending" &&
                  (cancelTarget?.iolOperationId === op.iolOperationId ? (
                    <div className="mt-3 space-y-2">
                      {cancelError && <p className="text-xs text-destructive">{cancelError}</p>}
                      <p className="text-xs text-muted-foreground">¿Cancelar la operación {op.iolOperationId}?</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setCancelTarget(null)}>No</Button>
                        <Button variant="destructive" size="sm" className="cursor-pointer" disabled={cancelling} onClick={() => handleCancel(op)}>
                          {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                          {cancelling ? "Cancelando…" : "Sí"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="mt-3 w-full cursor-pointer text-destructive" onClick={() => setCancelTarget(op)}>
                      Cancelar
                    </Button>
                  ))}
              </div>
            ))}
          </div>

          {/* ===== DESKTOP: tabla completa ===== */}
          <div className="hidden lg:block">
            <ResponsiveTable
              columns={[
                {
                  key: "fecha",
                  header: "Fecha",
                  render: (op) => (
                    <span className="whitespace-nowrap tabular-nums">
                      {new Date(op.date).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  ),
                },
                {
                  key: "tipo",
                  header: "Operación",
                  render: (op) => (
                    <Badge variant={op.type === "buy" ? "default" : "secondary"}>
                      {TYPE_LABELS[op.type]}
                    </Badge>
                  ),
                },
                {
                  key: "simbolo",
                  header: "Símbolo",
                  render: (op) => <span className="font-medium">{op.symbol}</span>,
                },
                {
                  key: "cantidad",
                  header: "Cantidad",
                  align: "right",
                  render: (op) => (
                    <span className="tabular-nums">{op.quantity.toLocaleString("es-AR")}</span>
                  ),
                },
                {
                  key: "precio",
                  header: "Precio",
                  align: "right",
                  render: (op) => <span className="tabular-nums">{formatMoney(op.price, op.currency)}</span>,
                },
                {
                  key: "total",
                  header: "Total",
                  align: "right",
                  render: (op) => (
                    <span className="tabular-nums font-medium">{formatMoney(op.total, op.currency)}</span>
                  ),
                },
                {
                  key: "comision",
                  header: "Comisión",
                  align: "right",
                  render: (op) => (
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(op.commission, op.currency)}
                    </span>
                  ),
                },
                {
                  key: "estado",
                  header: "Estado",
                  render: (op) => (
                    <Badge
                      variant={
                        op.status === "accepted"
                          ? "default"
                          : op.status === "pending"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {STATUS_LABELS[op.status]}
                    </Badge>
                  ),
                },
                {
                  key: "acciones",
                  header: "",
                  align: "right" as const,
                  render: (op) =>
                    op.status === "pending" ? (
                      cancelTarget?.iolOperationId === op.iolOperationId ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="xs" className="cursor-pointer" onClick={() => setCancelTarget(null)}>No</Button>
                          <Button variant="destructive" size="xs" className="cursor-pointer" disabled={cancelling} onClick={() => handleCancel(op)}>
                            {cancelling ? "…" : "Sí"}
                          </Button>
                        </div>
                      ) : (
                        <Button variant="outline" size="xs" className="cursor-pointer text-destructive" onClick={() => setCancelTarget(op)}>
                          Cancelar
                        </Button>
                      )
                    ) : null,
                },
              ]}
              data={sorted}
              rowKey={(op) => op.iolOperationId}
            />
          </div>
          </CardContent>
        </Card>
        </TabsContent>
        <TabsContent value="movimientos">
          <MovementsPanel />
        </TabsContent>
      </Tabs>

    </div>
  );
}
