import { cn } from "@/lib/utils";
import { sanitizeChatText } from "@/lib/agent-chat";

// ============================================================
// MessageBubble — burbuja de chat con variantes:
//   user      → derecha, bg-primary
//   assistant → izquierda, bg-muted
//   error     → izquierda, borde/tono destructivo
// El contenido SIEMPRE pasa por sanitizeChatText (markdown
// liviano → texto plano, patrón Synara).
// ============================================================

export function MessageBubble({
  role,
  content,
  className,
}: {
  role: "user" | "assistant" | "error";
  content: string;
  className?: string;
}) {
  const text = sanitizeChatText(content);

  return (
    <div
      data-slot="message-bubble"
      data-role={role}
      className={cn(
        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words",
        role === "user" && "rounded-br-md bg-primary text-primary-foreground",
        role === "assistant" && "rounded-bl-md bg-muted text-foreground",
        role === "error" &&
          "rounded-bl-md border border-destructive/30 bg-destructive/10 text-destructive",
        className
      )}
    >
      {text}
    </div>
  );
}
