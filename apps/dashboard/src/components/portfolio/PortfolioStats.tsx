import { TrendingUp, TrendingDown, Wallet, PiggyBank, Landmark, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatARS, formatUSD, type NormalizedTotals } from "@/lib/formatters";

type Props = {
  mode: "real" | "virtual";
  totals: NormalizedTotals;
};

/**
 * PortfolioStats — 4 cards parametrizadas por mode.
 * Espejo exacto de DashboardPage 125-199 (mismos colores, grid, formatters).
 * Sin fetch interno: recibe NormalizedTotals ya mapeado vía helpers puros.
 */
export function PortfolioStats({ mode, totals }: Props) {
  if (mode === "real") {
    const isUp = totals.dayChangePct >= 0;
    const ChangeIcon = isUp ? TrendingUp : TrendingDown;
    const gainPct = totals.gainPct;
    const isGainUp = totals.gainArs >= 0;

    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancia / Pérdida</CardTitle>
            <ChangeIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <div className="text-xl font-bold">{formatARS(totals.gainArs)}</div>
              {gainPct !== 0 && (
                <span className={`text-lg font-bold tabular-nums ${isGainUp ? "text-emerald-600" : "text-red-600"}`}>
                  {gainPct.toFixed(2)}%
                </span>
              )}
            </div>
            <p className="text-xs">
              <span className={isUp ? "text-emerald-600" : "text-red-600"}>
                {isUp ? "+" : ""}
                {totals.dayChangePct.toFixed(2)}% hoy
                {totals.dayChangeAmountArs !== 0 && (
                  <>
                    {" "}
                    ({isUp ? "+" : "-"}
                    {formatARS(Math.abs(totals.dayChangeAmountArs))})
                  </>
                )}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activos valorizados</CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatARS(totals.positionsValueArs)}</div>
            <p className="text-xs text-muted-foreground">
              {totals.totalUsd > 0 ? `${formatUSD(totals.totalUsd)} en USD` : "Solo posiciones en ARS"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponible ARS</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatARS(totals.cashArs)}</div>
            <p className="text-xs text-muted-foreground">Disponible para operar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disponible USD</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatUSD(totals.cashUsd)}</div>
            <p className="text-xs text-muted-foreground">Disponible para operar</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // mode === "virtual"
  const isUpVirtual = totals.gainArs >= 0;
  const ChangeIconV = isUpVirtual ? TrendingUp : TrendingDown;
  const gainPctV = totals.gainPct;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ganancia / Pérdida</CardTitle>
          <ChangeIconV className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <div className="text-xl font-bold">{formatARS(totals.gainArs)}</div>
            {gainPctV !== 0 && (
              <span className={`text-lg font-bold tabular-nums ${isUpVirtual ? "text-emerald-600" : "text-red-600"}`}>
                {gainPctV.toFixed(2)}%
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {totals.costArs ? `Sobre costo ${formatARS(totals.costArs)}` : "Sin costo base"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Valorizado</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold">{formatARS(totals.totalArs)}</div>
          <p className="text-xs text-muted-foreground">
            {totals.totalUsd > 0 ? `${formatUSD(totals.totalUsd)} en USD` : `${totals.count} posiciones`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Costo base</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold">{formatARS(totals.costArs ?? 0)}</div>
          <p className="text-xs text-muted-foreground">Suma de compras ficticias</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Posiciones</CardTitle>
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-xl font-bold">{totals.count}</div>
          <p className="text-xs text-muted-foreground">Activos en seguimiento</p>
        </CardContent>
      </Card>
    </div>
  );
}
