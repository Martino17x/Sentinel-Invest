import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { findApiKeyBySecret } from "../services/agent/apiKeys.js";
import { createSentinelMcpServer } from "./server.js";

// ============================================================
// MCP over stdio — entrypoint para clientes locales (opencode,
// Claude Desktop, etc.). La key se pasa por env:
//
//   SENTINEL_API_KEY=sk-sentinel-... npm run mcp
//
// Todo el logging va a STDERR (stdout es el transporte MCP — jamás
// escribir ahí). Sin key o key inválida → exit(1) con error en stderr.
// ============================================================

async function main(): Promise<void> {
  const secret = process.env.SENTINEL_API_KEY;
  if (!secret || secret.trim() === "") {
    console.error("SENTINEL_API_KEY no está definida en el entorno.");
    console.error("Creá una key en la app (Perfil → API Keys) y pasala: SENTINEL_API_KEY=sk-sentinel-... npm run mcp");
    process.exit(1);
  }

  const auth = await findApiKeyBySecret(secret.trim());
  if (!auth) {
    console.error("API key inválida, revocada o expirada. Creá una key nueva en la app (Perfil → API Keys).");
    process.exit(1);
  }

  const server = createSentinelMcpServer({
    userId: auth.userId,
    apiKeyId: auth.id,
    scope: auth.scope,
    clientName: "mcp:stdio",
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Sentinel MCP stdio listo (scope=${auth.scope})`);
}

main().catch((err) => {
  console.error("Sentinel MCP stdio:", err instanceof Error ? err.message : err);
  process.exit(1);
});
