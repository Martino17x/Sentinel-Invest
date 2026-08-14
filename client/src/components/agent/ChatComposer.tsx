import { useEffect, useRef } from "react";
import { ArrowUp, Send, Square } from "lucide-react";

import { cn } from "@/lib/utils";

// ============================================================
// ChatComposer — input del chat con dos variantes:
//   default → tema de la app (drawer): contenedor bordeado con
//             bg-muted/40, ring en focus, botón primary
//   modal   → tema oscuro Synara (pantalla completa): contenedor
//             vidrio (bg-black/20 border-white/10), textarea
//             blanco, botón redondo blanco con ArrowUp, stop rojo
// Auto-grow del textarea (minHeight → maxHeight según variante).
// ============================================================

export function ChatComposer({
  input,
  streaming,
  variant = "default",
  onChange,
  onKeyDown,
  onSend,
  onStop,
}: {
  input: string;
  streaming: boolean;
  variant?: "default" | "modal";
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStop: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const maxHeight = variant === "modal" ? 160 : 128;

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  }, [input, maxHeight]);

  return (
    <div
      className={cn(
        "flex items-end gap-2 transition-colors",
        variant === "default"
          ? "rounded-xl border border-input bg-muted/40 p-1.5 pl-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          : "rounded-2xl border border-white/10 bg-black/20 p-2 pl-4 focus-within:border-white/30"
      )}
    >
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={streaming}
        rows={1}
        placeholder="Escribí tu mensaje…"
        aria-label="Mensaje para el asistente"
        style={variant === "modal" ? { minHeight: 40, maxHeight: 160 } : undefined}
        className={cn(
          "flex-1 resize-none py-1.5 text-sm outline-none transition-colors disabled:opacity-60",
          variant === "default"
            ? "max-h-32 min-h-9 bg-transparent placeholder:text-muted-foreground"
            : "max-h-40 bg-transparent text-white placeholder:text-white/50"
        )}
      />
      {streaming ? (
        <button
          type="button"
          aria-label="Detener respuesta"
          onClick={onStop}
          className={cn(
            "flex shrink-0 items-center justify-center transition-colors",
            variant === "default"
              ? "size-8 rounded-lg border border-input bg-background text-foreground hover:bg-muted"
              : "size-10 rounded-full bg-red-500/90 text-white hover:bg-red-500"
          )}
        >
          <Square className="size-4 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Enviar mensaje"
          disabled={!input.trim()}
          onClick={onSend}
          className={cn(
            "flex shrink-0 items-center justify-center transition-colors",
            variant === "default"
              ? "size-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80"
              : "size-10 rounded-full bg-white text-[var(--synara-panel-bg-from)] hover:bg-white/90",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          {variant === "modal" ? (
            <ArrowUp className="size-5" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      )}
    </div>
  );
}
