import type { Express, NextFunction } from "express";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { createMcpHandler, type McpServerFactory } from "@modelcontextprotocol/server";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { requireMcpApiKey } from "./auth.js";
import { createMcpRateLimiter, mcpRateLimit, type McpRateLimiter } from "./limits.js";
import { createSentinelMcpServer, type McpScope, type SentinelMcpAuth } from "./server.js";

// ============================================================
// MCP over Streamable HTTP — montaje en `/mcp` del Express existente
//
// createMcpExpressApp({ host: "localhost" }) aporta la validación
// de DNS rebinding (Host header) y de Origin (browsers) automática;
// auth por API key sk-sentinel-*; rate limits por key; y el handler
// MCP v2 (createMcpHandler) sirve tráfico moderno (2026 envelope) y
// legacy 2025 (stateless) en el mismo endpoint.
//
// La factory es PER-REQUEST: el scope de la key autenticada decide
// qué tools se registran (read NO lista place_order).
// ============================================================

/** Convierte el request de Express a un Request web-standard para el handler MCP */
function expressReqToFetch(req: ExpressRequest): Request {
  const url = new URL(req.originalUrl, `http://${req.hostname ?? "localhost"}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
  }

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
    body = JSON.stringify(req.body);
  }

  return new Request(url, { method: req.method, headers, body });
}

/** Stream del body de la Response web-standard hacia la respuesta Express */
async function pipeBody(response: Response, res: ExpressResponse): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) res.write(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
}

/** Factory per-request: construye el McpServer con el scope de la key */
function makeFactory(): McpServerFactory {
  return (ctx) => {
    const extra = ctx.authInfo?.extra as Partial<SentinelMcpAuth> | undefined;
    const scope: McpScope = ctx.authInfo?.scopes?.includes("trade") ? "trade" : "read";
    return createSentinelMcpServer({
      userId: typeof extra?.userId === "string" ? extra.userId : "",
      apiKeyId: ctx.authInfo?.clientId ?? "anon",
      scope,
      clientName: "mcp:http",
    });
  };
}

export interface MountMcpHttpOptions {
  /** Inyectable para tests (límites chicos → 429 rápido) */
  rateLimiter?: McpRateLimiter;
}

/**
 * Monta /mcp en la app Express existente. Llamada desde index.ts
 * SOLO si el kill switch AGENT_ENABLED está activo (rollback 2 líneas).
 */
export function mountMcpHttp(app: Express, options?: MountMcpHttpOptions): void {
  const limiter = options?.rateLimiter ?? createMcpRateLimiter();

  const mcpHandler = createMcpHandler(makeFactory(), {
    legacy: "stateless",
    onerror: (err) => console.error("⚠️ MCP handler:", err instanceof Error ? err.message : err),
  });

  const mcpApp = createMcpExpressApp({
    // localhost: valida Host header + Origin (DNS rebinding) automáticamente
    host: "localhost",
  });

  // Orden: auth (401) → rate limit (429) → handler MCP
  mcpApp.use(requireMcpApiKey);
  mcpApp.use(mcpRateLimit(limiter));
  mcpApp.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    try {
      const response = await mcpHandler.fetch(expressReqToFetch(req), {
        authInfo: req.mcp
          ? {
              token: "sentinel-mcp",
              clientId: req.mcp.apiKeyId,
              scopes: [req.mcp.scope],
              extra: { userId: req.mcp.userId, apiKeyId: req.mcp.apiKeyId },
            }
          : undefined,
        parsedBody: req.body,
      });

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      await pipeBody(response, res);
      res.end();
    } catch (err) {
      next(err);
    }
  });

  app.use("/mcp", mcpApp);
}
