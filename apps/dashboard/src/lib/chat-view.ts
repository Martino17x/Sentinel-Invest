// ============================================================
// Preferencia de vista del chat del asistente: drawer lateral
// vs. modal pantalla completa (patrón Synara).
//
// - localStorage key 'sentinel-chat-view' ('drawer' | 'modal',
//   default 'drawer')
// - Custom event 'sentinel:chat-view-changed' para sincronizar
//   cualquier instancia que comparta la preferencia.
// ============================================================

export type ChatView = "drawer" | "modal";

export const CHAT_VIEW_KEY = "sentinel-chat-view";
export const CHAT_VIEW_CHANGED_EVENT = "sentinel:chat-view-changed";

export function getChatViewPreference(): ChatView {
  if (typeof window === "undefined") return "drawer";
  try {
    return window.localStorage.getItem(CHAT_VIEW_KEY) === "modal" ? "modal" : "drawer";
  } catch {
    return "drawer";
  }
}

export function setChatViewPreference(view: ChatView): void {
  try {
    window.localStorage.setItem(CHAT_VIEW_KEY, view);
  } catch {
    // localStorage no disponible (modo privado) → solo el evento
  }
  window.dispatchEvent(new CustomEvent<ChatView>(CHAT_VIEW_CHANGED_EVENT, { detail: view }));
}
