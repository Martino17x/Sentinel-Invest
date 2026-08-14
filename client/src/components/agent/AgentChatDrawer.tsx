import { useEffect, useRef, useState } from "react";
import {
  History,
  Loader2,
  Maximize2,
  MessageSquare,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { MessageBubble } from "@/components/agent/MessageBubble";
import { ThinkingIndicator } from "@/components/agent/ThinkingIndicator";
import { ToolTimeline, type TimelineTool } from "@/components/agent/ToolTimeline";
import { WelcomePrompts } from "@/components/agent/WelcomePrompts";
import { ChatComposer } from "@/components/agent/ChatComposer";
import { AgentChatFullScreen } from "@/components/agent/AgentChatFullScreen";
import {
  AgentChatError,
  streamAgentChat,
  type AgentToolStatus,
} from "@/lib/agent-chat";
import { agentApi, type AgentChatMessage, type AgentSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatSessionDate } from "@/components/agent/chat-shared";
import {
  CHAT_VIEW_CHANGED_EVENT,
  getChatViewPreference,
  setChatViewPreference,
  type ChatView,
} from "@/lib/chat-view";

// ============================================================
// AgentChatDrawer — chat global del asistente (FAB + drawer).
// Montado en ProtectedLayout → disponible en toda la app.
//
// - FAB flotante (bottom-right, arriba del BottomNav en mobile)
// - DOS vistas con el MISMO estado (patrón Equarys / Synara):
//     drawer → panel lateral (radix Dialog), botón "Expandir"
//     modal  → pantalla completa (AgentChatFullScreen, portal)
//   El estado del chat vive en AgentChatInner, que renderiza
//   UNA de las dos vistas según `view`.
// - La preferencia de vista persiste en localStorage
//   ('sentinel-chat-view') y se sincroniza vía custom event
//   'sentinel:chat-view-changed'.
// - Streaming SSE: los deltas se anexan a la última burbuja del
//   asistente; el timeline de tools se actualiza en vivo
// - Sesiones: nueva, historial, restauración, borrado
// - Abort al cerrar el drawer / botón stop
// ============================================================

export interface ChatItem {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  tools: TimelineTool[];
  streaming?: boolean;
  createdAt?: string;
}

function toolsFromHistory(toolCalls: unknown): TimelineTool[] {
  if (!Array.isArray(toolCalls)) return [];
  const tools: TimelineTool[] = [];
  for (const call of toolCalls) {
    if (typeof call !== "object" || call === null) continue;
    const id = (call as { id?: unknown }).id;
    const name = (call as { name?: unknown }).name;
    if (typeof id === "string" && typeof name === "string") {
      tools.push({ id, name });
    }
  }
  return tools;
}

function messagesToItems(messages: AgentChatMessage[]): ChatItem[] {
  const items: ChatItem[] = [];
  for (const msg of messages) {
    if (msg.role === "tool") continue;
    if (msg.role === "user") {
      items.push({
        id: msg.id,
        role: "user",
        content: msg.content ?? "",
        tools: [],
        createdAt: msg.createdAt ?? undefined,
      });
    } else {
      // Turnos de tool-call sin texto: el timeline lleva la info
      items.push({
        id: msg.id,
        role: "assistant",
        content: msg.content ?? "",
        tools: toolsFromHistory(msg.toolCalls),
        createdAt: msg.createdAt ?? undefined,
      });
    }
  }
  return items;
}

export function AgentChatDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FAB — botón flotante del asistente (arriba del BottomNav en mobile) */}
      <Button
        type="button"
        aria-label="Abrir chat con el asistente"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 z-40 size-12 rounded-full shadow-lg md:right-6 md:bottom-6 md:size-11"
      >
        <MessageSquare className="size-5" />
      </Button>

      <AgentChatInner open={open} onOpenChange={setOpen} />
    </>
  );
}

// ============================================================
// AgentChatInner — TODO el estado del chat vive acá y renderiza
// UNA de las dos vistas (drawer | modal) con el mismo estado.
// Al alternar vista no se pierde nada: mensajes, sesión activa,
// streaming y handlers son compartidos.
// ============================================================

function AgentChatInner({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [view, setView] = useState<ChatView>(getChatViewPreference);
  const [sessions, setSessions] = useState<AgentSession[] | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("Nueva conversación");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Sincronizar la preferencia de vista entre instancias
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ChatView>).detail;
      if (detail === "drawer" || detail === "modal") setView(detail);
    };
    window.addEventListener(CHAT_VIEW_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CHAT_VIEW_CHANGED_EVENT, handler);
  }, []);

  // Cargar sesiones al abrir el chat (cualquiera de las dos vistas)
  useEffect(() => {
    if (!open) return;
    refreshSessions();
  }, [open]);

  // Auto-scroll del drawer al fondo en cada actualización de mensajes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, streaming]);

  function switchView(next: ChatView) {
    setView(next);
    setChatViewPreference(next);
  }

  async function refreshSessions() {
    try {
      const res = await agentApi.listSessions();
      setSessions(res.sessions);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "No se pudieron cargar las sesiones");
    }
  }

  async function openSession(id: string) {
    setLoadingSession(true);
    setListError(null);
    setShowHistory(false);
    try {
      const res = await agentApi.getSession(id);
      setActiveSessionId(id);
      setActiveTitle(res.session.title ?? "Nueva conversación");
      setItems(messagesToItems(res.messages));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "No se pudo cargar la conversación");
    } finally {
      setLoadingSession(false);
    }
  }

  function newSession() {
    abortRef.current?.abort();
    setActiveSessionId(null);
    setActiveTitle("Nueva conversación");
    setItems([]);
    setListError(null);
    setShowHistory(false);
  }

  async function handleDeleteSession(id: string) {
    if (!window.confirm("¿Eliminar esta conversación?")) return;
    try {
      await agentApi.deleteSession(id);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "No se pudo eliminar la conversación");
      return;
    }
    setSessions((prev) => prev?.filter((s) => s.id !== id) ?? prev);
    if (activeSessionId === id) newSession();
  }

  function handleOpenChange(next: boolean) {
    if (!next) abortRef.current?.abort();
    onOpenChange(next);
  }

  function appendDelta(text: string) {
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last?.streaming) return prev;
      next[next.length - 1] = { ...last, content: last.content + text };
      return next;
    });
  }

  function upsertTool(tool: TimelineTool) {
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (!last?.streaming) return prev;
      const tools = last.tools.filter((t) => t.id !== tool.id);
      tools.push(tool);
      next[next.length - 1] = { ...last, tools };
      return next;
    });
  }

  function finishStreaming() {
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.streaming) {
        next[next.length - 1] = { ...last, streaming: false };
      }
      return next;
    });
  }

  function pushError(message: string) {
    setItems((prev) => {
      const next = prev.filter(
        (it, i) => !(it.streaming && it.content === "" && i === prev.length - 1)
      );
      return [...next, { id: `error-${Date.now()}`, role: "error", content: message, tools: [] }];
    });
  }

  async function sendMessage(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || streaming) return;

    setInput("");
    setListError(null);

    const now = new Date().toISOString();
    setItems((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: text, tools: [], createdAt: now },
      {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: "",
        tools: [],
        streaming: true,
        createdAt: now,
      },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamAgentChat({
        sessionId: activeSessionId,
        message: text,
        signal: controller.signal,
        onEvent: (event) => {
          switch (event.type) {
            case "session":
              setActiveSessionId((prev) => prev ?? event.sessionId);
              break;
            case "delta":
              appendDelta(event.text);
              break;
            case "tool_call":
            case "tool_start":
              upsertTool({ id: event.id, name: event.name });
              break;
            case "tool_end":
              upsertTool({
                id: event.id,
                name: event.name,
                status: event.status as AgentToolStatus,
                summary: event.summary,
              });
              break;
            case "done":
              finishStreaming();
              break;
            case "error":
              finishStreaming();
              pushError(event.message);
              break;
          }
        },
      });
    } catch (err) {
      // Abort manual (stop / cierre del drawer) → dejar el texto parcial
      if (err instanceof DOMException && err.name === "AbortError") {
        finishStreaming();
      } else {
        finishStreaming();
        pushError(
          err instanceof AgentChatError
            ? err.message
            : "Ocurrió un error inesperado. Volvé a intentarlo."
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      void refreshSessions();
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const welcomeVisible = !loadingSession && items.length === 0 && !streaming;

  // ============================================================
  // Vista 1 — DRAWER lateral
  // ============================================================
  if (view === "drawer") {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="w-full sm:max-w-[640px] md:max-w-[820px] lg:max-w-[920px]">
          {/* Header: título de sesión + acciones */}
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <DrawerTitle className="min-w-0 truncate">{activeTitle}</DrawerTitle>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Nueva conversación"
                onClick={newSession}
              >
                <Plus />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Historial de conversaciones"
                aria-pressed={showHistory}
                className={cn(showHistory && "bg-muted text-foreground")}
                onClick={() => setShowHistory((v) => !v)}
              >
                <History />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Expandir a pantalla completa"
                className="hidden md:inline-flex"
                onClick={() => switchView("modal")}
              >
                <Maximize2 />
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Cerrar chat">
                  <X />
                </Button>
              </DrawerClose>
            </div>
          </div>

          {/* Cuerpo: historial de sesiones O conversación */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {showHistory ? (
              <div className="custom-scrollbar h-full animate-in fade-in-0 duration-200 motion-reduce:animate-none overflow-y-auto overflow-x-hidden p-2">
                {sessions === null && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {sessions !== null && sessions.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Todavía no tenés conversaciones.
                  </p>
                )}
                <ul className="animate-in fade-in-0 duration-300 motion-reduce:animate-none space-y-0.5">
                  {sessions?.map((session) => (
                    <li key={session.id} className="group flex items-center gap-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => void openSession(session.id)}
                        className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                      >
                        <p className="truncate text-sm font-medium">
                          {session.title ?? "Nueva conversación"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatSessionDate(session.updatedAt)} · {session.messageCount}{" "}
                          {session.messageCount === 1 ? "mensaje" : "mensajes"}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Eliminar conversación "${session.title ?? "Nueva conversación"}"`}
                        onClick={() => void handleDeleteSession(session.id)}
                        className="mr-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : loadingSession ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div
                ref={scrollRef}
                className="custom-scrollbar h-full animate-in fade-in-0 duration-200 motion-reduce:animate-none space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4"
              >
                {welcomeVisible && <WelcomePrompts onPrompt={(p) => void sendMessage(p)} />}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex w-full min-w-0",
                      item.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {/* El wrapper pone la cota de ancho (ancho definido);
                        la burbuja es w-fit → se ajusta al contenido */}
                    <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-1.5">
                      {item.content.trim() !== "" && (
                        <MessageBubble
                          role={item.role}
                          content={item.content}
                          timestamp={item.createdAt}
                        />
                      )}
                      {item.tools.length > 0 && (
                        <ToolTimeline tools={item.tools} live={!!item.streaming} />
                      )}
                    </div>
                  </div>
                ))}
                {streaming && <ThinkingIndicator className="px-1" />}
              </div>
            )}
          </div>

          {/* Input — SOLO en la vista de conversación */}
          {!showHistory && (
            <div className="border-t p-3">
              {listError && (
                <p className="mb-2 px-1 text-xs text-destructive">{listError}</p>
              )}
              <ChatComposer
                variant="default"
                input={input}
                streaming={streaming}
                onChange={setInput}
                onKeyDown={handleInputKeyDown}
                onSend={() => void sendMessage()}
                onStop={stopStreaming}
              />
            </div>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  // ============================================================
  // Vista 2 — MODAL pantalla completa (mismo estado)
  // ============================================================
  return (
    <AgentChatFullScreen
      open={open}
      onOpenChange={handleOpenChange}
      view={view}
      onViewChange={switchView}
      activeTitle={activeTitle}
      sessions={sessions}
      showHistory={showHistory}
      onToggleHistory={() => setShowHistory((v) => !v)}
      items={items}
      streaming={streaming}
      loadingSession={loadingSession}
      listError={listError}
      welcomeVisible={welcomeVisible}
      input={input}
      onInputChange={setInput}
      onInputKeyDown={handleInputKeyDown}
      onSend={(raw) => void sendMessage(raw)}
      onStop={stopStreaming}
      onNewSession={newSession}
      onOpenSession={(id) => void openSession(id)}
      onDeleteSession={(id) => void handleDeleteSession(id)}
    />
  );
}
