import { ALLOWED_PERMISSIONS } from "./permissions.js";
import type { ToolDefinition } from "./types.js";

// ============================================================
// Registry — fuente ÚNICA de definiciones de tools
// (compartida entre el engine y la capa MCP). Validación fail-fast.
// ============================================================

export interface ToolRegistry {
  register(def: ToolDefinition): void;
  lookup(name: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
  names(): string[];
}

/**
 * Crea un registry vacío con validación en registro:
 * nombre no vacío y ÚNICO, descripción, execute, inputSchema y permiso válido.
 * Fallar en registro = error de programación → throw.
 */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>();

  function validate(def: ToolDefinition): void {
    if (!def.name || def.name.trim() === "") {
      throw new Error("Tool sin nombre: todo tool necesita un name no vacío");
    }
    if (tools.has(def.name)) {
      throw new Error(`Tool duplicado en el registry: ${def.name}`);
    }
    if (!def.description || def.description.trim() === "") {
      throw new Error(`Tool "${def.name}" sin description`);
    }
    if (typeof def.execute !== "function") {
      throw new Error(`Tool "${def.name}" sin execute(ctx, args)`);
    }
    if (!def.inputSchema) {
      throw new Error(`Tool "${def.name}" sin inputSchema (zod)`);
    }
    if (!ALLOWED_PERMISSIONS.includes(def.permission)) {
      throw new Error(
        `Tool "${def.name}" con permiso inválido: ${String(def.permission)} (allow|ask|exclude)`
      );
    }
  }

  return {
    register(def) {
      validate(def);
      tools.set(def.name, def);
    },
    lookup(name) {
      return tools.get(name);
    },
    list() {
      return [...tools.values()];
    },
    names() {
      return [...tools.keys()];
    },
  };
}
