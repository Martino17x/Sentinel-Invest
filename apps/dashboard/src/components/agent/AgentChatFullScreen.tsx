import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Columns2, History, Loader2, Maximize2, Plus, Settings, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MessageBubble } from "@/components/agent/MessageBubble";
import { ThinkingIndicator } from "@/components/agent/ThinkingIndicator";
import { ToolTimeline } from "@/components/agent/ToolTimeline";
import { WelcomePrompts } from "@/components/agent/WelcomePrompts";
import { ChatComposer } from "@/components/agent/ChatComposer";
import { cn } from "@/lib/utils";
import { formatSessionDate } from "@/components/agent/chat-shared";
import type { ChatView } from "@/lib/chat-view";
import type { AgentSession } from "@/lib/api";
import type { ChatItem } from "@/components/agent/AgentChatDrawer";

// ============================================================
// AgentChatFullScreen — modal de pantalla completa del chat,
// portado del SynaraFullScreenModal (patrón Equarys).
//
// - Portal a document.body, role=dialog aria-modal, z-[300]
// - Patrón mounted/visible/dataState: al abrir se monta con
//   opacity 0 y a los 30ms pasa a visible (animate-in); al
//   cerrar se espera ~300ms (animate-out) antes de desmontar.
// - Overlay bg-black/40 backdrop-blur-sm, click → onClose
// - Escape cierra, focus trap básico (Tab wrap), scroll lock
//   mientras está montado, autoscroll con messagesEndRef.
// - El ESTADO del chat vive en AgentChatInner (AgentChatDrawer):
//   este componente es solo la presentación fullscreen.
// ============================================================

export interface AgentChatFullScreenProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  view: ChatView;
  onViewChange: (view: ChatView) => void;
  activeTitle: string;
  sessions: AgentSession[] | null;
  showHistory: boolean;
  onToggleHistory: () => void;
  items: ChatItem[];
  streaming: boolean;
  loadingSession: boolean;
  listError: string | null;
  welcomeVisible: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onInputKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: (raw?: string) => void;
  onStop: () => void;
  onNewSession: () => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
}

const ENTER_MS = 30;
const EXIT_MS = 300;

function FocusableSelector(): string {
  return 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
}

export function AgentChatFullScreen({
  open,
  onOpenChange,
  view,
  onViewChange,
  activeTitle,
  sessions,
  showHistory,
  onToggleHistory,
  items,
  streaming,
  loadingSession,
  listError,
  welcomeVisible,
  input,
  onInputChange,
  onInputKeyDown,
  onSend,
  onStop,
  onNewSession,
  onOpenSession,
  onDeleteSession,
}: AgentChatFullScreenProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);

  // Mount/unmount + animaciones de entrada/salida
  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = setTimeout(() => setVisible(true), ENTER_MS);
      return () => clearTimeout(t);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Scroll lock mientras el modal está montado
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Escape cierra + focus inicial en el panel
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      // Si el menú de vista está abierto, Escape cierra solo el menú
      if (viewMenuOpen) {
        if (e.key === "Escape") setViewMenuOpen(false);
        return;
      }
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => panelRef.current?.focus(), ENTER_MS);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [visible, onOpenChange, viewMenuOpen]);

  // Cerrar el menú de vista al hacer click fuera de él
  useEffect(() => {
    if (!viewMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!viewMenuRef.current?.contains(e.target as Node)) setViewMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [viewMenuOpen]);

  // Autoscroll al fondo en cada actualización
  useEffect(() => {
    if (!mounted || !visible) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [items, streaming, mounted, visible]);

  // Focus trap básico: Tab wrap entre el primer y último foco
  function handleTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FocusableSelector())
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Chat del asistente — pantalla completa"
      data-state={visible ? "open" : "closed"}
      onKeyDown={handleTabKeyDown}
    >
      {/* Overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm",
          visible
            ? "animate-in fade-in-0 duration-200"
            : "animate-out fade-out-0 duration-300"
        )}
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full flex-col overflow-hidden shadow-2xl outline-none",
          "md:h-[min(90vh,860px)] md:w-[min(96vw,1100px)] md:rounded-3xl",
          "bg-[linear-gradient(180deg,var(--synara-panel-bg-from),var(--synara-panel-bg-to))]",
          visible
            ? "animate-in fade-in-0 zoom-in-95 duration-200"
            : "animate-out fade-out-0 zoom-out-95 duration-300"
        )}
      >
        {/* Header */}
        <header className="flex shrink-0 items-center gap-1 px-3 py-3 md:px-4">
          <button
            type="button"
            aria-label="Cerrar chat"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
          <h2 className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-white/90">
            {activeTitle}
          </h2>
          <button
            type="button"
            aria-label="Historial de conversaciones"
            aria-pressed={showHistory}
            onClick={onToggleHistory}
            className={cn(
              "rounded-full p-2 transition-colors hover:bg-white/10",
              showHistory ? "bg-white/15 text-white" : "text-white/80 hover:text-white"
            )}
          >
            <History className="size-4" />
          </button>
          {/* Menú de vista — menú propio (el DropdownMenu de Radix quedaba
              con position:static dentro del portal del modal → invisible).
              Al elegir una opción: onViewChange hace setView + persistencia
              (setChatViewPreference) y el modal se desmonta al cambiar a drawer. */}
          <div ref={viewMenuRef} className="relative">
            <button
              type="button"
              aria-label="Preferencias de vista del chat"
              aria-expanded={viewMenuOpen}
              onClick={() => setViewMenuOpen((v) => !v)}
              className={cn(
                "rounded-full p-2 transition-colors hover:bg-white/10",
                viewMenuOpen ? "bg-white/15 text-white" : "text-white/80 hover:text-white"
              )}
            >
              <Settings className="size-4" />
            </button>
            {viewMenuOpen && (
              <div
                role="menu"
                aria-label="Preferencias de vista del chat"
                className="absolute right-0 top-full z-50 mt-2 min-w-44 rounded-xl border border-white/10 bg-[var(--synara-panel-bg-from)] p-1 shadow-2xl animate-in fade-in-0 zoom-in-95"
              >
                {(
                  [
                    { value: "drawer", label: "Panel lateral", icon: Columns2 },
                    { value: "modal", label: "Pantalla completa", icon: Maximize2 },
                  ] as const
                ).map((option) => {
                  const active = view === option.value;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        onViewChange(option.value);
                        setViewMenuOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        active
                          ? "bg-white/15 font-medium text-white"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{option.label}</span>
                      </span>
                      {active && <Check className="size-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </header>

        {/* Cuerpo: sidebar de sesiones + conversación */}
        <div className="flex min-h-0 flex-1">
          {showHistory && (
            <aside className="flex w-full shrink-0 flex-col gap-3 border-r border-white/10 bg-black/20 p-4 md:w-[320px]">
              <Button
                type="button"
                onClick={onNewSession}
                className="bg-white text-[var(--synara-panel-bg-from)] hover:bg-white/90"
              >
                <Plus className="size-4" />
                Nueva conversación
              </Button>
              <div className="custom-scrollbar custom-scrollbar-on-dark min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
                {sessions === null && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="size-5 animate-spin text-white/50" />
                  </div>
                )}
                {sessions !== null && sessions.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-white/50">
                    Todavía no tenés conversaciones.
                  </p>
                )}
                <ul className="space-y-1">
                  {sessions?.map((session) => (
                    <li key={session.id} className="group flex items-center gap-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => onOpenSession(session.id)}
                        className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/10"
                      >
                        <p className="truncate text-sm font-medium text-white/90">
                          {session.title ?? "Nueva conversación"}
                        </p>
                        <p className="text-xs text-white/50">
                          {formatSessionDate(session.updatedAt)} · {session.messageCount}{" "}
                          {session.messageCount === 1 ? "mensaje" : "mensajes"}
                        </p>
                      </button>
                      <button
                        type="button"
                        aria-label={`Eliminar conversación "${session.title ?? "Nueva conversación"}"`}
                        onClick={() => onDeleteSession(session.id)}
                        className="mr-1 rounded-md p-1.5 text-white/50 transition-colors hover:text-red-300"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}

          <main
            className={cn(
              "min-w-0 flex-1 flex-col",
              showHistory ? "hidden md:flex" : "flex"
            )}
          >
            <div className="custom-scrollbar custom-scrollbar-on-dark min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 md:p-6">
              {loadingSession ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-white/50" />
                </div>
              ) : (
                <>
                  {welcomeVisible && (
                    <WelcomePrompts variant="modal" onPrompt={(p) => onSend(p)} />
                  )}
                  {items.map((item, i) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex w-full min-w-0",
                        item.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div className="flex min-w-0 max-w-[85%] flex-col items-start gap-1.5 md:max-w-[68%]">
                        {item.content.trim() !== "" && (
                          <MessageBubble
                            role={item.role}
                            content={item.content}
                            variant="modal"
                            timestamp={item.createdAt}
                            animateIn={i === items.length - 1}
                          />
                        )}
                        {item.tools.length > 0 && (
                          <ToolTimeline tools={item.tools} live={!!item.streaming} tone="modal" />
                        )}
                      </div>
                    </div>
                  ))}
                  {streaming && <ThinkingIndicator variant="modal" className="px-1" />}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="shrink-0 p-3 md:p-4">
              {listError && (
                <p className="mb-2 px-1 text-xs text-red-300">{listError}</p>
              )}
              <ChatComposer
                variant="modal"
                input={input}
                streaming={streaming}
                onChange={onInputChange}
                onKeyDown={onInputKeyDown}
                onSend={() => onSend()}
                onStop={onStop}
              />
            </div>
          </main>
        </div>
      </div>
    </div>,
    document.body
  );
}
