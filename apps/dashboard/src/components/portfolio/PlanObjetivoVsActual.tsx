import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InvestmentPlan, VirtualPosition } from "@/features/portafolio/api";

type Props = {
  plan: InvestmentPlan | null;
  positions: VirtualPosition[];
  thresholdPct?: number;
};

type Row = {
  symbol: string;
  objetivo: number;
  actual: number;
  desvio: number;
  isFlagged: boolean;
};

function getAllocationTarget(plan: InvestmentPlan | null): Record<string, number> {
  if (!plan) return {};
  return plan.allocation_target ?? plan.allocationTarget ?? {};
}

export function PlanObjetivoVsActual({ plan, positions, thresholdPct = 5 }: Props) {
  const allocation = getAllocationTarget(plan);
  const totalValue = useMemo(() => positions.reduce((s, p) => s + p.totalValue, 0), [positions]);

  const rows: Row[] = useMemo(() => {
    const symbols = new Set<string>([...Object.keys(allocation), ...positions.map((p) => p.symbol.toUpperCase())]);
    if (symbols.size === 0) return [];
    const bySymbol = new Map<string, number>();
    for (const pos of positions) {
      const k = pos.symbol.toUpperCase();
      bySymbol.set(k, (bySymbol.get(k) ?? 0) + pos.totalValue);
    }
    const threshold = plan?.constraints?.maxPorActivo ? undefined : thresholdPct;
    const t = threshold ?? thresholdPct;
    return [...symbols]
      .sort()
      .map((symbol) => {
        const objetivo = allocation[symbol] ?? 0;
        const actual = totalValue > 0 ? ((bySymbol.get(symbol) ?? 0) / totalValue) * 100 : 0;
        const desvio = actual - objetivo;
        const isFlagged = Math.abs(desvio) > t;
        return { symbol, objetivo, actual, desvio, isFlagged };
      })
      .sort((a, b) => b.objetivo - a.objetivo || b.actual - a.actual);
  }, [allocation, positions, totalValue, plan?.constraints, thresholdPct]);

  const hasPlan = plan !== null && Object.keys(allocation).length > 0;
  const isEmptyPositions = positions.length === 0 || totalValue === 0;

  return (
    <Card className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Objetivo vs Actual</CardTitle>
            <CardDescription>
              {hasPlan ? `${plan!.title} · v${plan!.version}` : "Sin plan"} — compara allocation_target vs posiciones live
              {isEmptyPositions && " · Sin posiciones"}
            </CardDescription>
          </div>
          {isEmptyPositions && <Badge variant="outline">Sin posiciones</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {!hasPlan ? (
          <div className="rounded-lg border border-dashed p-6 text-center animate-in fade-in-0 duration-150 motion-reduce:animate-none">
            <p className="text-sm text-muted-foreground">Aún no hay plan para este portafolio.</p>
            <p className="text-xs text-muted-foreground mt-1">Creá la primera versión para ver el desvío Objetivo vs Actual.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Plan sin símbolos y sin posiciones.</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium">Símbolo</th>
                  <th className="text-right py-2 px-2 font-medium">Objetivo %</th>
                  <th className="text-right py-2 px-2 font-medium">Actual %</th>
                  <th className="text-right py-2 px-2 font-medium">Desvío</th>
                  <th className="text-center py-2 px-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.symbol}
                    className="border-b last:border-0 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
                  >
                    <td className="py-2.5 px-2 font-medium font-mono">{r.symbol}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{r.objetivo.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      {isEmptyPositions ? "0.0%" : `${r.actual.toFixed(1)}%`}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right tabular-nums font-medium ${
                        r.isFlagged ? (r.desvio > 0 ? "text-amber-600" : "text-red-600") : "text-muted-foreground"
                      }`}
                    >
                      {r.desvio > 0 ? "+" : ""}
                      {r.desvio.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {r.isFlagged ? (
                        <Badge
                          variant={Math.abs(r.desvio) > 10 ? "destructive" : "secondary"}
                          className="text-[10px] font-mono"
                        >
                          desvío
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {isEmptyPositions && hasPlan && (
          <p className="mt-3 text-xs text-muted-foreground">Sin posiciones — Actual muestra 0% para cada símbolo objetivo.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default PlanObjetivoVsActual;
