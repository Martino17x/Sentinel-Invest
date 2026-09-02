import { useNavigate } from "react-router-dom";
import { History, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickActionsProps {
  syncing: boolean;
  onSync: () => void;
}

/**
 * Acciones rápidas read-only (Sentinel NO opera compras/ventas):
 * - Actividad → historial de operaciones
 * - Sincronizar → refetch del portafolio
 */
export function QuickActions({ syncing, onSync }: QuickActionsProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        variant="outline"
        className="h-16 cursor-pointer flex-col gap-1.5"
        onClick={() => navigate("/operations")}
      >
        <History className="h-5 w-5" />
        <span className="text-xs font-medium">Actividad</span>
      </Button>
      <Button
        variant="outline"
        className="h-16 cursor-pointer flex-col gap-1.5"
        onClick={onSync}
        disabled={syncing}
      >
        <RefreshCw className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} />
        <span className="text-xs font-medium">{syncing ? "Sincronizando..." : "Sincronizar"}</span>
      </Button>
    </div>
  );
}
