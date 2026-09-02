import { Bot } from "lucide-react";

import { cn } from "@/lib/utils";

// ============================================================
// WelcomePrompts — estado inicial del chat: saludo + grilla de
// prompts sugeridos. Al hacer click se envía como mensaje.
//
// Variantes:
//   default → tema de la app (drawer)
//   modal   → tema oscuro Synara (pantalla completa)
// ============================================================

export interface SuggestedPrompt {
  label: string;
  prompt: string;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { label: "💼 Mi cartera", prompt: "¿Cómo está mi cartera hoy?" },
  { label: "💵 Dólar", prompt: "¿A cuánto está el dólar hoy?" },
  { label: "📈 Cotizaciones", prompt: "¿Cómo vienen las acciones de tecnología?" },
  { label: "🛒 Operar", prompt: "Quiero comprar acciones. ¿Cómo hago?" },
  { label: "🏦 FCI", prompt: "¿Cómo invierto en un fondo común de inversión?" },
  { label: "📊 Reportes", prompt: "Resumí mis últimos movimientos" },
];

export function WelcomePrompts({
  onPrompt,
  variant = "default",
}: {
  onPrompt: (prompt: string) => void;
  variant?: "default" | "modal";
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center animate-in fade-in-0 duration-300 motion-reduce:animate-none">
      <div
        className={cn(
          "flex items-center justify-center border backdrop-blur-sm",
          variant === "modal"
            ? "size-16 rounded-2xl border-white/10 bg-white/10"
            : "size-10 rounded-full border-white/30 bg-white/60 text-muted-foreground shadow-sm dark:border-white/10 dark:bg-white/10"
        )}
      >
        <Bot
          className={cn(
            variant === "modal" ? "size-7 text-white" : "size-5 text-foreground/70 dark:text-white/70"
          )}
        />
      </div>
      <div className="space-y-1.5">
        <h2
          className={cn(
            "text-[15px] font-medium leading-snug tracking-tight",
            variant === "modal" ? "text-white" : "text-foreground"
          )}
        >
          ¡Hola! 👋 Soy Sentinel, el asistente de inversiones de Sentinel Invest.
        </h2>
        <p
          className={cn(
            "text-[13px] leading-relaxed",
            variant === "modal" ? "text-white/60" : "text-muted-foreground"
          )}
        >
          Estoy para ayudarte con todo lo relacionado al mercado de capitales argentino: acciones,
          CEDEARs, bonos, ON, FCI, cauciones, dólar, tu cartera… lo que necesites.
        </p>
        <p
          className={cn(
            "pt-1 text-[13px] font-medium",
            variant === "modal" ? "text-white/80" : "text-foreground/80"
          )}
        >
          ¿Qué te gusta hacer hoy? Podemos:
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        {SUGGESTED_PROMPTS.map(({ label, prompt }, i) => (
          <button
            key={label}
            type="button"
            onClick={() => onPrompt(prompt)}
            className={cn(
              "inline-flex h-auto min-h-9 items-center justify-center whitespace-normal rounded-full px-3.5 py-2 text-xs font-medium tracking-tight transition-colors animate-in fade-in-0 duration-300 motion-reduce:animate-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              variant === "modal"
                ? "border border-white/10 bg-white/[0.08] text-white/90 hover:bg-white/[0.14] hover:text-white"
                : "border border-white/40 bg-white/55 text-foreground/80 backdrop-blur-sm hover:bg-white/80 hover:text-foreground hover:border-white/60 shadow-sm dark:border-white/10 dark:bg-white/[0.08] dark:text-white/80 dark:hover:bg-white/[0.12] dark:hover:text-white"
            )}
            style={{ animationDelay: `${150 + i * 50}ms` }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
