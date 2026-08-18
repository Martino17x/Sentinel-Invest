import { getIolCredentials } from "../../lib/iol-credentials.js";
import { getAccountForUser } from "./account.js";
import { auditAgentAction } from "./audit.js";
import { checkPermission } from "./permissions.js";
import type { ToolRegistry } from "./registry.js";
import { sanitizeToolResult } from "./sanitize.js";
import type { ActionResultStatus, ToolResult, ToolScope } from "./types.js";

// ============================================================
// Executor — dispatch de tool calls con security gates
//
// Orden por tool call:
//   1. lookup en registry (unknown → tool_error sin side effects)
//   2. permiso allow/ask/exclude (exclude/ask NUNCA ejecutan)
//   3. userId → cuenta (multitenant: SOLO la cuenta del usuario)
//   4. credenciales IOL del usuario (mock → vacías)
//   5. validación de args contra el schema zod del tool
//   6. ejecución con timeout de 15s (AbortController, sin contexto parcial)
//   7. sanitización del resultado (anti prompt-injection) + fila agent_actions
// ============================================================

const TOOL_TIMEOUT_MS = 15_000;

export interface ExecuteToolOptions {
  toolName: string;
  args: unknown;
  userId: string;
  scope: ToolScope;
  registry: ToolRegistry;
  /** "chat" | "mcp:opencode" | ... — se persiste en agent_actions */
  clientName?: string;
}

export async function executeTool(options: ExecuteToolOptions): Promise<ToolResult> {
  const { toolName, args, userId, scope, registry } = options;
  const clientName = options.clientName ?? "chat";

  // Gate 1: tool registrado
  const tool = registry.lookup(toolName);
  if (!tool) {
    await auditAgentAction({
      userId,
      tool: toolName,
      args,
      resultStatus: "unknown_tool",
      clientName,
      errorMessage: "Tool no registrado",
    });
    return { ok: false, message: `Tool desconocido: ${toolName}. Usá solo los tools de la lista provista.` };
  }

  // Gate 2: permiso (exclude/ask → tool_error SIN efecto lateral)
  const verdict = checkPermission(tool, scope);
  if (!verdict.allowed) {
    await auditAgentAction({
      userId,
      tool: toolName,
      args,
      piiFields: tool.piiFields,
      resultStatus: verdict.code === "excluded" ? "excluded" : "needs_approval",
      clientName,
      errorMessage: verdict.reason,
    });
    return { ok: false, message: verdict.reason };
  }

  // Gate 3: userId → cuenta (multitenant)
  const accountResult = await getAccountForUser(userId);
  if (!accountResult.ok) {
    await auditAgentAction({
      userId,
      tool: toolName,
      args,
      piiFields: tool.piiFields,
      resultStatus: "account_error",
      clientName,
      errorMessage: accountResult.message,
    });
    return { ok: false, message: accountResult.message };
  }

  // Gate 4: credenciales del usuario (en mock son vacías y el provider las ignora)
  const creds = await getIolCredentials(userId);

  // Gate 5: validación de args contra el schema del tool
  const parsed = tool.inputSchema.safeParse(args);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? "Argumentos inválidos";
    await auditAgentAction({
      userId,
      tool: toolName,
      args,
      piiFields: tool.piiFields,
      resultStatus: "validation_error",
      clientName,
      errorMessage: detail,
    });
    return { ok: false, message: `Argumentos inválidos para ${toolName}: ${detail}` };
  }

  // Gate 6: ejecución con timeout por tool (sin contexto parcial)
  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  let timedOut = false;

  const timeoutPromise = new Promise<ToolResult>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve({
        ok: false,
        message: `El tool "${toolName}" tardó más de ${TOOL_TIMEOUT_MS / 1000}s y fue abortado`,
      });
    }, TOOL_TIMEOUT_MS);
  });

  const ctx = {
    userId,
    scope,
    account: accountResult.account,
    creds,
    signal: controller.signal,
  };

  let result: ToolResult;
  try {
    result = await Promise.race([tool.execute(ctx, parsed.data), timeoutPromise]);
  } catch (err) {
    result = {
      ok: false,
      message: err instanceof Error ? err.message : `El tool "${toolName}" falló sin mensaje`,
    };
  }
  clearTimeout(timeoutHandle);

  // Gate 7: sanitizar (anti prompt-injection) + auditoría
  const message = sanitizeToolResult(result.message);
  const status: ActionResultStatus = timedOut ? "timeout" : result.ok ? "success" : "error";

  await auditAgentAction({
    userId,
    tool: toolName,
    args,
    piiFields: tool.piiFields,
    resultStatus: status,
    clientName,
    errorMessage: result.ok || timedOut ? undefined : message.slice(0, 800),
  });

  return { ok: result.ok, message };
}
