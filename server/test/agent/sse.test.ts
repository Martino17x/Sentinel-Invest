import { test } from "node:test";
import assert from "node:assert/strict";
import type { ServerResponse } from "node:http";
import { SseWriter } from "../../src/services/agent/sse.js";

// ============================================================
// Contrato SSE del server (spec §1): `data: {json}\n\n`,
// keepalive `: ping`, sin eventos tras end/destroyed.
// ============================================================

interface FakeRes {
  headersSent: boolean;
  destroyed: boolean;
  writableEnded: boolean;
  writtenHead?: { code: number; headers: Record<string, string> };
  chunks: string[];
  writeHead(code: number, headers: Record<string, string>): void;
  flushHeaders(): void;
  write(chunk: string): boolean;
  end(): void;
}

function makeFakeRes(): FakeRes {
  const res: FakeRes = {
    headersSent: false,
    destroyed: false,
    writableEnded: false,
    chunks: [],
    writeHead(code, headers) {
      res.headersSent = true;
      res.writtenHead = { code, headers };
    },
    flushHeaders() {},
    write(chunk) {
      res.chunks.push(String(chunk));
      return true;
    },
    end() {
      res.writableEnded = true;
    },
  };
  return res;
}

test("SseWriter: open setea 200 + headers de event-stream", () => {
  const fake = makeFakeRes();
  const sse = new SseWriter(fake as unknown as ServerResponse);
  sse.open();
  assert.equal(fake.writtenHead?.code, 200);
  assert.equal(fake.writtenHead?.headers["Content-Type"], "text/event-stream; charset=utf-8");
  assert.equal(fake.writtenHead?.headers["Cache-Control"], "no-cache, no-transform");
});

test("SseWriter: send emite `data: {json}\\n\\n` exacto", () => {
  const fake = makeFakeRes();
  const sse = new SseWriter(fake as unknown as ServerResponse);
  sse.open();
  sse.send({ type: "delta", text: "hola" });
  sse.send({ type: "done", sessionId: "s-1", messageId: "m-1", usage: { input: 1, output: 2 } });
  assert.deepEqual(fake.chunks, [
    'data: {"type":"delta","text":"hola"}\n\n',
    'data: {"type":"done","sessionId":"s-1","messageId":"m-1","usage":{"input":1,"output":2}}\n\n',
  ]);
});

test("SseWriter: keepalive emite `: ping\\n\\n`", () => {
  const fake = makeFakeRes();
  const sse = new SseWriter(fake as unknown as ServerResponse);
  sse.open();
  sse.keepalive();
  assert.deepEqual(fake.chunks, [": ping\n\n"]);
});

test("SseWriter: end corta todo — sin eventos después de finalizar", () => {
  const fake = makeFakeRes();
  const sse = new SseWriter(fake as unknown as ServerResponse);
  sse.open();
  sse.send({ type: "session", sessionId: "s-1" });
  sse.end();
  sse.send({ type: "delta", text: "tarde" });
  assert.equal(fake.writableEnded, true);
  assert.equal(fake.chunks.length, 1);
});

test("SseWriter: res destruido → no escribe", () => {
  const fake = makeFakeRes();
  fake.destroyed = true;
  const sse = new SseWriter(fake as unknown as ServerResponse);
  sse.open();
  sse.send({ type: "delta", text: "x" });
  sse.end();
  assert.equal(fake.chunks.length, 0);
});
