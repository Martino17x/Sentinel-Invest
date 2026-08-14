import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { createToolRegistry } from "../../src/services/agent/registry.js";
import { checkPermission } from "../../src/services/agent/permissions.js";
import type { ToolDefinition } from "../../src/services/agent/types.js";
import { placeOrderTool } from "../../src/services/agent/tools/placeOrder.js";
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

test("place_order es el ÚNICO tool de trading del registry", () => {
  assert.equal(isTradeTool(placeOrderTool), true);
  for (const tool of agentRegistry.list()) {
    if (tool.name === "place_order") continue;
    assert.equal(isTradeTool(tool), false, `${tool.name} no debería ser trade`);
  }
});

test("toolsVisibleForScope: read oculta place_order, trade lo lista", () => {
  const read = toolsVisibleForScope(agentRegistry, "read");
  const trade = toolsVisibleForScope(agentRegistry, "trade");

  assert.equal(read.length, 5);
  assert.equal(trade.length, 6);
  assert.equal(read.some((t) => t.name === "place_order"), false);
  assert.equal(trade.some((t) => t.name === "place_order"), true);
  for (const t of read) {
    assert.ok(trade.some((x) => x.name === t.name), `${t.name} debería estar en trade`);
  }
});
