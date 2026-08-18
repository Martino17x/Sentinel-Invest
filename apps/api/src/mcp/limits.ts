import type { RequestHandler } from "express";
import { agentRegistry } from "../services/agent/tools/index.js";
import { isTradeTool } from "./server.js";

// ============================================================
// Rate limits MCP â€” token bucket por API key
//
// - Bucket general: 30 req/min (inicializaciÃ³n, tools/list,
//   ping, tools/call de tools read).
// - Bucket de trading: 5/min ADICIONALES cuando el request es
//   `tools/call` de un tool de trading (place_order).
// - 429 con header Retry-After al superar cualquiera de los dos.
// Los lÃ­mites son configurables para tests (smoke con lÃ­mites chicos).
// ============================================================

export interface McpRateLimits {
  generalPerMinute: number;
  tradePerMinute: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Segundos hasta poder reintentar (0 si allowed) */
  retryAfterSeconds: number;
}

export interface McpRateLimiter {
  check(key: string, isTradeCall: boolean, now?: number): RateLimitVerdict;
  /** Para tests: drena todos los buckets */
  reset(): void;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

function refillMsFor(capacity: number): number {
  return 60_000 / capacity;
}

function retryAfterSeconds(bucket: Bucket, capacity: number): number {
  const missing = 1 - bucket.tokens;
  if (missing <= 0) return 1;
  return Math.max(1, Math.ceil((missing * refillMsFor(capacity)) / 1000));
}

export function createMcpRateLimiter(limits?: Partial<McpRateLimits>): McpRateLimiter {
  const cfg: McpRateLimits = {
    generalPerMinute: 30,
    tradePerMinute: 5,
    ...limits,
  };
  const buckets = new Map<string, Bucket>();

  function take(bucketKey: string, capacity: number, now: number): boolean {
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      buckets.set(bucketKey, bucket);
    }
    const elapsed = Math.max(0, now - bucket.lastRefill);
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed / refillMsFor(capacity));
    bucket.lastRefill = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  function generalKey(key: string): string {
    return `g:${key}`;
  }

  function tradeKey(key: string): string {
    return `t:${key}`;
  }

  return {
    check(key, isTradeCall, now = Date.now()) {
      const gKey = generalKey(key);
      if (!take(gKey, cfg.generalPerMinute, now)) {        return {
          allowed: false,
          retryAfterSeconds: retryAfterSeconds(buckets.get(gKey)!, cfg.generalPerMinute),
        };
      }
      if (isTradeCall) {
        const tKey = tradeKey(key);
        if (!take(tKey, cfg.tradePerMinute, now)) {
          return {
            allowed: false,
            retryAfterSeconds: retryAfterSeconds(buckets.get(tKey)!, cfg.tradePerMinute),
          };
        }
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset() {
      buckets.clear();
    },
  };
}

/** Â¿El request es un tools/call de un tool de trading? (postura del body JSON-RPC) */
function isTradeCallRequest(req: { method: string; body?: unknown }): boolean {
  if (req.method !== "POST") return false;
  const body = (req.body ?? {}) as { method?: unknown; params?: { name?: unknown } };
  if (body.method !== "tools/call") return false;
  const name = body.params?.name;
  if (typeof name !== "string" || name === "") return false;
  const tool = agentRegistry.lookup(name);
  return tool !== undefined && isTradeTool(tool);
}

/** Middleware Express: 429 con Retry-After al superar el lÃ­mite */
export function mcpRateLimit(limiter: McpRateLimiter): RequestHandler {
  return (req, res, next) => {
    const key = req.mcp?.apiKeyId ?? "anon";
    const verdict = limiter.check(key, isTradeCallRequest(req));
    if (!verdict.allowed) {
      res.setHeader("Retry-After", String(verdict.retryAfterSeconds));
      res.status(429).json({
        error: "rate_limit_exceeded",
        message: "Demasiadas solicitudes: intentÃ¡ de nuevo en unos segundos",
        retryAfter: verdict.retryAfterSeconds,
      });
      return;
    }
    next();
  };
}

