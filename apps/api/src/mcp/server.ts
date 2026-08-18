import {
  CLIENT_INFO_META_KEY,
  McpServer,
  type Implementation,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z as z4 } from "zod4";
import { executeTool } from "../services/agent/executor.js";
import type { ToolDefinition, ToolScope } from "../services/agent/types.js";
import { agentRegistry, type ToolRegistry } from "../services/agent/tools/index.js";
import { toZod4 } from "./zod4-adapter.js";

// ============================================================
// Factory MCP — expone los MISMOS tools del engine (registry,
// fuente ÚNICA) a clientes MCP externos, con zod4 + structuredContent.
//
// Per-request: `createSentinelMcpServer(auth)` registra SOLO los
// tools visibles para el scope de la key (read NO ve place_order).
// Cada tool call delega en el executor del engine: los gates de
// seguridad (permiso → cuenta → credenciales → validación zod v3
// → timeout 15s → sanitize → agent_actions) son idénticos al chat.
// ============================================================

export type McpScope = "read" | "trade";

export interface SentinelMcpAuth {
  userId: string;
  apiKeyId: string;
  scope: McpScope;
  /**
   * clientName del audit en agent_actions (ej: "mcp:stdio", "mcp:http").
   * Si el cliente manda clientInfo en el envelope moderno, se usa
   * `mcp:<nombre>` — si no, este fallback.
   */
  clientName: string;
}

/** Un tool de trading (contrato propuesto, ej: place_order) */
export function isTradeTool(def: ToolDefinition): boolean {
  return def.proposeOnly === true;
}

/** Filtro por scope: read excluye los tools de trading; trade ve todo */
export function toolsVisibleForScope(
  registry: ToolRegistry,
  scope: McpScope
): ToolDefinition[] {
  return registry.list().filter((t) => scope === "trade" || !isTradeTool(t));
}

/** clientInfo del envelope moderno (2026) si el cliente lo mandó */
function clientInfoName(ctx: ServerContext): string | undefined {
  // Los metadatos del envelope (incl. clientInfo) viven en `_meta`
  const meta = (ctx.mcpReq?._meta ?? {}) as Record<string, unknown>;
  const modern = meta[CLIENT_INFO_META_KEY] as Implementation | undefined;
  if (modern && typeof modern.name === "string" && modern.name.trim() !== "") {
    return modern.name;
  }
  const legacy = meta.clientInfo as { name?: unknown } | undefined;
  if (legacy && typeof legacy.name === "string" && legacy.name.trim() !== "") {
    return legacy.name;
  }
  return undefined;
}

const OUTPUT_SCHEMA = z4.object({
  ok: z4.boolean(),
  message: z4.string(),
});

/**
 * Crea un McpServer listo para conectar a un transporte, registrando
 * los tools del registry visibles para el scope de la key autenticada.
 */
export function createSentinelMcpServer(
  auth: SentinelMcpAuth,
  registry: ToolRegistry = agentRegistry
): McpServer {
  const server = new McpServer({
    name: "sentinel-invest",
    version: "0.1.0",
  });

  for (const tool of toolsVisibleForScope(registry, auth.scope)) {
    const inputSchema = toZod4(tool.inputSchema);

    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema,
        outputSchema: OUTPUT_SCHEMA,
      },
      async (args: unknown, ctx: ServerContext) => {
        const result = await executeTool({
          toolName: tool.name,
          args,
          userId: auth.userId,
          scope: auth.scope as ToolScope,
          registry,
          clientName: clientInfoName(ctx) ? `mcp:${clientInfoName(ctx)}` : auth.clientName,
        });

        return {
          content: [{ type: "text", text: result.message }],
          structuredContent: { ok: result.ok, message: result.message },
        };
      }
    );
  }

  return server;
}
