import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, ShieldCheck, Lock, LineChart } from "lucide-react";

interface AuthSplitLayoutProps {
  children: ReactNode;
  title: string;
  description: string;
}

const TRUST_HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: "Solo lectura sobre IOL",
    description: "Tus credenciales nunca ejecutan órdenes de compra ni venta.",
  },
  {
    icon: Lock,
    title: "Cifrado AES-256-GCM",
    description: "Tokens y claves protegidos bajo estándares de seguridad bancaria.",
  },
  {
    icon: LineChart,
    title: "Métricas TWR en tiempo real",
    description: "Rendimiento ponderado en el tiempo real, libre de distorsiones.",
  },
];

export function AuthSplitLayout({
  children,
  title,
  description,
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-svh w-full flex-col lg:flex-row">
      {/* Columna Izquierda: Formulario de Autenticación */}
      <div className="flex flex-1 flex-col justify-between p-6 sm:p-8 md:p-12 lg:w-1/2 lg:p-16">
        <div className="mx-auto w-full max-w-sm">
          {/* Logo Sentinel */}
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">
              Sentinel
            </span>
          </Link>
        </div>

        {/* Contenido Principal / Formulario */}
        <div className="mx-auto my-auto w-full max-w-sm py-8">
          <div className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
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

      {/* Columna Derecha: Showcase Visual / Valor del Producto (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-l border-border/10 bg-zinc-950 p-12 text-zinc-100 lg:flex xl:p-16">
        {/* Encabezado Visual */}
        <div className="space-y-3 z-10">
          <div className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 border border-zinc-800">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span>Terminal de Control Patrimonial</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-50 xl:text-4xl">
            Tu terminal de control financiero e inversiones
          </h2>
          <p className="text-sm leading-relaxed text-zinc-400 max-w-lg">
            Monitoreá tu cartera en InvertirOnline con métricas TWR reales,
            cotizaciones en vivo, análisis de riesgo y reportes de rentabilidad
            detallados.
          </p>
        </div>

        {/* Mockup de la Aplicación con Marco de Ventana */}
        <div className="my-8 z-10">
          <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/90 shadow-2xl overflow-hidden transition-all duration-300 hover:border-zinc-700">
            {/* Barra de Ventana */}
            <div className="flex h-8 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/60 px-3.5">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                <div className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
              </div>
              <span className="text-[11px] font-mono text-zinc-400">
                sentinel.app/inicio
              </span>
              <div className="w-10" />
            </div>

            {/* Captura de Pantalla Real */}
            <div className="bg-zinc-950 p-1">
              <img
                src="/screens/inicio.png"
                alt="Vista previa del Dashboard Sentinel"
                className="w-full h-auto max-h-[300px] object-cover object-top rounded-lg"
                loading="eager"
              />
            </div>
          </div>
        </div>

        {/* Pilares de Confianza y Seguridad */}
        <div className="grid grid-cols-1 gap-3.5 z-10">
          {TRUST_HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-3"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-zinc-200">
                  <Icon className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-200">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-snug">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
