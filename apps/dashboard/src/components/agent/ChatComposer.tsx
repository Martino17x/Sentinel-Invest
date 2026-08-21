import { useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";

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
        "flex items-end gap-2 transition-all",
        variant === "default"
          ? "rounded-2xl border border-white/40 bg-white/70 p-1.5 pl-3.5 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/70 focus-within:border-black/10 focus-within:bg-white/85 focus-within:shadow-md focus-within:ring-2 focus-within:ring-black/[0.06] dark:border-white/10 dark:bg-white/[0.08] dark:backdrop-blur-md dark:focus-within:border-white/15 dark:focus-within:bg-white/[0.12] dark:focus-within:ring-white/10"
          : "rounded-2xl border border-white/10 bg-black/20 p-2 pl-4 backdrop-blur-md focus-within:border-white/20"
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
          "flex-1 resize-none py-1.5 text-[13.5px] leading-relaxed tracking-tight outline-none transition-colors disabled:opacity-60",
          variant === "default"
            ? "max-h-32 min-h-9 bg-transparent placeholder:text-muted-foreground/60 dark:placeholder:text-white/40 dark:text-white"
            : "max-h-40 bg-transparent text-white placeholder:text-white/50"
        )}
      />
      {streaming ? (
        <button
          type="button"
          aria-label="Detener respuesta"
          onClick={onStop}
          className={cn(
            "flex shrink-0 items-center justify-center transition-colors animate-in fade-in-0 duration-150 motion-reduce:animate-none",
            variant === "default"
              ? "size-8 rounded-full border border-black/10 bg-white text-foreground shadow-sm hover:bg-zinc-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              : "size-10 rounded-full bg-red-500/90 text-white hover:bg-red-500"
          )}
        >
          <Square className="size-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Enviar mensaje"
          disabled={!input.trim()}
          onClick={onSend}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full shadow-sm transition-all animate-in fade-in-0 duration-150 motion-reduce:animate-none active:scale-[0.97]",
            variant === "default"
              ? "size-8 bg-foreground text-background hover:bg-foreground/90 dark:bg-white dark:text-zinc-900 dark:hover:bg-white/90"
              : "size-10 bg-white text-[var(--synara-panel-bg-from)] hover:bg-white/90",
            "disabled:pointer-events-none disabled:opacity-40"
          )}
        >
          {variant === "modal" ? (
            <ArrowUp className="size-5" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </button>
      )}
    </div>
  );
}
