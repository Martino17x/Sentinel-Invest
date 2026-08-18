// ============================================================
// Cliente del chat del agente — streaming SSE sin dependencias.
//
// POST /api/agent/chat/stream con fetch + TextDecoder +
// ReadableStream; parsea líneas `data: {json}` en eventos
// tipados (mismo contrato que server/src/services/agent/sse.ts).
//
// - AbortController para cancelar (botón stop / cierre del drawer)
// - Watchdog de inactividad (~60s): si no llega NINGÚN dato
//   (ni siquiera pings del server), aborta y lanza error de timeout.
// - Errores HTTP tipados (401 sesión, 4xx/5xx del server).
// ============================================================

import { getAccessToken } from "./api";

export type AgentToolStatus =
  | "success"
  | "error"
  | "timeout"
  | "excluded"
  | "needs_approval"
  | "unknown_tool"
  | "validation_error"
  | "account_error";

export type AgentChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; args: object }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_end"; id: string; name: string; status: AgentToolStatus; summary: string }
  | { type: "done"; sessionId: string; messageId: string; usage?: { input: number; output: number } }
  | { type: "error"; code: string; message: string; fatal?: boolean };

export class AgentChatError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentChatError";
    this.code = code;
  }
}

/** Watchdog de inactividad: 60s sin datos (pings incluidos) → abort */
export const IDLE_WATCHDOG_MS = 60_000;

/**
 * Parsea UNA línea `data: ...` a un evento tipado.
 * Devuelve null si la línea no es data / no es JSON válido.
 * Exportado para tests (parse de stream simulado).
 */
export function parseAgentEvent(line: string): AgentChatEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as AgentChatEvent;
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { type?: unknown }).type !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface StreamAgentChatOptions {
  sessionId?: string | null;
  message: string;
  signal: AbortSignal;
  onEvent: (event: AgentChatEvent) => void;
}

/**
 * Envía un mensaje y consume el stream SSE hasta `done`/`error`.
 * - Lanza AgentChatError con código legible ante fallos (auth,
 *   http, timeout, connection_closed).
 * - Si el caller aborta (signal), propaga AbortError para que el
 *   UI decida (stop manual = silencio, sin burbuja de error).
 */
export async function streamAgentChat(options: StreamAgentChatOptions): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new AgentChatError(
      "auth",
      "Tu sesión expiró. Recargá la página y volvé a intentarlo."
    );
  }

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  options.signal.addEventListener("abort", onExternalAbort);

  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const resetWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => controller.abort(), IDLE_WATCHDOG_MS);
  };
  const clearWatchdog = () => {
    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };

  let sawTerminal = false; // done | error visto

  try {
    const res = await fetch("/api/agent/chat/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify({
        sessionId: options.sessionId ?? undefined,
        message: options.message,
      }),
      signal: controller.signal,
    });

    if (res.status === 401) {
      throw new AgentChatError(
        "auth",
        "Tu sesión expiró. Recargá la página y volvé a intentarlo."
      );
    }
    if (!res.ok) {
      let message = `El servidor respondió con error ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* sin body JSON */
      }
      throw new AgentChatError("http", message);
    }
    if (!res.body) {
      throw new AgentChatError("http", "El servidor no devolvió un stream válido.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    resetWatchdog();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetWatchdog();

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        for (const line of chunk.split("\n")) {
          const event = parseAgentEvent(line);
          if (!event) continue;
          if (event.type === "done" || event.type === "error") sawTerminal = true;
          options.onEvent(event);
        }
      }
    }

    // El stream se cerró sin evento terminal: conexión cortada a mitad
    if (!options.signal.aborted && !controller.signal.aborted && !sawTerminal) {
      throw new AgentChatError(
        "connection_closed",
        "La conexión se interrumpió. Revisá tu conexión y volvé a intentarlo."
      );
    }
  } catch (err) {
    // Abort del CALLER (stop manual / cierre del drawer) → propagar AbortError
    if (options.signal.aborted) throw err;
    // Abort del WATCHDOG (sin datos por 60s) → timeout claro
    if (controller.signal.aborted) {
      throw new AgentChatError(
        "timeout",
        "El asistente tardó demasiado en responder. Volvé a intentarlo."
      );
    }
    throw err;
  } finally {
    clearWatchdog();
    options.signal.removeEventListener("abort", onExternalAbort);
  }
}

// ============================================================
// sanitizeChatText — quita markdown liviano para mostrar texto
// plano (patrón Synara: el backend puede responder con **negritas**,
// títulos, código; la UI los muestra como texto limpio).
// ============================================================

export function sanitizeChatText(text: string): string {
  if (!text) return "";
  return text
    // Bloques de código: se conserva el contenido, se quitan los fences
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/^```[^\n]*\n?|\n?```$/g, "").trim())
    // Títulos markdown (#, ##, …)
    .replace(/^#{1,6}\s+/gm, "")
    // Negritas / itálicas / subrayado
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Código inline
    .replace(/`([^`]+)`/g, "$1")
    // Links markdown → solo el texto visible
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Viñetas → bullet visual simple
    .replace(/^\s*[-*+]\s+/gm, "• ")
    // Párrafos en blanco excesivos
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
