import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createToolRegistry } from "../../src/services/agent/registry.js";
import { checkPermission } from "../../src/services/agent/permissions.js";
import type { ToolDefinition } from "../../src/services/agent/types.js";
import {
  agentRegistry,
} from "../../src/services/agent/tools/index.js";
import { isTradeTool, toolsVisibleForScope } from "../../src/mcp/server.js";

function fakeTool(overrides: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: "fake_tool",
    description: "tool de prueba",
    inputSchema: z.object({}),
    permission: "allow",
    execute: async () => ({ ok: true, message: "ok" }),
    ...overrides,
  };
}

test("registry: valida nombres duplicados (fail-fast)", () => {
  const registry = createToolRegistry();
  registry.register(fakeTool({ name: "dup" }));
  assert.throws(() => registry.register(fakeTool({ name: "dup" })), /duplicado/);
});

test("registry: rechaza permiso inválido y definiciones incompletas", () => {
  const registry = createToolRegistry();
  assert.throws(() => registry.register(fakeTool({ permission: "banana" as never })), /permiso/);
  assert.throws(() => registry.register(fakeTool({ name: "" })), /nombre/);
  assert.throws(
    () => registry.register(fakeTool({ execute: undefined as never })),
    /execute/
  );
});

test("checkPermission: exclude y ask NUNCA habilitan; allow sí", () => {
  const exclude = checkPermission(fakeTool({ permission: "exclude" }), "read");
  assert.equal(exclude.allowed, false);
  assert.equal(exclude.code, "excluded");

  const ask = checkPermission(fakeTool({ permission: "ask" }), "trade");
  assert.equal(ask.allowed, false);
  assert.equal(ask.code, "needs_approval");

  const allow = checkPermission(fakeTool({ permission: "allow" }), "chat");
  assert.equal(allow.allowed, true);
});

const TRADE_TOOLS = ["place_order", "cancel_order", "subscribe_fci", "rescue_fci"];

test("los tools de trading (place_order, cancel_order, fci) son los ÚNICOS trade del registry", () => {
  for (const name of TRADE_TOOLS) {
    const tool = agentRegistry.lookup(name);
    assert.ok(tool, `${name} debería estar registrado`);
    assert.equal(isTradeTool(tool!), true, `${name} debería ser trade`);
  }
  for (const tool of agentRegistry.list()) {
    if (TRADE_TOOLS.includes(tool.name)) continue;
    assert.equal(isTradeTool(tool), false, `${tool.name} no debería ser trade`);
  }
});

test("toolsVisibleForScope: read oculta los tools de trading, trade los lista", () => {
  const read = toolsVisibleForScope(agentRegistry, "read");
  const trade = toolsVisibleForScope(agentRegistry, "trade");

  // DOMAIN_TOOLS = 31 total; 4 con proposeOnly (place_order, cancel_order, subscribe_fci, rescue_fci)
  // read ve 27 (31-4), trade ve 31. Estos números fallarán si se agregan tools sin actualizar el test:
  // preferir aserción derivada + hardcode como guardrail documental.
  assert.equal(agentRegistry.list().length, 31);
  assert.equal(trade.length, 31);
  assert.equal(read.length, 27);
  assert.equal(read.length, trade.length - TRADE_TOOLS.length);
  for (const name of TRADE_TOOLS) {
    assert.equal(read.some((t) => t.name === name), false, `${name} no debería estar en read`);
    assert.equal(trade.some((t) => t.name === name), true, `${name} debería estar en trade`);
  }
  for (const t of read) {
    assert.ok(trade.some((x) => x.name === t.name), `${t.name} debería estar en trade`);
  }
});
