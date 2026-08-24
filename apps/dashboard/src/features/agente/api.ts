/**
 * Feature `agente` — fuente única para agentApi + apiKeysApi.
 * Extraído de lib/api.ts (SDD dashboard-features-resto C6).
 * Mover, no duplicar. Importa apiFetch desde lib/api-client para evitar ciclo con shim.
 */

import { apiFetch } from "@/lib/api-client";

// ============================================================
// Agente — sesiones de chat persistidas (el streaming SSE vive
// en features/agente/lib/agent-chat.ts; acá solo gestión REST)
// ============================================================

export interface AgentSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string | null;
  toolCalls: unknown;
  createdAt: string;
}

export const agentApi = {
  async listSessions(): Promise<{ sessions: AgentSession[] }> {
    return apiFetch("/agent/sessions");
  },

  async getSession(
    id: string
  ): Promise<{ session: AgentSession; messages: AgentChatMessage[] }> {
    return apiFetch(`/agent/sessions/${id}`);
  },

  async deleteSession(id: string): Promise<void> {
    return apiFetch(`/agent/sessions/${id}`, { method: "DELETE" });
  },

  async approveOrder(id: string): Promise<{ ok: boolean; message: string }> {
    return apiFetch(`/agent/orders/${id}/approve`, { method: "POST" });
  },

  async rejectOrder(id: string): Promise<{ ok: boolean; message: string }> {
    return apiFetch(`/agent/orders/${id}/reject`, { method: "POST" });
  },
};

// ============================================================
// API Keys — claves personales para agentes externos (MCP).
// El secreto se devuelve UNA vez al crearla; el listado NUNCA
// incluye el hash ni el secreto (verifica server).
// ============================================================

export type ApiKeyScope = "read" | "trade";

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scope: ApiKeyScope;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export const apiKeysApi = {
  async list(): Promise<{ keys: ApiKeySummary[] }> {
    return apiFetch("/apikeys");
  },

  async create(input: {
    name: string;
    scope: ApiKeyScope;
  }): Promise<{ key: ApiKeySummary & { secret: string } }> {
    return apiFetch("/apikeys", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async revoke(id: string): Promise<{ key: ApiKeySummary }> {
    return apiFetch(`/apikeys/${id}/revoke`, { method: "POST" });
  },

  async enable(id: string): Promise<{ key: ApiKeySummary }> {
    return apiFetch(`/apikeys/${id}/enable`, { method: "POST" });
  },
};
