import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, TrendingUp, GraduationCap, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api-client";

/**
 * OnboardingWelcomePage — Opción A (Welcome → Test ya existente → Fin)
 *
 * Ruta: /onboarding dentro de ProtectedLayout (requiere auth).
 * - Requiere sesión: si no hay user, ProtectedLayout redirige a /login.
 * - Si ya tiene perfil (GET /investor-profile 200) → skip directo a /inicio.
 * - Si no tiene perfil (404) → muestra welcome.
 * - Excluida de InvestorProfileGate para no superponer modal sobre el welcome.
 *
 * Decisión de ruta: dentro de ProtectedLayout para aprovechar el guard de sesión
 * y evitar que usuarios anónimos vean el welcome. No en GuestOnlyLayout porque
 * el usuario recién registrado YA está logueado (register hace flushSync setUser).
 */
export default function OnboardingWelcomePage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    async function checkProfile() {
      try {
        await apiFetch<unknown>("/investor-profile", { method: "GET" });
        if (!alive) return;
        // 200 → ya tiene perfil → skip welcome
        navigate("/inicio", { replace: true });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          // sin perfil → mostrar welcome
          if (alive) setChecking(false);
        } else {
          // otros errores (500, red) → mostrar welcome igual, no bloquear
          if (alive) setChecking(false);
        }
      }
    }
    void checkProfile();
    return () => {
      alive = false;
    };
  }, [navigate]);

  if (checking) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-64px)] max-w-xl flex-col items-center justify-center p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300 motion-reduce:animate-none">
      <Card className="w-full border shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
        <CardContent className="space-y-8 p-6 sm:p-8">
          {/* Header */}
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Bienvenido a Sentinel
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Antes de analizar el mercado, personalicemos tu experiencia
            </p>
          </div>

          {/* Bullets */}
          <ul className="space-y-4 text-left">
            <li className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </span>
              <span className="space-y-0.5">
                <p className="text-sm font-medium leading-none">Análisis a tu medida, no genérico</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Filtramos y priorizamos según tu perfil real.
                </p>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <TrendingUp className="h-5 w-5 text-primary" />
              </span>
              <span className="space-y-0.5">
                <p className="text-sm font-medium leading-none">Recomendaciones según tu riesgo y horizonte</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Tu tolerancia y plazo definen qué te mostramos primero.
                </p>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <GraduationCap className="h-5 w-5 text-primary" />
              </span>
              <span className="space-y-0.5">
                <p className="text-sm font-medium leading-none">Educativo, no asesoramiento</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Información para decidir vos, sin promesas ni consejos personalizados.
                </p>
              </span>
            </li>
          </ul>

          {/* CTAs */}
          <div className="space-y-3">
            <Button
              size="lg"
              className="w-full cursor-pointer text-base font-medium"
              onClick={() => navigate("/investor-profile")}
            >
              Hacer test de inversor (2 min)
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Link
              to="/inicio"
              className="block text-center text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Explorar sin personalizar
            </Link>
            <p className="text-center text-xs text-muted-foreground">
              Podés hacerlo más tarde, pero te lo pediremos antes de analizar.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
