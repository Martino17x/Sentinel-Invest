import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DolarQuote } from "@/lib/api";

/**
 * Card "Dólar hoy" (fuente dolarapi.com):
 * muestra las cotizaciones principales del dólar con compra/venta.
 * El dólar "bolsa" (CCL) se usa como referencia para la conversión
 * del Total valorizado del hero.
 */
const CASAS_ORDER = ["oficial", "blue", "bolsa", "contadoconliqui"];

export function DolarCard({ dolares, loading }: { dolares: DolarQuote[] | null; loading: boolean }) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dólar hoy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </CardContent>
      </Card>
    );
  }

  if (!dolares || dolares.length === 0) {
    return null;
  }

  const casas = CASAS_ORDER.map((c) => dolares.find((d) => d.casa === c)).filter(
    (d): d is DolarQuote => Boolean(d)
  );

  const updated = dolares[0]?.fechaActualizacion
    ? new Date(dolares[0].fechaActualizacion).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Dólar hoy</CardTitle>
        <CardDescription>
          {updated ? `Actualizado ${updated}` : "Fuente: dolarapi.com"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {casas.map((casa) => (
            <div
              key={casa.casa}
              className="flex items-center justify-between rounded-lg px-2 py-2"
            >
              <span className="text-sm font-medium">{casa.nombre}</span>
              <span className="flex items-center gap-3 tabular-nums">
                <span className="text-xs text-muted-foreground">
                  {casa.compra.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-sm font-semibold">
                  {casa.venta.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 px-2 text-[10px] text-muted-foreground">
          Compra / Venta — dolarapi.com
        </p>
      </CardContent>
    </Card>
  );
}
