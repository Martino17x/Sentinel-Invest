import { CalendarClock } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function MonthlyReportEmpty() {
  return (
    <Card>
      <CardHeader className="items-center text-center py-12">
        <div className="rounded-full bg-muted p-3.5 mb-2">
          <CalendarClock className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg font-semibold">Todavía no hay reportes mensuales</CardTitle>
        <CardDescription className="max-w-md text-sm mt-1">
          Los reportes se generan automáticamente con los snapshots diarios de tu cartera.
          Sincronizá tu portafolio y a fin de mes vas a ver tu primer reporte contable completo
          (TWR, comparativa Merval, ganancias y flujo de fondos).
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
