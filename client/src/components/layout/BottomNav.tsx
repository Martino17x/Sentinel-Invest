import { NavLink } from "react-router-dom";
import { Home, Briefcase, LineChart, BarChart3, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/inicio", label: "Inicio", icon: Home },
  { to: "/portfolio", label: "Portafolio", icon: Briefcase },
  { to: "/quotes", label: "Cotizaciones", icon: LineChart },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
];

/**
 * Bottom navigation — visible solo en mobile/tablet (< md).
 * Reemplaza el menú hamburguesa. 5to ítem "Más" navega al avatar/perfil
 * (el dropdown del header sigue disponible con Perfil y Conectar IOL).
 */
export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
      aria-label="Navegación principal"
    >
      <div className="grid grid-cols-5">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}

        {/* "Más" — apunta al perfil (el dropdown del avatar tiene Perfil y Conectar IOL) */}
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )
          }
        >
          <MoreHorizontal className="h-5 w-5" />
          Más
        </NavLink>
      </div>
    </nav>
  );
}
