import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ConsensusData, InsightBlock } from "@/lib/api";

interface Props {
  block: InsightBlock<ConsensusData> | null | undefined;
  isLoading?: boolean;
}

const REC_LABEL: Record<string, string> = {
  buy: "Compra",
  overweight: "Sobreponderar",
  hold: "Mantener",
  underweight: "Infraponderar",
  sell: "Venta",
};

const REC_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  buy: "default",
  overweight: "default",
  hold: "secondary",
  underweight: "outline",
  sell: "destructive",
};

function fmtPrice(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function earningsCountdown(nextEarningsDate: string | null): string {
  if (!nextEarningsDate) return "Sin fecha de earnings disponible";
  const d = daysUntil(nextEarningsDate);
  const fmt = new Date(nextEarningsDate).toLocaleDateString("es-AR", { year: "numeric", month: "short", day: "numeric" });
  if (d === 0) return `${fmt} — hoy`;
  if (d === 1) return `${fmt} — mañana`;
  if (d > 1) return `${fmt} — en ${d} días`;
  if (d < 0) return `${fmt} — hace ${Math.abs(d)} días`;
  return fmt;
}

export function ConsensusTab({ block, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!block || block.status === "error" || !block.data) {
    return (
      <Alert>
        <AlertDescription>
          Consenso no disponible{block?.error ? ` — ${block.error}` : ""}.
        </AlertDescription>
      </Alert>
    );
  }

  const d = block.data;
  const recLabel = d.recommendation ? (REC_LABEL[d.recommendation] ?? d.recommendation) : "Sin recomendación";
  const recVariant = d.recommendation ? (REC_VARIANT[d.recommendation] ?? "secondary") : "secondary";

  return (
    <div className="grid gap-4 motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Recomendación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Badge variant={recVariant} className="text-sm">
            {recLabel}
          </Badge>
          {d.recommendation && <p className="text-xs text-muted-foreground">({d.recommendation})</p>}
          <p className="text-xs text-muted-foreground">
            Fuente {d.source} · {block.source} {block.cached ? "· cache" : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Precio objetivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Alto: </span>
            <span className="font-semibold tabular-nums">{fmtPrice(d.targetHigh)}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Promedio: </span>
            <span className="font-semibold tabular-nums">{fmtPrice(d.targetAvg)}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Bajo: </span>
            <span className="font-semibold tabular-nums">{fmtPrice(d.targetLow)}</span>
          </p>
          {d.currency && <p className="text-xs text-muted-foreground">Moneda: {d.currency}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Distribución / Earnings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {d.rating ? (
            <p className="tabular-nums">
              <span className="text-emerald-600">{d.rating.buys ?? 0} compra</span>
              {" · "}
              <span className="text-amber-600">{d.rating.holds ?? 0} mantener</span>
              {" · "}
              <span className="text-red-600">{d.rating.sells ?? 0} venta</span>
            </p>
          ) : (
            <p className="text-muted-foreground">Sin distribución</p>
          )}
          <p className="text-sm">{earningsCountdown(d.nextEarningsDate)}</p>
          {d.nextEarningsDate && (
            <p className="text-xs text-muted-foreground">Próximos resultados: {d.nextEarningsDate}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
