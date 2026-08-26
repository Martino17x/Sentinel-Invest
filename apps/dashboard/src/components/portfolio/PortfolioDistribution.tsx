import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export type DistributionItem = { label: string; pct: number };

type Props = {
  distribution: DistributionItem[];
};

export function PortfolioDistribution({ distribution }: Props) {
  const hasData = distribution.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribución</CardTitle>
        <CardDescription>Composición de tu portafolio</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Sin posiciones para mostrar distribución</p>
          </div>
        ) : (
          <>
            <div className="flex h-40 w-full items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="pct" nameKey="label" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {distribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${Number(value ?? 0).toFixed(1)}%`, "Portafolio"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-1.5">
              {distribution.map((item, i) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-muted-foreground">{item.label}</span>
                  </span>
                  <span className="font-medium tabular-nums">{item.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
