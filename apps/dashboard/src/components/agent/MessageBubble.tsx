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

  return (
    <div className={cn("flex w-fit flex-col items-start gap-1")}>
      <div
        data-slot="message-bubble"
        data-role={role}
        className={cn(
          "w-fit rounded-2xl px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap",
          variant === "default"
            ? role === "user"
              ? "rounded-br-md bg-primary text-primary-foreground"
              : role === "assistant"
                ? "rounded-bl-md bg-muted text-foreground"
                : "rounded-bl-md border border-destructive/30 bg-destructive/10 text-destructive"
            : role === "user"
              ? "rounded-br-md bg-white text-[var(--synara-panel-bg-from)]"
              : role === "assistant"
                ? "rounded-bl-md border border-white/10 bg-white/10 text-white/90"
                : "rounded-bl-md border border-red-400/30 bg-red-500/10 text-red-300",
          animateIn && "animate-in fade-in-0 slide-in-from-bottom-1",
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
            "text-[10px]",
            role === "user" ? "self-end" : "self-start",
            variant === "modal" ? "text-[11px] text-white/40" : "text-muted-foreground/70"
          )}
        >
          {formatTimestamp(timestamp)}
        </span>
      )}
    </div>
  );
}
