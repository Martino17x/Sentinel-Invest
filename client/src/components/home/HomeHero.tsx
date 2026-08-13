import { useState } from "react";
import { Eye, EyeOff, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatArsNoDecimals, formatUsd, formatChangeAmount, maskAmount } from "@/lib/format";

interface HomeHeroProps {
  totalArs: number;
  totalUsd: number;
  dayChangeAmountArs: number;
  dayChangeAmountUsd: number;
  dayChangePct: number;
}

/**
 * HERO de la página Inicio (estilo IOL):
 * "Tu total valorizado" en grande, selector de moneda ARS/USD (SIN conversión FX:
 * cada moneda muestra sus propios totales — decisión Opción B del SDD),
 * botón ojo para ocultar montos, y variación del día ▲/▼.
 */
export function HomeHero({
  totalArs,
  totalUsd,
  dayChangeAmountArs,
  dayChangeAmountUsd,
  dayChangePct,
}: HomeHeroProps) {
  const [currency, setCurrency] = useState<"ARS" | "USD">("ARS");
  const [hidden, setHidden] = useState(false);

  const isUp = dayChangePct >= 0;
  const ChangeIcon = isUp ? TrendingUp : TrendingDown;

  const total = currency === "ARS" ? totalArs : totalUsd;
  const dayChangeAmount = currency === "ARS" ? dayChangeAmountArs : dayChangeAmountUsd;

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Label + selector de moneda */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Tu total valorizado</p>
          <Select value={currency} onValueChange={(v) => setCurrency(v as "ARS" | "USD")}>
            <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ARS">ARS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Monto principal — GRANDE */}
        <div className="mt-2 flex items-center gap-3">
          <p className="text-4xl font-bold tracking-tight tabular-nums">
            {hidden
              ? maskAmount(total)
              : currency === "ARS"
                ? formatArsNoDecimals(total)
                : formatUsd(total)}
          </p>
          <button
            type="button"
            onClick={() => setHidden((prev) => !prev)}
            className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            aria-label={hidden ? "Mostrar montos" : "Ocultar montos"}
            title={hidden ? "Mostrar montos" : "Ocultar montos"}
          >
            {hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        {/* Variación del día */}
        <div
          className={`mt-1 flex items-center gap-1.5 text-sm font-medium tabular-nums ${
            isUp ? "text-emerald-600" : "text-red-600"
          }`}
        >
          <ChangeIcon className="h-4 w-4" />
          <span>
            {hidden
              ? maskAmount(dayChangeAmount)
              : formatChangeAmount(dayChangeAmount, currency)}
          </span>
          <span className="text-muted-foreground">
            ({hidden ? maskAmount(dayChangePct) : `${isUp ? "+" : ""}${dayChangePct.toFixed(2)}%`} hoy)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
