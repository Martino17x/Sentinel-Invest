import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { FundamentalsData, InsightBlock } from "@/lib/api";

interface Props {
  block: InsightBlock<FundamentalsData> | null | undefined;
  isLoading?: boolean;
}

const fmtNum = (v: number | null, digits = 2) =>
  v == null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: digits, minimumFractionDigits: digits });

const fmtPct = (v: number | null) =>
  v == null ? "—" : `${(v * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;

const fmtMoney = (v: number | null) =>
  v == null ? "—" : `$${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

export function FundamentalsTab({ block, isLoading }: Props) {
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
          Fundamentales no disponibles{block?.error ? ` — ${block.error}` : ""}.
        </AlertDescription>
      </Alert>
    );
  }

  const d = block.data;
  const rows: { label: string; value: string }[] = [
    { label: "PER", value: fmtNum(d.pe) },
    { label: "EPS", value: fmtNum(d.eps) },
    { label: "Beta", value: fmtNum(d.beta) },
    { label: "Margen", value: fmtPct(d.margin) },
    { label: "ROE", value: fmtPct(d.roe) },
    { label: "Deuda / Equity", value: fmtNum(d.debtEquity) },
    { label: "Dividend yield", value: fmtPct(d.dividendYield) },
    { label: "Market cap", value: fmtMoney(d.marketCap) },
  ];

  return (
    <Card className="motion-safe:animate-in motion-safe:fade-in motion-reduce:animate-none">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Fundamentales</CardTitle>
        <Badge variant="outline" className="font-mono text-xs">
          {block.source}
          {block.cached ? " · cache" : ""}
        </Badge>
      </CardHeader>
      <CardContent>
        <Table>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell className="font-medium text-muted-foreground">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{r.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
