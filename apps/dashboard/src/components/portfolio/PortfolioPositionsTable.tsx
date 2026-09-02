import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { AssetTypeBadge } from "@/components/ui/asset-type-badge";
import CompanyLogo from "@/components/ui/company-logo";
import { formatARS } from "@/lib/formatters";
import type { Position, VirtualPosition } from "@/features/portafolio/api";

// ============================================================
// Pure helper — centralizado (spec 3.1)
// dayAmount = totalValue * pct/(100+pct) — el % es relativo al cierre anterior
// NO usar quantity*lastPrice: para bonos IOL reporta precio por VN 100 (100×)
// ============================================================
export function calcDayAmount(totalValue: number, dayChangePct: number): number {
  if (!Number.isFinite(totalValue) || !Number.isFinite(dayChangePct)) return 0;
  if (totalValue === 0 || dayChangePct === 0) return 0;
  return totalValue * (dayChangePct / (100 + dayChangePct));
}

type RealProps = {
  mode: "real";
  positions: Position[];
};

type VirtualProps = {
  mode: "virtual";
  positions: VirtualPosition[];
  onRemove?: (pos: VirtualPosition) => void;
};

type Props = RealProps | VirtualProps;

export function PortfolioPositionsTable(props: Props) {
  if (props.mode === "real") {
    const columns: Column<Position>[] = [
      {
        key: "activo",
        header: "Activo",
        sortable: true,
        sortValue: (pos) => pos.symbol,
        render: (pos) => (
          <div className="flex items-center gap-2.5 min-w-0">
            <CompanyLogo symbol={pos.symbol} market={pos.market} size={28} className="shrink-0" />
            <div className="min-w-0">
              <Link to={`/quotes/${pos.symbol}`} className="font-medium text-foreground transition-colors hover:text-primary">
                {pos.symbol}
              </Link>
              <div className="max-w-48 truncate text-xs text-muted-foreground">{pos.name}</div>
            </div>
          </div>
        ),
      },
      {
        key: "tipo",
        header: "Tipo",
        sortable: true,
        sortValue: (pos) => pos.assetType,
        render: (pos) => <AssetTypeBadge type={pos.assetType} />,
      },
      {
        key: "cantidad",
        header: "Cantidad",
        sortable: true,
        sortValue: (pos) => pos.quantity,
        align: "right",
        render: (pos) => <span className="tabular-nums">{pos.quantity.toLocaleString("es-AR")}</span>,
      },
      {
        key: "variacion-diaria",
        header: "Variación diaria",
        sortable: true,
        sortValue: (pos) => pos.dayChangePct,
        align: "right",
        render: (pos) => {
          const dayAmount = calcDayAmount(pos.totalValue, pos.dayChangePct);
          const dayUp = pos.dayChangePct > 0.01;
          const dayDown = pos.dayChangePct < -0.01;
          return (
            <div className="text-right">
              <div className={`tabular-nums ${dayUp ? "text-emerald-600" : dayDown ? "text-red-600" : "text-muted-foreground"}`}>
                {dayUp ? "▲" : dayDown ? "▼" : "="} {Math.abs(pos.dayChangePct).toFixed(2)}%
              </div>
              {dayAmount !== 0 && (
                <div className={`text-xs tabular-nums ${dayUp ? "text-emerald-600" : dayDown ? "text-red-600" : "text-muted-foreground"}`}>
                  ({dayUp ? "+" : dayDown ? "-" : ""}
                  {formatARS(Math.abs(dayAmount))})
                </div>
              )}
            </div>
          );
        },
      },
      {
        key: "ultimo",
        header: "Último",
        sortable: true,
        sortValue: (pos) => pos.lastPrice,
        align: "right",
        render: (pos) => <span className="tabular-nums">{formatARS(pos.lastPrice)}</span>,
      },
      {
        key: "promedio",
        header: "Prom. compra",
        sortable: true,
        sortValue: (pos) => pos.avgPrice,
        align: "right",
        render: (pos) => <span className="tabular-nums">{formatARS(pos.avgPrice)}</span>,
      },
      {
        key: "rendimiento",
        header: "Rendimiento",
        sortable: true,
        sortValue: (pos) => pos.gainLossPct,
        align: "right",
        render: (pos) => {
          const gainPositive = pos.gainLossPct >= 0;
          return (
            <div className="text-right">
              <div className={`font-medium tabular-nums ${gainPositive ? "text-emerald-600" : "text-red-600"}`}>{pos.gainLossPct.toFixed(2)}%</div>
              <div className={`text-xs tabular-nums ${gainPositive ? "text-emerald-600" : "text-red-600"}`}>
                {gainPositive ? "" : "-"}
                {formatARS(Math.abs(pos.gainLossAmount))}
              </div>
            </div>
          );
        },
      },
      {
        key: "valorizado",
        header: "Valorizado",
        sortable: true,
        sortValue: (pos) => pos.totalValue,
        align: "right",
        render: (pos) => <span className="font-medium tabular-nums">{formatARS(pos.totalValue)}</span>,
      },
    ];

    return <ResponsiveTable columns={columns} data={props.positions} rowKey={(pos) => `${pos.symbol}-${pos.market}`} />;
  }

  // virtual mode — 7 cols
  const { positions, onRemove } = props;
  const columns: Column<VirtualPosition>[] = [
    {
      key: "activo",
      header: "Activo",
      sortable: true,
      sortValue: (p) => p.symbol,
      render: (p) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <CompanyLogo symbol={p.symbol} market={p.market} size={28} className="shrink-0" />
          <div className="min-w-0">
            <Link to={`/quotes/${p.symbol}`} className="font-medium hover:text-primary transition-colors">
              {p.symbol}
            </Link>
            <div className="text-xs text-muted-foreground">
              {p.currency} · {p.market}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "cantidad",
      header: "Cantidad",
      sortable: true,
      sortValue: (p) => p.quantity,
      align: "right",
      render: (p) => <span className="tabular-nums">{p.quantity.toLocaleString("es-AR")}</span>,
    },
    {
      key: "promedio",
      header: "Prom. compra",
      sortable: true,
      sortValue: (p) => p.avgPrice,
      align: "right",
      render: (p) => <span className="tabular-nums">{formatARS(p.avgPrice)}</span>,
    },
    {
      key: "ultimo",
      header: "Último",
      sortable: true,
      sortValue: (p) => p.lastPrice ?? 0,
      align: "right",
      render: (p) => <span className="tabular-nums">{p.lastPrice != null ? formatARS(p.lastPrice) : "—"}</span>,
    },
    {
      key: "valorizado",
      header: "Valorizado",
      sortable: true,
      sortValue: (p) => p.totalValue ?? 0,
      align: "right",
      render: (p) => (
        <span className="font-medium tabular-nums">
          {formatARS(p.totalValue ?? p.quantity * (p.lastPrice ?? p.avgPrice))}
        </span>
      ),
    },
    {
      key: "rendimiento",
      header: "Rendimiento",
      sortable: true,
      sortValue: (p) => p.gainLossPct ?? 0,
      align: "right",
      render: (p) => {
        const pos = (p.gainLossPct ?? 0) >= 0;
        return (
          <div className="text-right">
            <div className={`font-medium tabular-nums ${pos ? "text-emerald-600" : "text-red-600"}`}>{(p.gainLossPct ?? 0).toFixed(2)}%</div>
            <div className={`text-xs tabular-nums ${pos ? "text-emerald-600" : "text-red-600"}`}>
              {pos ? "" : "-"}
              {formatARS(Math.abs(p.gainLossAmount ?? 0))}
            </div>
          </div>
        );
      },
    },
    {
      key: "acciones",
      header: "",
      render: (p) => (
        <Button variant="ghost" size="icon-sm" onClick={() => onRemove?.(p)} aria-label={`Borrar ${p.symbol}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return <ResponsiveTable columns={columns} data={positions} rowKey={(p) => p.id} />;
}

export default PortfolioPositionsTable;
