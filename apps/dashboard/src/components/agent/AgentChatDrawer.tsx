import { useEffect, useRef, useState } from "react";
import { History, Loader2, MessageSquare, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GlassPopover,
  GlassPopoverContent,
  GlassPopoverTrigger,
} from "@/components/ui/glass-popover";
import { MessageBubble } from "@/components/agent/MessageBubble";
import { ThinkingIndicator } from "@/components/agent/ThinkingIndicator";
import { ToolTimeline, type TimelineTool } from "@/components/agent/ToolTimeline";
import {
  PendingOrderCard,
  type PendingApproval,
  type PendingOutcome,
} from "@/components/agent/PendingOrderCard";
import { WelcomePrompts } from "@/components/agent/WelcomePrompts";
import { ChatComposer } from "@/components/agent/ChatComposer";
import { AgentChatError, streamAgentChat, type AgentToolStatus } from "@/lib/agent-chat";
import { WELCOME_MESSAGE, isGreeting } from "@/lib/agent-greetings";
import { agentApi, type AgentChatMessage, type AgentSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatSessionDate } from "@/components/agent/chat-shared";

// ============================================================
// AgentChatDrawer — chat global del asistente via GlassPopover
//
// Reemplaza el Drawer + AgentChatFullScreen (modal pantalla
// completa) por un único GlassPopover rectangular vertical
// anclado al FAB negro (trigger). Reutiliza el mismo
// GlassPopoverContent que BottomNav "Más" pero con dimensiones
// mayores: w-[380px] h-[520px] max-h-[80vh], responsive:
// en mobile w-[calc(100vw-2rem)] con margen, en desktop
// popover anclado al botón.
// ============================================================

export interface ChatItem {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  tools: TimelineTool[];
  streaming?: boolean;
  createdAt?: string;
  pendingApproval?: PendingApproval;
  pendingOutcome?: PendingOutcome | null;
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

function parsePendingFromTool(content: string | null): PendingApproval | null {
  if (!content) return null;
  const m = content.match(/PENDIENTE_ORDEN=([0-9a-f-]+)/);
  if (!m) return null;
  const summary = content
    .replace(/\nPENDIENTE_ORDEN=[0-9a-f-]+/s, "")
    .replace(/^Orden preparada: /, "")
    .replace(/\. Esperando tu confirmación\.$/, "")
    .trim();
  return { id: m[1], summary: summary || "Orden preparada" };
}

function messagesToItems(messages: AgentChatMessage[]): ChatItem[] {
  const items: ChatItem[] = [];
  const pendingQueue: PendingApproval[] = [];
  for (const msg of messages) {
    if (msg.role === "tool") {
      const pending = parsePendingFromTool(msg.content);
      if (pending) pendingQueue.push(pending);
      continue;
    }
    if (msg.role === "user") {
      items.push({
        id: msg.id,
        role: "user",
        content: msg.content ?? "",
        tools: [],
        createdAt: msg.createdAt ?? undefined,
      });
    } else {
      const item: ChatItem = {
        id: msg.id,
        role: "assistant",
        content: msg.content ?? "",
        tools: toolsFromHistory(msg.toolCalls),
        createdAt: msg.createdAt ?? undefined,
      };
      if (pendingQueue.length > 0) {
        item.pendingApproval = pendingQueue.shift();
      }
      items.push(item);
    }
  }
  return items;
}

export function AgentChatDrawer() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<AgentSession[] | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("Nueva conversación");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Cargar sesiones al abrir el popover
  useEffect(() => {
    if (!open) return;
    void refreshSessions();
  }, [open]);

  // Auto-scroll al fondo en cada actualización de mensajes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, streaming]);

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

  function handleDeleteSession(id: string) {
    setPendingDeleteId(id);
  }

  async function confirmDeleteSession() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
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
    setOpen(next);
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

  function resolvePending(itemId: string, outcome: PendingOutcome) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, pendingApproval: undefined, pendingOutcome: outcome } : it
      )
    );
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

    // Atajo de saludos — ahorra tokens pero SIMULA streaming (thinking + deltas)
    if (isGreeting(text)) {
      const now = new Date().toISOString();
      const assistantId = `assistant-${Date.now()}`;
      setInput("");
      setListError(null);
      setItems((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: text, tools: [], createdAt: now },
        {
          id: assistantId,
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

      const CHUNK_SIZE = 12;
      const INITIAL_DELAY = 320;
      const CHUNK_DELAY = 22;
      const chunks: string[] = [];
      for (let i = 0; i < WELCOME_MESSAGE.length; i += CHUNK_SIZE) {
        chunks.push(WELCOME_MESSAGE.slice(i, i + CHUNK_SIZE));
      }

      let idx = 0;
      const tick = () => {
        if (controller.signal.aborted) {
          setStreaming(false);
          // marcar fin de streaming en el item si quedó abierto
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.streaming) next[next.length - 1] = { ...last, streaming: false };
            return next;
          });
          abortRef.current = null;
          return;
        }
        if (idx >= chunks.length) {
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.streaming) next[next.length - 1] = { ...last, streaming: false };
            return next;
          });
          setStreaming(false);
          abortRef.current = null;
          return;
        }
        const chunk = chunks[idx++];
        setItems((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (!last?.streaming) return prev;
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
        setTimeout(tick, CHUNK_DELAY);
      };
      setTimeout(tick, INITIAL_DELAY);
      return;
    }

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
            case "order_pending":
              setItems((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (!last?.streaming) return prev;
                next[next.length - 1] = {
                  ...last,
                  pendingApproval: { id: event.id, summary: event.summary },
                };
                return next;
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

  return (
    <>
      <GlassPopover open={open} onOpenChange={handleOpenChange}>
      {/* FAB — trigger del GlassPopover */}
      <GlassPopoverTrigger asChild>
        <Button
          type="button"
          aria-label="Abrir chat con el asistente"
          className="fixed bottom-20 right-4 z-40 size-12 rounded-full shadow-lg md:bottom-6 md:right-6 md:size-11"
        >
          <MessageSquare className="size-5" />
        </Button>
      </GlassPopoverTrigger>

      {/* Popover glass — rectangular vertical, reutiliza GlassPopoverContent */}
      <GlassPopoverContent
        side="top"
        align="end"
        sideOffset={12}
        collisionPadding={16}
        avoidCollisions
        aria-label="Chat del asistente"
        className={cn(
          // Overrides de tamaño: rectangular vertical, más grande que "Más"
          // w-72 default de GlassPopoverContent es reemplazado via twMerge
          "flex flex-col overflow-hidden p-0",
          "w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)]",
          "h-[min(520px,70vh)] max-h-[80vh]",
          "sm:w-[380px] sm:max-w-[380px] sm:h-[520px] sm:max-h-[80vh]",
          // Glass ya viene del default (bg-white/80 backdrop-blur-xl border-white/20)
          // Solo reforzamos forma y sombra; el interior queda translúcido para ver el blur
          "rounded-[20px] shadow-xl shadow-black/[0.08] ring-1 ring-black/[0.04]"
        )}
      >
        {/* Header — transparente, sin bloque separado: iconos flotan sobre el vidrio del GlassPopoverContent */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-0 bg-transparent px-3 py-2.5">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight text-foreground">
            {activeTitle}
          </h2>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Nueva conversación"
              onClick={newSession}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Historial de conversaciones"
              aria-pressed={showHistory}
              className={cn(
                "text-muted-foreground hover:text-foreground",
                showHistory && "bg-black/[0.06] text-foreground dark:bg-white/10"
              )}
              onClick={() => setShowHistory((v) => !v)}
            >
              <History className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Cerrar chat"
              onClick={() => handleOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Cuerpo: historial o conversación — transparente para glass verdadero */}
        <div className="min-h-0 flex-1 overflow-hidden bg-transparent">
          {showHistory ? (
            <div className="custom-scrollbar h-full overflow-y-auto overflow-x-hidden p-2">
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
              <ul className="space-y-0.5">
                {sessions?.map((session) => (
                  <li key={session.id} className="group flex items-center gap-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => void openSession(session.id)}
                      className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <p className="truncate text-sm font-medium">{session.title ?? "Nueva conversación"}</p>
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
                      onClick={() => handleDeleteSession(session.id)}
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
              className="custom-scrollbar h-full space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4"
            >
              {welcomeVisible && <WelcomePrompts onPrompt={(p) => void sendMessage(p)} />}
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn("flex w-full min-w-0", item.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "flex min-w-0 flex-col gap-1.5",
                      item.role === "user" ? "max-w-[78%] items-end" : "w-full max-w-[92%] items-start"
                    )}
                  >
                    {item.content.trim() !== "" && (
                      <MessageBubble role={item.role} content={item.content} timestamp={item.createdAt} />
                    )}
                    {item.tools.length > 0 && <ToolTimeline tools={item.tools} live={!!item.streaming} />}
                    {item.pendingApproval && (
                      <PendingOrderCard
                        tone="modal"
                        approval={item.pendingApproval}
                        onDone={(o) => resolvePending(item.id, o)}
                      />
                    )}
                    {item.pendingOutcome && (
                      <p className={cn("text-xs", item.pendingOutcome.ok ? "text-emerald-600" : "text-destructive")}>
                        {item.pendingOutcome.message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {streaming && <ThinkingIndicator className="px-1" />}
            </div>
          )}
        </div>

        {/* Composer — footer glass sutil, separado del blur central */}
        {!showHistory && (
          <div className="shrink-0 border-t border-white/30 bg-white/35 p-3 backdrop-blur-md supports-[backdrop-filter]:bg-white/35 dark:border-white/10 dark:bg-white/[0.06]">
            {listError && <p className="mb-2 px-1 text-xs text-destructive">{listError}</p>}
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
      </GlassPopoverContent>
    </GlassPopover>

      <Dialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>¿Eliminar conversación?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará la conversación y todos sus mensajes de
              forma permanente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void confirmDeleteSession()}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
