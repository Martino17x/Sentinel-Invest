import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Navigation } from "@/components/layout/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { IolConnectReminder } from "@/components/layout/IolConnectReminder";
import { InvestorProfileGate } from "@/components/layout/InvestorProfileGate";
import { BackButton } from "@/components/layout/BackButton";
import { AgentChatDrawer } from "@/components/agent/AgentChatDrawer";

import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { HomePage } from "@/pages/HomePage";
import { DashboardPage } from "@/pages/DashboardPage";
import { OperationsPage } from "@/features/portafolio/pages/OperationsPage";
import { QuotesPage } from "@/pages/QuotesPage";
import { QuoteDetailPage } from "@/pages/QuoteDetailPage";
import { ScreenerPage } from "@/features/analisis/pages/ScreenerPage";
import { NewsPage } from "@/features/noticias/pages/NewsPage";
import { NewsDetailPage } from "@/features/noticias/pages/NewsDetailPage";
import { StockAnalysisPage } from "@/features/analisis/pages/StockAnalysisPage";
import { ReportsPage } from "@/features/reportes/pages/ReportsPage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import { TermsPage } from "@/pages/TermsPage";
import { ConnectIolPage } from "@/pages/ConnectIolPage";
import { ConnectBrokerPage } from "@/pages/ConnectBrokerPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { AgentConnectPage } from "@/features/agente/pages/AgentConnectPage";
import { OperarPage } from "@/features/operar/pages/OperarPage";
import { OperarSymbolPage } from "@/features/operar/pages/OperarSymbolPage";
import { OperarFciPage } from "@/features/operar/pages/OperarFciPage";
import { cn } from "@/lib/utils";

const PortfolioHubPage = lazy(() => import("@/pages/PortfolioHubPage"));
const VirtualPortfolioPage = lazy(() => import("@/features/portafolio/pages/VirtualPortfolioPage"));
const VirtualPortfolioReportsPage = lazy(() => import("@/features/portafolio/pages/VirtualPortfolioReportsPage"));
const RadarPage = lazy(() => import("@/pages/RadarPage"));
const RentaFijaPage = lazy(() => import("@/features/renta-fija/pages/RentaFijaPage"));
const RentaFijaTablaPage = lazy(() => import("@/features/renta-fija/pages/RentaFijaTablaPage"));
const BondFichaPage = lazy(() => import("@/features/renta-fija/pages/BondFichaPage"));
const RentaFijaCurvaPage = lazy(() => import("@/features/renta-fija/pages/RentaFijaCurvaPage"));
const RentaFijaCalendarioPage = lazy(() => import("@/features/renta-fija/pages/RentaFijaCalendarioPage"));
const RentaFijaComparePage = lazy(() => import("@/features/renta-fija/pages/RentaFijaComparePage"));
const RentaFijaScreenerPage = lazy(() => import("@/features/renta-fija/pages/RentaFijaScreenerPage"));
const InvestorProfilePage = lazy(() => import("@/pages/InvestorProfile"));
const OnboardingWelcomePage = lazy(() => import("@/pages/OnboardingWelcomePage"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

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
  // - Nunca en /inicio (es el home), /portfolio, ni páginas con navegación propia
  //   (/quotes/:symbol ya tiene su breadcrumb, /analysis/:symbol idem)
  // - Desktop (md+): solo en páginas secundarias (perfil, conectar IOL)
  // - Mobile (<md): en todas las demás páginas
  const hasOwnNav =
    pathname.startsWith("/quotes/") ||
    pathname.startsWith("/analysis/") ||
    pathname.startsWith("/news/") ||
    pathname.startsWith("/radar") ||
    pathname.startsWith("/renta-fija");
  const isSecondary = pathname === "/profile" || pathname === "/connect" || pathname === "/agent-connect";
  const showBack = pathname !== "/inicio" && pathname !== "/portfolio" && !hasOwnNav;
  const backClasses = cn(!isSecondary && "md:hidden"); // en desktop se oculta si no es página secundaria

  return (
    <div className="min-h-svh max-w-[100vw] overflow-x-clip bg-background box-border">
      <Navigation />
      <IolConnectReminder />
      <InvestorProfileGate />
      <main className="relative min-w-0 max-w-[100vw] overflow-x-clip pb-24 md:pb-0 box-border">
        {/* Botón Volver EN EL FLUJO (no overlay): nunca se superpone al contenido.
            Padding propio arriba + separación del contenido con mb */}
        {showBack && (
          <div className={cn("mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8", backClasses)}>
            <BackButton />
          </div>
        )}
        <div
          key={pathname}
          className="min-w-0 max-w-[100vw] overflow-x-clip box-border animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none"
        >
          <Outlet />
        </div>
      </main>
      <BottomNav />
      <AgentChatDrawer />
    </div>
  );
}

// Rutas públicas — si ya hay sesión, redirigen al inicio
function GuestOnlyLayout() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/inicio" replace />;
  }

  return (
    <div
      key={pathname}
      className="min-w-0 max-w-full overflow-x-hidden animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none"
    >
      <Outlet />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
            {/* Inicio: la nueva página home mobile-first */}
            <Route path="/inicio" element={<HomePage />} />
            {/* Portafolio: el panel anterior (renombrado, sin cambios de contenido) */}
            <Route path="/portfolio" element={<DashboardPage />} />
            {/* Portafolios de seguimiento — hub y detalle virtual (Opción A) */}
            <Route
              path="/portfolio/seguimiento"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <PortfolioHubPage />
                </Suspense>
              }
            />
            <Route
              path="/portfolio/seguimiento/:id"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <VirtualPortfolioPage />
                </Suspense>
              }
            />
            <Route
              path="/portfolio/seguimiento/:id/reportes"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <VirtualPortfolioReportsPage />
                </Suspense>
              }
            />
            {/* Redirect legacy: /dashboard ya no existe como ruta principal */}
            <Route path="/dashboard" element={<Navigate to="/portfolio" replace />} />
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="/operar" element={<OperarPage />} />
            <Route path="/operar/:symbol" element={<OperarSymbolPage />} />
            <Route path="/operar/fci" element={<OperarFciPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/:symbol" element={<QuoteDetailPage />} />
            <Route path="/explorar" element={<ScreenerPage />} />
            <Route path="/screener" element={<Navigate to="/explorar" replace />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/news/:newsId" element={<NewsDetailPage />} />
            <Route path="/analysis/:symbol" element={<StockAnalysisPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route
              path="/radar"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <RadarPage />
                </Suspense>
              }
            />
            <Route
              path="/renta-fija"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <RentaFijaTablaPage />
                </Suspense>
              }
            />
            <Route
              path="/renta-fija/hub"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <RentaFijaPage />
                </Suspense>
              }
            />
            <Route
              path="/renta-fija/curva"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <RentaFijaCurvaPage />
                </Suspense>
              }
            />
            <Route
              path="/renta-fija/calendario"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <RentaFijaCalendarioPage />
                </Suspense>
              }
            />
            <Route
              path="/renta-fija/comparar"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <RentaFijaComparePage />
                </Suspense>
              }
            />
            <Route
              path="/renta-fija/screener"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <RentaFijaScreenerPage />
                </Suspense>
              }
            />
            <Route
              path="/renta-fija/:symbol"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <BondFichaPage />
                </Suspense>
              }
            />
            <Route path="/connect" element={<ConnectBrokerPage />} />
            <Route path="/connect-iol" element={<ConnectIolPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/agent-connect" element={<AgentConnectPage />} />
            <Route
              path="/investor-profile"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <InvestorProfilePage />
                </Suspense>
              }
            />
            <Route
              path="/perfil-inversor"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <InvestorProfilePage />
                </Suspense>
              }
            />
            <Route
              path="/onboarding"
              element={
                <Suspense
                  fallback={
                    <div className="flex min-h-48 items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <OnboardingWelcomePage />
                </Suspense>
              }
            />
          </Route>

          <Route path="/" element={<Navigate to="/inicio" replace />} />
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
