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
  Layers,
  Compass,
  Menu,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * Header Opción B — 4 primarios + Command Palette ⌘K
 *
 * Desktop (md+):
 *   Sentinel | Inicio | Cartera▾ (Portafolio / Seguimiento) | Mercado▾ (Renta Fija / Radar / Explorar / Cotizaciones) | Reportes | 🔍 Buscar (⌘K) | avatar▾
 * Mobile:
 *   Logo | Buscar icon | hamburger → drawer con mismos 4 primarios | avatar
 *   BottomNav permanece intacto (< md).
 * Agente vive en AgentChatDrawer (FAB flotante); en avatar solo link a /agent-connect.
 */
export function Navigation() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
  const isCarteraActive =
    isRouteActive("/portfolio", location.pathname) ||
    location.pathname.startsWith("/portfolio/seguimiento");
  const isMercadoActive =
    isRouteActive("/renta-fija", location.pathname) ||
    isRouteActive("/radar", location.pathname) ||
    isRouteActive("/quotes", location.pathname) ||
    isRouteActive("/explorar", location.pathname);

  function runCommand(fn: () => void) {
    setCmdOpen(false);
    setMobileNavOpen(false);
    fn();
  }

  // Helpers for dropdown active states
  const isPortafolioActive =
    location.pathname === "/portfolio" || location.pathname === "/dashboard";
  const isSeguimientoActive = location.pathname.startsWith("/portfolio/seguimiento");

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

            {/* Desktop nav — 4 primarios */}
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

              {/* Cartera ▾ */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Cartera"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isCarteraActive
                        ? "bg-accent text-foreground font-semibold"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Briefcase className={cn("h-4 w-4", isCarteraActive && "text-primary")} />
                    Cartera
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
                >
                  <DropdownMenuItem
                    asChild
                    className={cn(isPortafolioActive && "bg-accent")}
                  >
                    <Link to="/portfolio" onClick={() => setMobileNavOpen(false)}>
                      <Briefcase className="mr-2 h-4 w-4" />
                      Portafolio
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className={cn(isSeguimientoActive && "bg-accent")}
                  >
                    <Link to="/portfolio/seguimiento" onClick={() => setMobileNavOpen(false)}>
                      <Layers className="mr-2 h-4 w-4" />
                      Seguimiento
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mercado ▾ */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
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
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56 animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none"
                >
                  <DropdownMenuItem asChild>
                    <Link to="/renta-fija">
                      <Landmark className="mr-2 h-4 w-4" />
                      Renta Fija
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/radar">
                      <ArrowLeftRight className="mr-2 h-4 w-4" />
                      Radar CCL
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/explorar">
                      <Search className="mr-2 h-4 w-4" />
                      Explorar
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/quotes">
                      <LineChart className="mr-2 h-4 w-4" />
                      Cotizaciones
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

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

          {/* Derecha: Buscar + avatar (+ hamburger mobile) */}
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

            {/* Hamburger — mobile: abre drawer con 4 primarios */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menú"
              aria-expanded={mobileNavOpen}
            >
              <Menu className="h-5 w-5" />
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

      {/* Mobile drawer — 4 primarios agrupados */}
      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent
          className="top-0 left-0 h-[100dvh] w-[84vw] max-w-[320px] translate-x-0 translate-y-0 rounded-none border-r p-0 gap-0 animate-in fade-in slide-in-from-left-2 motion-reduce:animate-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-left-2 sm:max-w-[320px]"
          aria-describedby={undefined}
        >
          <DialogHeader className="shrink-0 border-b px-4 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-5 w-5 text-primary" />
              Sentinel
            </DialogTitle>
            <DialogDescription className="sr-only">Navegación principal</DialogDescription>
          </DialogHeader>
          <nav className="flex flex-col gap-1 overflow-y-auto p-3" aria-label="Navegación móvil">
            <Link
              to="/inicio"
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium",
                isInicioActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Home className="h-4 w-4" />
              Inicio
            </Link>

            <p className="mt-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cartera
            </p>
            <Link
              to="/portfolio"
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                isPortafolioActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Briefcase className="h-4 w-4" />
              Portafolio
            </Link>
            <Link
              to="/portfolio/seguimiento"
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                isSeguimientoActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Layers className="h-4 w-4" />
              Seguimiento
            </Link>

            <p className="mt-2 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Mercado
            </p>
            <Link
              to="/renta-fija"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Landmark className="h-4 w-4" />
              Renta Fija
            </Link>
            <Link
              to="/radar"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeftRight className="h-4 w-4" />
              Radar CCL
            </Link>
            <Link
              to="/explorar"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Search className="h-4 w-4" />
              Explorar
            </Link>
            <Link
              to="/quotes"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <LineChart className="h-4 w-4" />
              Cotizaciones
            </Link>

            <Link
              to="/reports"
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "mt-2 flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium",
                isReportesActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <BarChart3 className="h-4 w-4" />
              Reportes
            </Link>

            <div className="mt-2 border-t pt-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setMobileNavOpen(false);
                  setCmdOpen(true);
                }}
              >
                <Search className="h-4 w-4" />
                Buscar (⌘K)
              </Button>
            </div>
          </nav>
        </DialogContent>
      </Dialog>

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
