import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatArs, formatUsd, maskAmount } from "@/lib/format";

interface AvailableCardProps {
  cashArs: number;
  cashUsd: number;
  hidden: boolean;
}

/**
 * Card de liquidez (estilo IOL): "Disponible para invertir" con
 * dos filas separadas — Pesos y Dólares, cada una clickeable.
 */
export function AvailableCard({ cashArs, cashUsd, hidden }: AvailableCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm font-medium text-muted-foreground">Disponible para invertir</p>

        <div className="mt-3 space-y-1">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/50"
            aria-label="Pesos disponibles"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                $
              </span>
              <span className="text-sm font-medium">Pesos</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-sm font-semibold tabular-nums">
                {hidden ? maskAmount(cashArs) : formatArs(cashArs)}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </span>
          </button>

          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/50"
            aria-label="Dólares disponibles"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                US$
              </span>
              <span className="text-sm font-medium">Dólares</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="text-sm font-semibold tabular-nums">
                {hidden ? maskAmount(cashUsd) : formatUsd(cashUsd)}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
