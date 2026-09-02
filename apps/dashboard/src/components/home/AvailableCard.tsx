import { Card, CardContent } from "@/components/ui/card";
import { formatArs, formatUsd, maskAmount } from "@/lib/format";

interface AvailableCardProps {
  cashArs: number;
  cashUsd: number;
  hidden: boolean;
}

/**
 * Card de liquidez (estilo IOL): "Disponible para invertir" con
 * dos filas — Pesos y Dólares. Informativas, sin chevron engañoso:
 * el detalle completo vive en el Portafolio.
 */
export function AvailableCard({ cashArs, cashUsd, hidden }: AvailableCardProps) {
  return (
    <Card className="flex-1">
      <CardContent className="p-6">
        <p className="text-sm font-medium text-muted-foreground">Disponible para invertir</p>

        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/30">
            <span className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tracking-tight text-foreground">
                $
              </span>
              <span className="text-sm font-medium">Pesos</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {hidden ? maskAmount(cashArs) : formatArs(cashArs)}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg px-2.5 py-2 transition-colors hover:bg-muted/30">
            <span className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tracking-tight text-foreground">
                US$
              </span>
              <span className="text-sm font-medium">Dólares</span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {hidden ? maskAmount(cashUsd) : formatUsd(cashUsd)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
