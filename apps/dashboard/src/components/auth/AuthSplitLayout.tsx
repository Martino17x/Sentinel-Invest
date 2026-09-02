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
      <div className="relative hidden w-1/2 flex-col items-center justify-between overflow-hidden border-l border-border/40 bg-zinc-950 p-8 lg:p-10 xl:p-12 text-zinc-100 lg:flex">
        {/* Encabezado Visual Centrado y Contundente */}
        <div className="space-y-2.5 text-center max-w-xl z-10">
          <h2 className="text-3xl xl:text-4xl font-bold tracking-tight text-zinc-100 text-balance">
            Tu cartera de inversiones, clara y en tiempo real
          </h2>
          <p className="text-sm xl:text-base text-zinc-400 text-balance">
            Sincronizá tu cuenta de InvertirOnline y visualizá tus rendimientos reales al instante.
          </p>
        </div>

        {/* Captura Prominente del Portafolio */}
        <div className="w-full max-w-2xl xl:max-w-3xl flex-1 flex items-center justify-center my-4 z-10 px-2 lg:px-4">
          <div className="relative w-full rounded-xl border border-zinc-800 bg-zinc-900/40 shadow-2xl overflow-hidden">
            <img
              src="/screens/portfolio.png"
              alt="Vista previa del Portafolio Sentinel"
              className="w-full h-auto max-h-[480px] object-cover object-top"
              loading="eager"
            />
          </div>
        </div>

        {/* Indicadores de Confianza Centrados */}
        <div className="flex items-center justify-center gap-6 text-xs text-zinc-400 border-t border-zinc-900/80 pt-4 w-full z-10">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-zinc-400 shrink-0" />
            <span>Acceso solo lectura</span>
          </div>
          <span className="text-zinc-700">•</span>
          <div className="flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-zinc-400 shrink-0" />
            <span>Cifrado AES-256</span>
          </div>
        </div>
      </div>
    </div>
  );
}
