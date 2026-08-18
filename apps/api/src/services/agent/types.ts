import type { z } from "zod";
import type { IolCredentials } from "../iol/types.js";

// ============================================================
// Tipos compartidos del motor de agente
// (engine + capa MCP: definiciones ÚNICAS de tools)
// ============================================================

export type ToolPermission = "allow" | "ask" | "exclude";

/** Origen de la invocación: chat UI | MCP scope read | MCP scope trade */
export type ToolScope = "chat" | "read" | "trade";

/** Resultado final que el LLM ve — SIEMPRE texto plano sanitizado */
export interface ToolResult {
  ok: boolean;
  message: string;
}

/**
 * Contexto de una tool call. El executor resuelve cuenta + credenciales
 * ANTES de despachar (gate multitenant) y lo entrega vía ctx; los tools
 * NUNCA vuelven a resolver el usuario → cuenta por su cuenta.
 */
export interface ToolContext {
  userId: string;
  scope: ToolScope;
  account: { id: string; iolAccountNumber: string; currency: string };
  creds: IolCredentials;
  /** AbortController del timeout por tool — los fetch upstream lo respetan */
  signal: AbortSignal;
}

/**
 * Definición de un tool. La instancia zod ES la del engine (v3.25) —
 * la capa MCP la adapta a zod4 en un módulo aparte. NUNCA mezclar.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  permission: ToolPermission;
  /** Contrato (ej: place_order): se lista/describe pero NUNCA ejecuta */
  proposeOnly?: boolean;
  /** Campos de args que jamás se persisten en agent_actions ("***") */
  piiFields?: string[];
  execute(ctx: ToolContext, args: unknown): Promise<ToolResult>;
}

/** Estados de auditoría de una tool call en agent_actions */
export type ActionResultStatus =
  | "success"
  | "error"
  | "timeout"
  | "excluded"
  | "needs_approval"
  | "unknown_tool"
  | "validation_error"
  | "account_error";
