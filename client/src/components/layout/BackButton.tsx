import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Botón "Volver" con lógica responsive:
 * - Mobile (< md): visible en TODAS las páginas excepto /inicio (el home).
 * - Desktop (≥ md): visible solo en páginas secundarias (/profile, /connect).
 *
 * Al volver, si hay historial navegable usa browser back; si no, va al inicio.
 */
export function BackButton({ to }: { to?: string }) {
  const { user } = useAuth();
  if (!user) return null; // solo dentro de la app autenticada

  const fallback = to ?? "/inicio";

  return (
    <Link
      to={fallback}
      onClick={(e) => {
        // Si hay historial previo dentro de la SPA, usar back nativo
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
      }}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      aria-label="Volver"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden sm:inline">Volver</span>
    </Link>
  );
}
