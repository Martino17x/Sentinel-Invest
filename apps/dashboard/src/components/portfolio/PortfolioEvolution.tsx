import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatARS } from "@/lib/formatters";
import type { PortfolioSnapshotPoint } from "@/features/portafolio/api";

type Props = {
  history: PortfolioSnapshotPoint[];
};

export function PortfolioEvolution({ history }: Props) {
  const hasData = history.length > 0;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Evolución del valor</CardTitle>
        <CardDescription>Últimos 90 días</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-64 w-full items-center justify-center rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Sin historial aún — los datos aparecen desde la creación del portafolio</p>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={history.map((p) => ({
                  ...p,
                  label: new Date(p.capturedAt).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "short",
                  }),
                }))}
                margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} minTickGap={32} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={90} tickFormatter={(v: number) => formatARS(v)} />
                <Tooltip
                  formatter={(value) => [formatARS(Number(value ?? 0)), "Valor total"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                />
                <Area type="monotone" dataKey="totalValue" stroke="var(--chart-1)" strokeWidth={2} fill="url(#valueGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
