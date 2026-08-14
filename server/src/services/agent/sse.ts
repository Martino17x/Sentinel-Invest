import type { ServerResponse } from "node:http";

// ============================================================
// SSE tipado — contrato de eventos del chat del agente
//
// Contrato (spec §1 + design):
//   session    { sessionId }
//   delta      { text }
//   tool_call  { id, name, args }          // args sanitizados
//   tool_start { id, name }
//   tool_end   { id, name, status, summary }
//   done       { sessionId, messageId, usage? }
//   error      { code, message, fatal? }
//
// Formato: `data: {json}\n\n` + keepalive `: ping` cada 15s.
// Express 5: writeHead + flushHeaders ANTES de cualquier trabajo
// async; res.flush() si existe (middleware de compresión).
// ============================================================

export type AgentToolEndStatus =
  | "success"
  | "error"
  | "timeout"
  | "excluded"
  | "needs_approval"
  | "unknown_tool"
  | "validation_error"
  | "account_error";

export type AgentSseEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; id: string; name: string; args: object }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_end"; id: string; name: string; status: AgentToolEndStatus; summary: string }
  | { type: "done"; sessionId: string; messageId: string; usage?: { input: number; output: number } }
  | { type: "error"; code: string; message: string; fatal?: boolean };

export const KEEPALIVE_INTERVAL_MS = 15_000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Evita buffering de proxies intermedios (ngrok, nginx, Cloudflare)
  "X-Accel-Buffering": "no",
} as const;

export class SseWriter {
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private finished = false;

  constructor(private res: ServerResponse) {}

  /** writeHead + flushHeaders — SIEMPRE antes del trabajo async (Express 5) */
  open(): void {
    if (this.res.headersSent) return;
    this.res.writeHead(200, SSE_HEADERS);
    this.res.flushHeaders();
  }

  send(event: AgentSseEvent): void {
    if (this.finished || this.res.destroyed) return;
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
    this.flush();
  }

  keepalive(): void {
    if (this.finished || this.res.destroyed) return;
    this.res.write(`: ping\n\n`);
    this.flush();
  }

  startKeepalive(intervalMs: number = KEEPALIVE_INTERVAL_MS): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => this.keepalive(), intervalMs);
    this.keepaliveTimer.unref?.();
  }

  stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  end(): void {
    this.stopKeepalive();
    this.finished = true;
    if (!this.res.destroyed && !this.res.writableEnded) {
      this.res.end();
    }
  }

  private flush(): void {
    const res = this.res as ServerResponse & { flush?: () => void };
    if (typeof res.flush === "function") {
      res.flush();
    }
  }
}
