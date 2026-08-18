import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useSmartBack } from "@/lib/use-smart-back";

/**
 * Botón "Volver" con lógica responsive:
 * - Mobile (< md): visible en TODAS las páginas excepto /inicio (el home).
 * - Desktop (≥ md): visible solo en páginas secundarias (/profile, /connect).
 *
 * Al volver usa el historial de la SPA (vuelve a donde estabas); si entraste
 * directo a la página, va al fallback.
 */
export function BackButton({ to }: { to?: string }) {
  const { user } = useAuth();
  const { goBack } = useSmartBack(to ?? "/inicio");
  if (!user) return null; // solo dentro de la app autenticada

  return (
    <Link
      to={to ?? "/inicio"}
      onClick={(e) => {
        e.preventDefault();
        goBack();
      }}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Volver"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden sm:inline">Volver</span>
    </Link>
  );
}
