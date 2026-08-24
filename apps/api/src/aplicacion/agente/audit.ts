import { db, schema } from "../../db/index.js";
import { sanitizeArgsForAudit } from "./sanitize.js";
import type { ActionResultStatus } from "./types.js";

// ============================================================
// Auditoría — cada tool call registra una fila en agent_actions
// clientName: "chat" | "mcp:opencode" | "mcp:claude" | ...
// El audit NUNCA rompe el flujo del agente (try/catch + warn).
// ============================================================

export interface AuditInput {
  userId: string;
  tool: string;
  args?: unknown;
  /** Campos de args que se persisten como "***" (piiFields del tool) */
  piiFields?: string[];
  resultStatus: ActionResultStatus;
  clientName?: string;
  errorMessage?: string;
}

export async function auditAgentAction(input: AuditInput): Promise<void> {
  try {
    await db.insert(schema.agentActions).values({
      userId: input.userId,
      tool: input.tool,
      argsSanitized: sanitizeArgsForAudit(input.args, input.piiFields) ?? null,
      resultStatus: input.resultStatus,
      clientName: input.clientName ?? "chat",
      errorMessage: input.errorMessage,
    });
  } catch (err) {
    console.warn("⚠️ agent_actions audit:", err instanceof Error ? err.message : err);
  }
}
