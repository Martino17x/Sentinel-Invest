import type { RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { findApiKeyBySecret } from "../services/agent/apiKeys.js";
import type { McpScope } from "./server.js";

// ============================================================
// Auth MCP — Bearer sk-sentinel-* contra la tabla api_keys
//
// - `Authorization: Bearer <secret>` → hash SHA-256 → lookup
//   timing-safe (findApiKeyBySecret, double-check en el servicio).
// - Rechaza (401) keys inexistentes, revocadas, expiradas o
//   deshabilitadas; actualiza lastUsedAt sin romper el flujo.
// - Ata al request `req.mcp = { userId, apiKeyId, scope }`, que
//   la factory usa para filtrar tools/list y el límite por key.
// ============================================================

export interface McpAuthInfo {
  userId: string;
  apiKeyId: string;
  scope: McpScope;
}

declare global {
  namespace Express {
    interface Request {
      mcp?: McpAuthInfo;
    }
  }
}

function unauthorized(res: Response): void {
  res.setHeader("WWW-Authenticate", "Bearer");
  res.status(401).json({ error: "invalid_api_key", message: "API key inválida, revocada o expirada" });
}

export const requireMcpApiKey: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  const token = match?.[1]?.trim();

  if (!token) {
    unauthorized(res);
    return;
  }

  try {
    const auth = await findApiKeyBySecret(token);
    if (!auth) {
      unauthorized(res);
      return;
    }

    req.mcp = {
      userId: auth.userId,
      apiKeyId: auth.id,
      scope: auth.scope,
    };

    // lastUsedAt — fire-and-forget: NUNCA debe romper la autenticación
    db.update(schema.apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKeys.id, auth.id))
      .catch(() => undefined);

    next();
  } catch (err) {
    console.error("⚠️ MCP auth:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "internal_error", message: "Error interno al autenticar" });
  }
};
