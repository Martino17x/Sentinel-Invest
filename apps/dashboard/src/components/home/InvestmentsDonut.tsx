import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatArs, formatCompact, formatUsd, maskAmount } from "@/lib/format";
import type { DistributionByTypeItem } from "@/lib/api";

// Paleta vibrante por categoría (estilo IOL: cada tipo con su color)
const TYPE_COLORS: Record<string, string> = {
  bono: "#10b981", // esmeralda — Bonos
  cedear: "#8b5cf6", // violeta — CEDEARs
  accion: "#3b82f6", // azul — Acciones
  fci: "#f59e0b", // ámbar — FCI
  caucion: "#06b6d4", // cyan — Cauciones
  futuro: "#ef4444", // rojo — Futuros
  opcion: "#ec4899", // rosa — Opciones
  moneda: "#84cc16", // lima — Monedas
  efectivo: "#64748b", // slate — Efectivo
};

function colorForType(type: string): string {
  return TYPE_COLORS[type] ?? "#94a3b8";
}

interface InvestmentsDonutProps {
  distribution: DistributionByTypeItem[];
  currency: "ARS" | "USD";
  hidden: boolean;
  loading: boolean;
}

/**
 * "Mis inversiones": donut de distribución por categoría + desglose
 * con badge de %, monto total y variación por categoría (estilo IOL).
 * Cada categoría muestra el monto en la moneda activa (sin mezclar).
 */
export function InvestmentsDonut({
  distribution,
  currency,
  hidden,
  loading,
}: InvestmentsDonutProps) {
  const total = useMemo(() => {
    if (currency === "ARS") {
      return distribution.reduce((s, d) => s + d.amountArs, 0);
    }
    return distribution.reduce((s, d) => s + d.amountUsd, 0);
  }, [distribution, currency]);

  const chartData = distribution.map((d) => ({
    ...d,
    fill: colorForType(d.type),
  }));

  const formatAmount = (item: DistributionByTypeItem) => {
    const value = currency === "ARS" ? item.amountArs : item.amountUsd;
    return hidden ? maskAmount(value) : currency === "ARS" ? formatArs(value) : formatUsd(value);
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Mis inversiones</CardTitle>
        <CardDescription>Distribución por tipo de activo</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-4 sm:flex-row sm:justify-around">
            <Skeleton className="h-44 w-44 rounded-full" />
            <div className="w-full max-w-xs space-y-2">
              <Skeleton className="h-7 rounded-lg" />
              <Skeleton className="h-7 rounded-lg" />
              <Skeleton className="h-7 rounded-lg" />
            </div>
          </div>
        ) : distribution.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tenés inversiones todavía. Conectá tu cuenta IOL para ver tu cartera.
          </p>
        ) : (
          <div className="grid items-center gap-6 sm:grid-cols-2">
            {/* Donut con total en el centro */}
            <div className="relative mx-auto h-52 w-52 sm:h-56 sm:w-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="pct"
                    nameKey="label"
                    innerRadius="58%"
                    outerRadius="80%"
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.type} fill={colorForType(entry.type)} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Total
                </p>
                <p className="px-2 text-center text-base font-bold tabular-nums sm:text-lg">
                  {hidden
                    ? maskAmount(total)
                    : currency === "ARS"
                      ? formatCompact(total, "ARS")
                      : formatCompact(total, "USD")}
                </p>
              </div>
            </div>

            {/* Desglose por categoría */}
            <div className="space-y-1.5">
              {chartData.map((item) => (
                <div
                  key={item.type}
                  className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-muted/30"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForType(item.type) }}
                    />
                    <span className="truncate text-sm font-medium">{item.label}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="text-xs font-semibold">{formatAmount(item)}</span>
                    <span className="w-11 text-right text-xs text-muted-foreground">
                      {item.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
