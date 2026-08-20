import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, ShieldCheck, Lock } from "lucide-react";

interface AuthSplitLayoutProps {
  children: ReactNode;
  title: string;
  description: string;
}

export function AuthSplitLayout({
  children,
  title,
  description,
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-svh w-full flex-col lg:flex-row bg-background">
      {/* Columna Izquierda: Formulario de Autenticación */}
      <div className="flex flex-1 flex-col justify-between p-6 sm:p-8 md:p-12 lg:w-1/2 lg:p-16">
        <div className="mx-auto w-full max-w-sm">
          {/* Logo Sentinel */}
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <TrendingUp className="h-4.5 w-4.5" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              Sentinel
            </span>
          </Link>
        </div>

        {/* Contenido Principal / Formulario */}
        <div className="mx-auto my-auto w-full max-w-sm py-8">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {children}
        </div>

        {/* Footer Izquierdo: Links Legales */}
        <div className="mx-auto w-full max-w-sm pt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Al continuar aceptás nuestros{" "}
            <Link
              to="/terms"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Términos
            </Link>{" "}
            y nuestra{" "}
            <Link
              to="/privacy"
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              Política de Privacidad
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Columna Derecha: Showcase Visual / Portafolio (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-l border-border/40 bg-zinc-950 p-12 text-zinc-100 lg:flex xl:p-16">
        {/* Encabezado Visual Sobrio */}
        <div className="space-y-2 z-10">
          <h2 className="text-2xl xl:text-3xl font-semibold tracking-tight text-zinc-100">
            Control patrimonial en tiempo real
          </h2>
          <p className="text-sm leading-relaxed text-zinc-400 max-w-md">
            Visualizá la evolución consolidada de tu cartera, métricas de rendimiento TWR y composición por activos directamente desde InvertirOnline.
          </p>
        </div>

        {/* Captura Limpia del Portafolio (Sin falsos marcos de navegador) */}
        <div className="my-6 z-10">
          <div className="relative rounded-lg border border-zinc-800/80 bg-zinc-900/30 shadow-2xl overflow-hidden">
            <img
              src="/screens/portfolio.png"
              alt="Vista previa del Portafolio Sentinel"
              className="w-full h-auto max-h-[380px] object-cover object-top"
              loading="eager"
            />
          </div>
        </div>

        {/* Indicadores de Confianza Funcionales y Planos */}
        <div className="flex items-center gap-6 text-xs text-zinc-400 border-t border-zinc-900 pt-6 z-10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-zinc-400 shrink-0" />
            <span>Acceso solo lectura</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-zinc-400 shrink-0" />
            <span>Cifrado AES-256-GCM</span>
          </div>
        </div>
      </div>
    </div>
  );
}
