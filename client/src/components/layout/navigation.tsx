import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  TrendingUp,
  LayoutDashboard,
  History,
  LineChart,
  BarChart3,
  Link2,
  User,
  LogOut,
  Menu,
  X,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";

function getInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

const NAV_LINKS = [
  { to: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { to: "/operations", label: "Operaciones", icon: History },
  { to: "/quotes", label: "Cotizaciones", icon: LineChart },
  { to: "/reports", label: "Reportes", icon: BarChart3 },
];

export function Navigation() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  const displayName = user?.fullName ?? user?.email ?? "Usuario";

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
          {/* Logo + navegación desktop */}
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/dashboard" className="flex shrink-0 items-center gap-2 font-semibold">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span>Sentinel</span>
            </Link>
            <nav className="hidden items-center gap-5 md:flex">
              {NAV_LINKS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Derecha: hamburguesa móvil + avatar */}
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="cursor-pointer md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 cursor-pointer rounded-full p-0 sm:h-9 sm:w-9"
                  aria-label="Menú de usuario"
                >
                  <Avatar className="h-9 w-9 sm:h-8 sm:w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                      {getInitials(user?.fullName, user?.email ?? "U")}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
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
                    <Link to="/connect">
                      <Link2 className="mr-2 h-4 w-4" />
                      Conectar IOL
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

      {/* Menú móvil — HERMANO del header (fuera de él): el backdrop-filter
          difumina la página REAL. Mismas clases glass que el header. */}
      {mobileOpen && (
        <>
          {/* Backdrop: cierra el menú al tocar afuera */}
          <div
            className="fixed inset-0 top-16 z-40 bg-transparent md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <nav className="fixed left-0 right-0 top-16 z-50 border-b bg-background/95 px-4 py-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
            {NAV_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 rounded-md px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </>
  );
}
