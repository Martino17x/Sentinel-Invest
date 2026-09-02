import { cn } from "@/lib/utils";
import { sanitizeChatText } from "@/lib/agent-chat";

// ============================================================
// MessageBubble — burbuja de chat con variantes:
//   default → tema de la app (drawer): bg-primary / bg-muted
//   modal   → tema oscuro Synara: blanco sólido / vidrio blanco
//
// - La burbuja es w-fit: ajusta su ancho al contenido (la cota
//   de ancho la pone el wrapper: max-w-[85%] en el drawer,
//   max-w-[85%]/md:max-w-[68%] en el modal). Nunca partes un
//   mensaje corto por un porcentaje contra ancho indefinido.
// - El contenido SIEMPRE pasa por sanitizeChatText (markdown
//   liviano → texto plano, patrón Synara).
// - Párrafos (separados por \n\n) con spacing propio.
// - Timestamp opcional, sutil, alineado con la burbuja.
// ============================================================

function formatTimestamp(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({
  role,
  content,
  className,
  variant = "default",
  timestamp,
  animateIn = false,
}: {
  role: "user" | "assistant" | "error";
  content: string;
  className?: string;
  variant?: "default" | "modal";
  timestamp?: string;
  animateIn?: boolean;
}) {
  const text = sanitizeChatText(content);
  const paragraphs = text.split(/\n{2,}/);

  // Assistant: integrado al fondo glass — sin bloque blanco, sin borde,
  // sin shadow, sin backdrop-blur decorativo. Tipografía como protagonista
  // (Apple minimal: tracking-tight, leading generoso, antialiased).
  if (role === "assistant") {
    return (
      <div
        className={cn(
          "flex w-full flex-col gap-1.5",
          animateIn && "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
        )}
      >
        <div
          data-slot="message-bubble"
          data-role="assistant"
          className={cn(
            "w-full whitespace-pre-wrap break-words antialiased",
            // Tipografía llamativa pero sobria: 14.5px > user 13.5px, tracking-tight, leading 1.65
            "px-1 py-1 text-[14.5px] font-normal leading-[1.65] tracking-[-0.011em]",
            variant === "modal" ? "text-white/90" : "text-foreground",
            className
          )}
        >
          {paragraphs.map((p, i) => (
            <p key={i} className={cn(i > 0 && "mt-3")}>
              {p}
            </p>
          ))}
        </div>
        {timestamp && (
          <span
            className={cn(
              "self-start px-1 text-[10.5px] tracking-tight",
              variant === "modal" ? "text-white/35" : "text-muted-foreground/50"
            )}
          >
            {formatTimestamp(timestamp)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex w-fit flex-col items-start gap-1")}>
      <div
        data-slot="message-bubble"
        data-role={role}
        className={cn(
          "w-fit rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap antialiased",
          variant === "default"
            ? role === "user"
              ? "rounded-br-md bg-foreground text-background shadow-sm"
              : "rounded-bl-md border border-destructive/20 bg-destructive/10 text-destructive backdrop-blur-sm"
            : role === "user"
              ? "rounded-br-md bg-white text-[var(--synara-panel-bg-from)] shadow-sm"
              : "rounded-bl-md border border-red-400/30 bg-red-500/10 text-red-300",
          animateIn && "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none",
          className
        )}
      >
        {paragraphs.map((p, i) => (
          <p key={i} className={cn(i > 0 && "mt-2")}>
            {p}
          </p>
        ))}
      </div>
      {timestamp && (
        <span
          className={cn(
            "text-[10px] tracking-tight",
            role === "user" ? "self-end" : "self-start",
            variant === "modal" ? "text-[11px] text-white/40" : "text-muted-foreground/60"
          )}
        >
          {formatTimestamp(timestamp)}
        </span>
      )}
    </div>
  );
}
