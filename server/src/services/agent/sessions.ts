import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { stripControlChars } from "./sanitize.js";

// ============================================================
// Sesiones de chat — persistencia sobre ai_chat_sessions /
// ai_chat_messages (multitenant por userId en CADA query).
//
// El historial del LLM se reconstruye SIEMPRE desde la BD:
// últimos HISTORY_MESSAGE_CAP mensajes, cada uno recortado a
// HISTORY_CONTENT_CAP chars (NFR-Rendimiento, spec §1).
// ============================================================

export const HISTORY_MESSAGE_CAP = 20;
export const HISTORY_CONTENT_CAP = 2_000;

export interface SessionRef {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolCalls: unknown;
  createdAt: Date;
}

/** Verifica propiedad de la sesión (multitenant) */
export async function getSessionOwned(sessionId: string, userId: string): Promise<SessionRef | null> {
  const [session] = await db
    .select()
    .from(schema.aiChatSessions)
    .where(and(eq(schema.aiChatSessions.id, sessionId), eq(schema.aiChatSessions.userId, userId)));
  return session ?? null;
}

/** Crea una sesión nueva con título derivado del primer mensaje */
export async function createSession(userId: string, firstMessage: string): Promise<SessionRef> {
  const [session] = await db
    .insert(schema.aiChatSessions)
    .values({ userId, title: deriveTitle(firstMessage) })
    .returning();
  return session;
}

/** Lista de sesiones del usuario (más recientes primero) con conteo de mensajes */
export async function listSessions(
  userId: string
): Promise<(SessionRef & { messageCount: number })[]> {
  const sessions = await db
    .select()
    .from(schema.aiChatSessions)
    .where(eq(schema.aiChatSessions.userId, userId))
    .orderBy(desc(schema.aiChatSessions.updatedAt));

  const counts = await db
    .select({ sessionId: schema.aiChatMessages.sessionId })
    .from(schema.aiChatMessages)
    .innerJoin(schema.aiChatSessions, eq(schema.aiChatSessions.id, schema.aiChatMessages.sessionId))
    .where(eq(schema.aiChatSessions.userId, userId));

  const countBySession = new Map<string, number>();
  for (const row of counts) {
    countBySession.set(row.sessionId, (countBySession.get(row.sessionId) ?? 0) + 1);
  }

  return sessions.map((s) => ({ ...s, messageCount: countBySession.get(s.id) ?? 0 }));
}

/** Mensajes de una sesión (verifica propiedad). null = no encontrada / no es del user */
export async function getSessionMessages(
  sessionId: string,
  userId: string
): Promise<{ session: SessionRef; messages: ChatMessage[] } | null> {
  const session = await getSessionOwned(sessionId, userId);
  if (!session) return null;

  const messages = await db
    .select()
    .from(schema.aiChatMessages)
    .where(eq(schema.aiChatMessages.sessionId, sessionId))
    .orderBy(desc(schema.aiChatMessages.createdAt))
    .limit(200);

  return {
    session,
    messages: messages.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      createdAt: m.createdAt,
    })),
  };
}

/** Borra la sesión (cascada: mensajes via FK) — solo si es del usuario */
export async function deleteSession(sessionId: string, userId: string): Promise<"deleted" | "not_found"> {
  const [deleted] = await db
    .delete(schema.aiChatSessions)
    .where(and(eq(schema.aiChatSessions.id, sessionId), eq(schema.aiChatSessions.userId, userId)))
    .returning({ id: schema.aiChatSessions.id });
  return deleted ? "deleted" : "not_found";
}

/** Persiste un mensaje en la sesión y devuelve el row (messageId para done) */
export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant" | "tool",
  content: string,
  toolCalls?: unknown
): Promise<{ id: string }> {
  const sanitizedCalls = toolCalls === undefined ? undefined : sanitizeToolCallsForDb(toolCalls);

  const [message] = await db
    .insert(schema.aiChatMessages)
    .values({ sessionId, role, content, toolCalls: sanitizedCalls })
    .returning({ id: schema.aiChatMessages.id });

  await db
    .update(schema.aiChatSessions)
    .set({ updatedAt: new Date() })
    .where(eq(schema.aiChatSessions.id, sessionId));

  return message;
}

/**
 * Historial para el LLM: últimos 20 mensajes user/assistant con texto
 * (los assistant con tool_calls se reconstruyen SIN las calls: su texto
 * final se preserva y la conversación queda válida para chat.completions).
 */
export async function loadChatHistory(
  sessionId: string
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const rows = await db
    .select()
    .from(schema.aiChatMessages)
    .where(eq(schema.aiChatMessages.sessionId, sessionId))
    .orderBy(desc(schema.aiChatMessages.createdAt))
    .limit(HISTORY_MESSAGE_CAP);

  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const row of rows.reverse()) {
    if (row.role === "tool") continue;
    const content = (row.content ?? "").slice(0, HISTORY_CONTENT_CAP);
    if (!content.trim()) continue;
    history.push({ role: row.role as "user" | "assistant", content });
  }
  return history;
}

/** Título automático: primera oración del primer mensaje (máx 60 chars) */
export function deriveTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentence = clean.split(/[.!?]\s/)[0]?.trim() ?? "";
  const title = sentence.length > 60 ? `${sentence.slice(0, 60)}…` : sentence;
  return title || "Nueva conversación";
}

/** Tool calls del LLM → jsonb limpio (sin control chars) para la BD */
function sanitizeToolCallsForDb(toolCalls: unknown): unknown {
  try {
    return JSON.parse(stripControlChars(JSON.stringify(toolCalls)));
  } catch {
    return null;
  }
}
