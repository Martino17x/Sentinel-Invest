import "./setup.js"; // ANTES de dotenv/config: IOL_PROVIDER=mock
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { executeTool } from "../../src/services/agent/executor.js";
import { createToolRegistry } from "../../src/services/agent/registry.js";
import type { ToolDefinition } from "../../src/services/agent/types.js";
import { createTestUser, deleteTestUser } from "./helpers.js";

// ============================================================
// Executor — gates de seguridad (spec §1)
//
// Nota: los caminos que pasan el gate de permiso (allow) resuelven
// la cuenta del usuario contra la BD local (modo mock devuelve la
// cuenta "demo" sin credenciales IOL — el suite no necesita
// credenciales reales, solo la Postgres de docker compose).
// ============================================================

function makeTool(overrides: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: "probe",
    description: "tool de prueba que rastrea si execute corrió",
    inputSchema: z.object({ n: z.number() }),
    permission: "allow",
    execute: async () => ({ ok: true, message: "ejecutado" }),
    ...overrides,
  };
}

test("executor: tool desconocido → error SIN ejecutar nada", async () => {
  const registry = createToolRegistry();
  const result = await executeTool({
    toolName: "no_existe",
    args: {},
    userId: "u-unknown-test",
    scope: "chat",
    registry,
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /Tool desconocido/);
});

test("executor: permiso exclude NUNCA llama a execute (stub de contrato)", async () => {
  let executed = false;
  const registry = createToolRegistry();
  registry.register(
    makeTool({
      name: "place_order_probe",
      permission: "exclude",
      execute: async () => {
        executed = true;
        return { ok: true, message: "nunca" };
      },
    })
  );

  const result = await executeTool({
    toolName: "place_order_probe",
    args: { symbol: "GGAL", side: "buy", qty: 10 },
    userId: "u-exclude-test",
    scope: "trade",
    registry,
    clientName: "mcp:test",
  });
  assert.equal(executed, false, "execute no debe correr jamás con exclude");
  assert.equal(result.ok, false);
  assert.match(result.message, /no está permitido/);
});

test("executor: args inválidos → validation_error sin ejecutar", async () => {
  let executed = false;
  const registry = createToolRegistry();
  registry.register(
    makeTool({
      execute: async () => {
        executed = true;
        return { ok: true, message: "nunca" };
      },
    })
  );

  const userId = await createTestUser("u-validation");
  try {
    const result = await executeTool({
      toolName: "probe",
      args: { n: "no-es-numero" },
      userId,
      scope: "read",
      registry,
    });
    assert.equal(executed, false);
    assert.equal(result.ok, false);
    assert.match(result.message, /Argumentos inválidos/);
  } finally {
    await deleteTestUser(userId);
  }
});

test("executor: allow ejecuta y devuelve el resultado del tool", async () => {
  const registry = createToolRegistry();
  registry.register(makeTool({}));

  const userId = await createTestUser("u-allow");
  try {
    const result = await executeTool({
      toolName: "probe",
      args: { n: 42 },
      userId,
      scope: "read",
      registry,
    });
    assert.equal(result.ok, true);
    assert.equal(result.message, "ejecutado");
  } finally {
    await deleteTestUser(userId);
  }
});
