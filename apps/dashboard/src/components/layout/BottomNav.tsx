import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Briefcase,
  LineChart,
  BarChart3,
  ArrowLeftRight,
  Landmark,
  MoreHorizontal,
  Search,
  Newspaper,
  Link2,
  Shield,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isRouteActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

const PRIMARY_ITEMS = [
  { to: "/inicio", label: "Inicio", icon: Home },
  { to: "/portfolio", label: "Portafolio", icon: Briefcase },
  { to: "/quotes", label: "Cotizaciones", icon: LineChart },
  { to: "/renta-fija", label: "Renta Fija", icon: Landmark },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
] as const;

const OVERFLOW_ITEMS = [
  { to: "/radar", label: "Radar", icon: ArrowLeftRight, desc: "Brecha CCL" },
  { to: "/explorar", label: "Explorar", icon: Search, desc: "Screener" },
  { to: "/news", label: "Noticias", icon: Newspaper, desc: "Mercado" },
  { to: "/operations", label: "Operaciones", icon: Link2, desc: "Historial" },
  { to: "/investor-profile", label: "Perfil inversor", icon: Shield, desc: "Riesgo" },
] as const;

/**
 * Bottom navigation — visible solo en mobile/tablet (< md).
 * Patrón 5 + Más: 5 tabs principales + botón "Más" que abre Popover
 * glass (mismo estilo que Mercado popover en desktop) con opciones overflow.
 * Radar y resto de herramientas viven en "Más" para no saturar la barra.
 */
export function BottomNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = OVERFLOW_ITEMS.some(({ to }) => isRouteActive(to, location.pathname));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden"
      aria-label="Navegación principal"
    >
      <div className="grid grid-cols-6">
        {PRIMARY_ITEMS.map(({ to, label, icon: Icon }) => {
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

        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Más opciones"
              aria-expanded={moreOpen}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
                isMoreActive || moreOpen
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              Más
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={12}
            className="w-80 max-w-[calc(100vw-2rem)] rounded-[20px] border border-white/20 bg-white/80 p-3 shadow-xl shadow-black/10 ring-1 ring-black/[0.04] backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:border-white/10 dark:bg-zinc-900/70 dark:ring-white/10"
          >
            <div className="grid grid-cols-2 gap-1.5">
              {OVERFLOW_ITEMS.map(({ to, label, icon: Icon, desc }) => {
                const isActive = isRouteActive(to, location.pathname);
                const isFullWidth = label === "Perfil inversor";
                return (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-accent",
                      isFullWidth && "col-span-2 flex-row items-center gap-2 py-2.5",
                      isActive && "bg-accent"
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center gap-2 text-sm font-medium",
                        isFullWidth && "text-sm"
                      )}
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {label}
                    </span>
                    {!isFullWidth && (
                      <span className="text-xs text-muted-foreground">{desc}</span>
                    )}
                    {isFullWidth && (
                      <span className="ml-auto text-xs font-normal text-muted-foreground">
                        {desc}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </nav>
  );
}
