import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetTypeBadge } from "@/components/ui/asset-type-badge";
import CompanyLogo from "@/components/ui/company-logo";
import { formatARS } from "@/lib/formatters";
import type { Position, VirtualPosition } from "@/features/portafolio/api";
import { calcDayAmount } from "./PortfolioPositionsTable";

type RealCardProps = {
  mode: "real";
  position: Position;
};

type VirtualCardProps = {
  mode: "virtual";
  position: VirtualPosition;
  onRemove?: (pos: VirtualPosition) => void;
};

type Props = RealCardProps | VirtualCardProps;

export function PortfolioMobileCard(props: Props) {
  if (props.mode === "real") {
    const pos = props.position;
    const gainPositive = pos.gainLossPct >= 0;
    const dayAmount = calcDayAmount(pos.totalValue, pos.dayChangePct);
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CompanyLogo symbol={pos.symbol} market={pos.market} size={20} className="shrink-0" />
              <Link to={`/quotes/${pos.symbol}`} className="text-base font-semibold text-foreground transition-colors hover:text-primary">
                {pos.symbol}
              </Link>
              <AssetTypeBadge type={pos.assetType} className="font-mono text-[10px]" />
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{pos.name}</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className={`text-xl font-bold tabular-nums ${gainPositive ? "text-emerald-600" : "text-red-600"}`}>
              {gainPositive ? "" : "-"}
              {formatARS(Math.abs(pos.gainLossAmount))}
            </span>
            <span className={`text-xs font-medium tabular-nums ${gainPositive ? "text-emerald-600" : "text-red-600"}`}>{pos.gainLossPct.toFixed(2)}%</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Rendimiento</span>
            <span
              className={`text-xs font-medium tabular-nums ${
                pos.dayChangePct > 0.01 ? "text-emerald-600" : pos.dayChangePct < -0.01 ? "text-red-600" : "text-muted-foreground"
              }`}
            >
              {pos.dayChangePct > 0.01 ? `▲ ${pos.dayChangePct.toFixed(2)}%` : pos.dayChangePct < -0.01 ? `▼ ${Math.abs(pos.dayChangePct).toFixed(2)}%` : "= 0,00%"}
              {dayAmount !== 0 && (
                <>
                  {" "}
                  ({pos.dayChangePct > 0 ? "+" : "-"}
                  {formatARS(Math.abs(dayAmount))})
                </>
              )}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border px-1 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cantidad</p>
            <p className="text-sm font-medium tabular-nums">{pos.quantity.toLocaleString("es-AR")}</p>
          </div>
          <div className="rounded-md border px-1 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Último</p>
            <p className="text-sm font-medium tabular-nums">{formatARS(pos.lastPrice)}</p>
          </div>
          <div className="rounded-md border px-1 py-1.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Valor bruto</p>
            <p className="text-sm font-medium tabular-nums">{formatARS(pos.totalValue)}</p>
          </div>
        </div>
      </div>
    );
  }

  const { position: pos, onRemove } = props;
  const gainPos = (pos.gainLossPct ?? 0) >= 0;
  const valorizado = pos.totalValue ?? pos.quantity * (pos.lastPrice ?? pos.avgPrice);
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CompanyLogo symbol={pos.symbol} market={pos.market} size={20} className="shrink-0" />
            <Link to={`/quotes/${pos.symbol}`} className="text-base font-semibold hover:text-primary transition-colors">
              {pos.symbol}
            </Link>
            <AssetTypeBadge type={pos.market === "bonds" ? "bono" : "accion"} className="font-mono text-[10px]" />
            <span className="text-xs text-muted-foreground">{pos.currency}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pos.quantity.toLocaleString("es-AR")} × {formatARS(pos.avgPrice)} prom.
          </p>
        </div>
        {onRemove && (
          <Button variant="ghost" size="icon-sm" onClick={() => onRemove(pos)} aria-label={`Borrar ${pos.symbol}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <span className={`text-lg font-bold tabular-nums ${gainPos ? "text-emerald-600" : "text-red-600"}`}>
            {gainPos ? "" : "-"}
            {formatARS(Math.abs(pos.gainLossAmount ?? 0))}
          </span>
          <span className={`text-xs font-medium tabular-nums ${gainPos ? "text-emerald-600" : "text-red-600"}`}>{(pos.gainLossPct ?? 0).toFixed(2)}%</span>
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Valorizado {formatARS(valorizado)}</span>
          <span className="text-muted-foreground">
            Último {pos.lastPrice != null ? formatARS(pos.lastPrice) : "—"}
            {pos.variationPct != null && ` (${pos.variationPct.toFixed(2)}% hoy)`}
          </span>
        </div>
      </div>
    </div>
  );
}

export default PortfolioMobileCard;
