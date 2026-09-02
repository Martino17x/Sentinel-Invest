import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Home,
  Briefcase,
  LineChart,
  BarChart3,
  Search,
  Plug,
  User,
  LogOut,
  ArrowLeftRight,
  Landmark,
  Shield,
  Link2,
  ChevronDown,
  Compass,
  Newspaper,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/context/AuthContext";
import { isRouteActive } from "@/lib/nav";
import { cn } from "@/lib/utils";

function getInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/**
 * Header Opción B — fix: desktop sin Cartera dropdown, Mercado como popover card.
 *
 * Desktop (md+):
 *   Sentinel | Inicio | Portafolio | Cotizaciones | Mercado▾(popover card) | Reportes | 🔍 Buscar (⌘K) | avatar▾
 *   - Cartera dropdown eliminado: Seguimiento accesible desde /portfolio (vista Portafolio).
 *   - Cotizaciones como link individual (no dentro de Mercado).
 *   - Mercado como Popover (no DropdownMenu) estilo card con grid de links e iconos,
 *     patrón glass-popover igual al popover "Más" mobile (GlassPopoverContent).
 *     Contenido: Renta Fija, Radar CCL, Explorar, Noticias, Operaciones.
 *     Operaciones movido a Mercado para agrupar herramientas de mercado; alternativa era
 *     dejarlo top-level pero saturaba la barra (5 primarios ya).
 * Mobile:
 *   Header: logo + Buscar icon + avatar (sin hamburger drawer — drawer eliminado, BottomNav intacta).
 *   BottomNav permanece intacta (< md) con 6 tabs, sin cambios (ver git diff HEAD~1 BottomNav).
 *   Agente vive en AgentChatDrawer (FAB); en avatar solo link a /agent-connect.
 */
export function Navigation() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  // ⌘K / Ctrl+K — abre Command Palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const displayName = user?.fullName ?? user?.email ?? "Usuario";

  const isInicioActive = isRouteActive("/inicio", location.pathname);
  const isReportesActive = isRouteActive("/reports", location.pathname);
  const isPortafolioActive =
    location.pathname === "/portfolio" || location.pathname === "/dashboard";
  const isCotizacionesActive = isRouteActive("/quotes", location.pathname);
  const isMercadoActive =
    isRouteActive("/renta-fija", location.pathname) ||
    isRouteActive("/radar", location.pathname) ||
    isRouteActive("/explorar", location.pathname) ||
    isRouteActive("/news", location.pathname) ||
    isRouteActive("/operations", location.pathname) ||
    isRouteActive("/operar", location.pathname);

  function runCommand(fn: () => void) {
    setCmdOpen(false);
    fn();
  }

  return (
    <>
      <header className="sticky top-0 z-40 max-w-[100vw] overflow-x-clip border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-7xl min-w-0 items-center justify-between gap-2 overflow-hidden px-4 sm:px-6 lg:px-8 box-border">
          {/* Izquierda: logo + nav desktop */}
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/inicio" className="flex shrink-0 items-center gap-2 font-semibold">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span>Sentinel</span>
            </Link>

            {/* Desktop nav — Inicio | Portafolio | Cotizaciones | Mercado(popover) | Reportes */}
            <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
              {/* Inicio */}
              <Link
                to="/inicio"
                aria-current={isInicioActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  isInicioActive
                    ? "bg-accent text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Home className={cn("h-4 w-4", isInicioActive && "text-primary")} />
                Inicio
              </Link>

              {/* Portafolio — individual, sin dropdown Cartera */}
              <Link
                to="/portfolio"
                aria-current={isPortafolioActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  isPortafolioActive
                    ? "bg-accent text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Briefcase className={cn("h-4 w-4", isPortafolioActive && "text-primary")} />
                Portafolio
              </Link>

              {/* Cotizaciones — individual */}
              <Link
                to="/quotes"
                aria-current={isCotizacionesActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  isCotizacionesActive
                    ? "bg-accent text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <LineChart className={cn("h-4 w-4", isCotizacionesActive && "text-primary")} />
                Cotizaciones
              </Link>

              {/* Mercado — Popover card (no DropdownMenu), estilo GlassPopover "Más" mobile */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mercado"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isMercadoActive
                        ? "bg-accent text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Compass className={cn("h-4 w-4", isMercadoActive && "text-primary")} />
                    Mercado
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="bottom"
                  sideOffset={8}
                  className="w-80 max-w-[calc(100vw-2rem)] rounded-[20px] border border-white/20 bg-white/80 p-3 shadow-xl shadow-black/10 ring-1 ring-black/[0.04] backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 dark:border-white/10 dark:bg-zinc-900/70 dark:ring-white/10"
                >
                  <div className="grid grid-cols-2 gap-1.5">
                    <Link
                      to="/renta-fija"
                      className={cn(
                        "flex flex-col gap-1 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-accent",
                        isRouteActive("/renta-fija", location.pathname) && "bg-accent"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                        Renta Fija
                      </span>
                      <span className="text-xs text-muted-foreground">Bonos & curva</span>
                    </Link>
                    <Link
                      to="/radar"
                      className={cn(
                        "flex flex-col gap-1 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-accent",
                        isRouteActive("/radar", location.pathname) && "bg-accent"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                        Radar CCL
                      </span>
                      <span className="text-xs text-muted-foreground">Brecha dólar</span>
                    </Link>
                    <Link
                      to="/explorar"
                      className={cn(
                        "flex flex-col gap-1 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-accent",
                        isRouteActive("/explorar", location.pathname) && "bg-accent"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        Explorar
                      </span>
                      <span className="text-xs text-muted-foreground">Screener</span>
                    </Link>
                    <Link
                      to="/news"
                      className={cn(
                        "flex flex-col gap-1 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-accent",
                        isRouteActive("/news", location.pathname) && "bg-accent"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Newspaper className="h-4 w-4 text-muted-foreground" />
                        Noticias
                      </span>
                      <span className="text-xs text-muted-foreground">Mercado</span>
                    </Link>
                    <Link
                      to="/operations"
                      className={cn(
                        "col-span-2 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent",
                        isRouteActive("/operations", location.pathname) && "bg-accent"
                      )}
                    >
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      Operaciones
                      <span className="ml-auto text-xs font-normal text-muted-foreground">Historial</span>
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Reportes */}
              <Link
                to="/reports"
                aria-current={isReportesActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                  isReportesActive
                    ? "bg-accent text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <BarChart3 className={cn("h-4 w-4", isReportesActive && "text-primary")} />
                Reportes
              </Link>
            </nav>
          </div>

          {/* Derecha: Buscar + avatar (sin hamburger en mobile — BottomNav intacta) */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Buscar (⌘K) — desktop */}
            <Button
              variant="outline"
              size="sm"
              className="hidden h-8 gap-2 md:inline-flex"
              onClick={() => setCmdOpen(true)}
              aria-label="Buscar (⌘K)"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Buscar</span>
              <kbd className="ml-1 hidden lg:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
            {/* Buscar icon — mobile */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setCmdOpen(true)}
              aria-label="Buscar"
            >
              <Search className="h-5 w-5" />
            </Button>

            {/* Avatar dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 cursor-pointer rounded-full p-0 sm:h-9 sm:w-9"
                  aria-label="Menú de usuario"
                >
                  <Avatar className="h-9 w-9 sm:h-8 sm:w-8">
                    {user?.avatarUrl && (
                      <AvatarImage src={user.avatarUrl} alt={displayName} />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {getInitials(user?.fullName, user?.email ?? "U")}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
              >
                <DropdownMenuLabel>
                  <p className="truncate text-sm font-medium">{displayName}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link to="/profile">
                      <User className="mr-2 h-4 w-4" />
                      Perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/investor-profile">
                      <Shield className="mr-2 h-4 w-4" />
                      Perfil inversor
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/connect">
                      <Link2 className="mr-2 h-4 w-4" />
                      Conectar IOL
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/onboarding">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Onboarding
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/agent-connect">
                      <Plug className="mr-2 h-4 w-4" />
                      Agente
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Command Palette ⌘K */}
      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
        <CommandInput placeholder="Buscar AL30, Radar, Perfil inversor..." />
        <CommandList className="animate-in fade-in-0 motion-reduce:animate-none">
          <CommandEmpty>Sin resultados.</CommandEmpty>

          <CommandGroup heading="Navegación">
            <CommandItem
              value="inicio home"
              onSelect={() => runCommand(() => navigate("/inicio"))}
            >
              <Home className="mr-2 h-4 w-4" />
              Inicio
            </CommandItem>
            <CommandItem
              value="reportes reports"
              onSelect={() => runCommand(() => navigate("/reports"))}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Reportes
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Cartera">
            <CommandItem
              value="cartera portafolio portfolio posiciones"
              onSelect={() => runCommand(() => navigate("/portfolio"))}
            >
              <Briefcase className="mr-2 h-4 w-4" />
              Portafolio
            </CommandItem>
            <CommandItem
              value="seguimiento virtuales carteras seguimiento"
              onSelect={() => runCommand(() => navigate("/portfolio/seguimiento"))}
            >
              <Layers className="mr-2 h-4 w-4" />
              Seguimiento
            </CommandItem>
            <CommandItem
              value="operaciones operaciones"
              onSelect={() => runCommand(() => navigate("/operations"))}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Operaciones
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Mercado">
            <CommandItem
              value="renta fija bonos al30 gd30 curva calendario"
              onSelect={() => runCommand(() => navigate("/renta-fija"))}
            >
              <Landmark className="mr-2 h-4 w-4" />
              Renta Fija
            </CommandItem>
            <CommandItem
              value="radar ccl brecha dolar"
              onSelect={() => runCommand(() => navigate("/radar"))}
            >
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Radar CCL
            </CommandItem>
            <CommandItem
              value="explorar screener buscar acciones"
              onSelect={() => runCommand(() => navigate("/explorar"))}
            >
              <Search className="mr-2 h-4 w-4" />
              Explorar
            </CommandItem>
            <CommandItem
              value="cotizaciones quotes al30 ypf ggal"
              onSelect={() => runCommand(() => navigate("/quotes"))}
            >
              <LineChart className="mr-2 h-4 w-4" />
              Cotizaciones
            </CommandItem>
            <CommandItem
              value="noticias news mercado"
              onSelect={() => runCommand(() => navigate("/news"))}
            >
              <Newspaper className="mr-2 h-4 w-4" />
              Noticias
            </CommandItem>
            <CommandItem
              value="operar trading"
              onSelect={() => runCommand(() => navigate("/operar"))}
            >
              <LineChart className="mr-2 h-4 w-4" />
              Operar
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Cuenta">
            <CommandItem
              value="perfil inversor investor profile riesgo"
              onSelect={() => runCommand(() => navigate("/investor-profile"))}
            >
              <Shield className="mr-2 h-4 w-4" />
              Perfil inversor
            </CommandItem>
            <CommandItem
              value="onboarding bienvenida"
              onSelect={() => runCommand(() => navigate("/onboarding"))}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Onboarding
            </CommandItem>
            <CommandItem
              value="conectar iol broker"
              onSelect={() => runCommand(() => navigate("/connect"))}
            >
              <Link2 className="mr-2 h-4 w-4" />
              Conectar IOL
            </CommandItem>
            <CommandItem
              value="agente chat asistente"
              onSelect={() => runCommand(() => navigate("/agent-connect"))}
            >
              <Plug className="mr-2 h-4 w-4" />
              Agente
            </CommandItem>
            <CommandItem
              value="perfil cuenta usuario"
              onSelect={() => runCommand(() => navigate("/profile"))}
            >
              <User className="mr-2 h-4 w-4" />
              Perfil
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
