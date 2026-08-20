import { Link, useLocation } from "react-router-dom";
import { Home, Briefcase, LineChart, BarChart3, ArrowLeftRight, Landmark } from "lucide-react";
import { isRouteActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/inicio", label: "Inicio", icon: Home },
  { to: "/portfolio", label: "Portafolio", icon: Briefcase },
  { to: "/quotes", label: "Cotizaciones", icon: LineChart },
  { to: "/radar", label: "Radar", icon: ArrowLeftRight },
  { to: "/renta-fija", label: "Renta Fija", icon: Landmark },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
];

/**
 * Bottom navigation — visible solo en mobile/tablet (< md).
 * Reemplaza el menú hamburguesa. Perfil/Conectar IOL viven en el
 * dropdown del avatar (header), no hay ítem "Más".
 */
export function BottomNav() {
  const location = useLocation();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
      aria-label="Navegación principal"
    >
      <div className="grid grid-cols-6">
        {ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = isRouteActive(to, location.pathname);
          return (
            <Link
              key={to}
              to={to}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
