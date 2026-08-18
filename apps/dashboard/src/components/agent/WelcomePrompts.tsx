import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  { label: "Mi cartera", prompt: "¿Cómo está mi cartera hoy?" },
  { label: "Dólar", prompt: "¿A cuánto está el dólar hoy?" },
  { label: "Cotizaciones", prompt: "¿Cómo vienen las acciones de tecnología?" },
  { label: "Reportes", prompt: "Resumí mis últimos movimientos" },
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
          "flex items-center justify-center",
          variant === "modal" ? "size-16 rounded-2xl bg-white/10" : "size-12 rounded-full bg-primary/10"
        )}
      >
        <Bot
          className={cn(
            variant === "modal" ? "size-8 text-white" : "size-6 text-primary"
          )}
        />
      </div>
      <div className="space-y-1.5">
        <h2
          className={cn(
            "font-heading text-base font-medium",
            variant === "modal" && "text-white"
          )}
        >
          ¡Hola! Soy tu asistente de inversiones
        </h2>
        <p
          className={cn(
            "text-sm",
            variant === "modal" ? "text-white/60" : "text-muted-foreground"
          )}
        >
          Preguntame por tu cartera, cotizaciones, el dólar o tus reportes.
          Todo lo que ves en la app, en una conversación.
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        {SUGGESTED_PROMPTS.map(({ label, prompt }, i) => (
          <Button
            key={label}
            type="button"
            variant={variant === "modal" ? "ghost" : "outline"}
            onClick={() => onPrompt(prompt)}
            className={cn(
              "h-auto min-h-9 whitespace-normal px-3 py-2 text-xs animate-in fade-in-0 duration-300 motion-reduce:animate-none",
              variant === "modal" &&
                "rounded-full border border-white/10 bg-white/[0.08] text-white/90 hover:bg-white/[0.16]"
            )}
            style={{ animationDelay: `${150 + i * 50}ms` }}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
