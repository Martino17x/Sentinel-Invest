import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Navigation } from "@/components/layout/navigation";
import { IolConnectReminder } from "@/components/layout/IolConnectReminder";
import { BackButton } from "@/components/layout/BackButton";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { OperationsPage } from "@/pages/OperationsPage";
import { QuotesPage } from "@/pages/QuotesPage";
import { QuoteDetailPage } from "@/pages/QuoteDetailPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import { TermsPage } from "@/pages/TermsPage";
import { ConnectIolPage } from "@/pages/ConnectIolPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { cn } from "@/lib/utils";

// Rutas que requieren sesión — redirigen a /login si no hay usuario
function ProtectedLayout() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Regla de visibilidad del botón "Volver":
  // - Nunca en /dashboard (es el home) ni en páginas con navegación propia
  //   (/quotes/:symbol ya tiene su breadcrumb)
  // - Desktop (md+): solo en páginas secundarias (perfil, conectar IOL)
  // - Mobile (<md): en todas las demás páginas
  const hasOwnNav = pathname.startsWith("/quotes/");
  const isSecondary = pathname === "/profile" || pathname === "/connect";
  const showBack = pathname !== "/dashboard" && !hasOwnNav;
  const backClasses = cn(!isSecondary && "md:hidden"); // en desktop se oculta si no es página secundaria

  return (
    <div className="min-h-svh bg-background">
      <Navigation />
      <IolConnectReminder />
      <main className="relative">
        {/* Botón Volver EN EL FLUJO (no overlay): nunca se superpone al contenido.
            Padding propio arriba + separación del contenido con mb */}
        {showBack && (
          <div className={cn("px-4 pt-4 sm:px-6 lg:px-8", backClasses)}>
            <BackButton />
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}

// Rutas públicas — si ya hay sesión, redirigen al dashboard
function GuestOnlyLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnlyLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Páginas legales — públicas, accesibles sin sesión */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />

          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/:symbol" element={<QuoteDetailPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/connect" element={<ConnectIolPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
