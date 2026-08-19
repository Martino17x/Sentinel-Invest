import { useMemo, useState } from "react";
import { Loader2, Check, X, Plus, FileUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import {
  movementsApi,
  type Movement,
  type MovementStatus,
  type MovementType,
} from "@/lib/api";
import { useApiData, invalidateApiCache } from "@/hooks/useApiData";
import { MovementRegisterDialog } from "./MovementRegisterDialog";
import { MovementsImportDialog } from "./MovementsImportDialog";

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

const TYPE_LABELS: Record<MovementType, string> = {
  deposit: "Depósito",
  withdrawal: "Extracción",
  dividend: "Dividendo",
  caucion: "Caución",
  adjustment: "Ajuste",
};

const SOURCE_LABELS: Record<Movement["source"], string> = {
  manual: "Manual",
  imported: "Importado",
  detected: "Detectado",
};

const STATUS_LABELS: Record<MovementStatus, string> = {
  confirmed: "Confirmado",
  pending: "Pendiente",
  rejected: "Rechazado",
};

function formatDate(date: string) {
  return new Date(`${date}T03:00:00Z`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function MovementsPanel() {
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: movementsData,
    isLoading: loading,
    error: loadError,
    refetch: load,
  } = useApiData("movements:all", () => movementsApi.list());

  const movements = movementsData?.movements ?? [];

  async function decide(id: string, status: "confirmed" | "rejected") {
    setDecidingId(id);
    setError(null);
    try {
      await movementsApi.decide(id, status);
      invalidateApiCache("movements");
      invalidateApiCache("reports");
      invalidateApiCache("portfolio");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar el movimiento");
    } finally {
      setDecidingId(null);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, Movement[]>();
    for (const m of movements) {
      const arr = map.get(m.date) ?? [];
      arr.push(m);
      map.set(m.date, arr);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [movements]);

  const columns: Column<Movement>[] = [
    {
      key: "tipo",
      header: "Tipo",
      render: (m) => <Badge variant={m.type === "withdrawal" ? "secondary" : "default"}>{TYPE_LABELS[m.type]}</Badge>,
    },
    {
      key: "monto",
      header: "Monto",
      align: "right",
      sortable: true,
      sortValue: (m) => m.amount,
      render: (m) => (
        <span className={`font-medium tabular-nums ${m.amount < 0 ? "text-red-600" : ""}`}>
          {formatMoney(m.amount, m.currency)}
        </span>
      ),
    },
    {
      key: "origen",
      header: "Origen",
      render: (m) => (
        <Badge variant={m.source === "detected" ? "destructive" : m.source === "imported" ? "secondary" : "outline"}>
          {SOURCE_LABELS[m.source]}
        </Badge>
      ),
    },
    {
      key: "estado",
      header: "Estado",
      render: (m) => (
        <Badge variant={m.status === "confirmed" ? "default" : m.status === "rejected" ? "destructive" : "secondary"}>
          {STATUS_LABELS[m.status]}
        </Badge>
      ),
    },
    {
      key: "acciones",
      header: "",
      align: "right",
      render: (m) =>
        m.source === "detected" && m.status === "pending" ? (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="xs"
              className="cursor-pointer text-emerald-600"
              disabled={decidingId === m.id}
              onClick={() => decide(m.id, "confirmed")}
            >
              {decidingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Confirmar
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="cursor-pointer text-destructive"
              disabled={decidingId === m.id}
              onClick={() => decide(m.id, "rejected")}
            >
              <X className="h-3.5 w-3.5" />
              Rechazar
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{m.description ?? "—"}</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" className="cursor-pointer" onClick={() => setImportOpen(true)}>
          <FileUp className="h-4 w-4" />
          Importar IOL
        </Button>
        <Button className="cursor-pointer" onClick={() => setRegisterOpen(true)}>
          <Plus className="h-4 w-4" />
          Registrar movimiento
        </Button>
      </div>

      {(error || loadError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || loadError}</AlertDescription>
        </Alert>
      )}

      {loading && movements.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : movements.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle className="text-lg">Todavía no hay movimientos</CardTitle>
            <CardDescription className="max-w-md">
              Registrá un ingreso o egreso manual, o importá el export de IOL. El Sentinel
              también detecta diferencias de caja y te las propone para que decidas.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        groups.map(([date, items]) => (
          <Card key={date}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{formatDate(date)}</CardTitle>
              <CardDescription>{items.length} movimiento(s)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveTable columns={columns} data={items} rowKey={(m) => m.id} />
            </CardContent>
          </Card>
        ))
      )}

      <MovementRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onCreated={() => {
          invalidateApiCache("movements");
          invalidateApiCache("reports");
          invalidateApiCache("portfolio");
          load();
        }}
      />
      <MovementsImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          invalidateApiCache("movements");
          invalidateApiCache("reports");
          invalidateApiCache("portfolio");
          load();
        }}
      />
    </div>
  );
}
