import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";

// ============================================================
// WelcomePrompts — estado inicial del chat: saludo + grilla de
// prompts sugeridos. Al hacer click se envía como mensaje.
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
}: {
  onPrompt: (prompt: string) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <Bot className="size-6 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-heading text-base font-medium">
          ¡Hola! Soy tu asistente de inversiones
        </h2>
        <p className="text-sm text-muted-foreground">
          Preguntame por tu cartera, cotizaciones, el dólar o tus reportes.
          Todo lo que ves en la app, en una conversación.
        </p>
      </div>
      <div className="grid w-full grid-cols-2 gap-2">
        {SUGGESTED_PROMPTS.map(({ label, prompt }) => (
          <Button
            key={label}
            type="button"
            variant="outline"
            onClick={() => onPrompt(prompt)}
            className="h-auto min-h-9 whitespace-normal px-3 py-2 text-xs"
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
