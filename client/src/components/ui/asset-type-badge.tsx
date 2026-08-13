import { Badge } from "@/components/ui/badge";

/**
 * Badge de tipo de activo con color SÓLIDO por categoría
 * (misma paleta que el donut de inversiones — legible, no pastel).
 * Texto blanco sobre fondo pleno para máximo contraste.
 */
const TYPE_BADGE_COLORS: Record<string, string> = {
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

const TYPE_BADGE_LABELS: Record<string, string> = {
  bono: "Bono",
  accion: "Acción",
  cedear: "CEDEAR",
  fci: "FCI",
  caucion: "Caución",
  futuro: "Futuro",
  opcion: "Opción",
  moneda: "Moneda",
  efectivo: "Efectivo",
};

export function AssetTypeBadge({ type, className }: { type: string; className?: string }) {
  const color = TYPE_BADGE_COLORS[type] ?? "#64748b";
  return (
    <Badge
      className={`shrink-0 border-0 font-medium text-white ${className ?? ""}`}
      style={{ backgroundColor: color }}
    >
      {TYPE_BADGE_LABELS[type] ?? type.toUpperCase()}
    </Badge>
  );
}
