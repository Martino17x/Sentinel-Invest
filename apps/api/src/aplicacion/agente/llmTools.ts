import type { z } from "zod";
import type { ToolDefinition } from "./types.js";

// ============================================================
// Adaptador ToolDefinition → formato de tools del LLM (OpenAI)
//
// Convierte los schemas zod v3 del engine a JSON Schema para
// chat.completions (OpenRouter vía SDK openai). El engine valida
// SIEMPRE con el zod REAL en el executor; este JSON Schema es
// solo la descripción que ve el LLM. Fallo de conversión =
// error de programación → throw (fail-fast).
// ============================================================

export interface LlmTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

type ZodDef = { typeName?: string };

/** Unwrap de wrappers que no cambian el tipo base */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  const typeName = (schema._def as ZodDef).typeName;
  if (typeName === "ZodDefault" || typeName === "ZodOptional" || typeName === "ZodEffects") {
    return unwrap((schema._def as { innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny }).innerType ?? (schema._def as { schema?: z.ZodTypeAny }).schema ?? schema);
  }
  return schema;
}

function isOptionalLike(schema: z.ZodTypeAny): boolean {
  const typeName = (schema._def as ZodDef).typeName;
  return typeName === "ZodDefault" || typeName === "ZodOptional" || typeName === "ZodNullable";
}

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const typeName = (schema._def as ZodDef).typeName;

  if (typeName === "ZodNullable") {
    return { ...zodToJsonSchema((schema._def as { innerType: z.ZodTypeAny }).innerType), nullable: true };
  }
  if (typeName === "ZodDefault" || typeName === "ZodOptional" || typeName === "ZodEffects") {
    return zodToJsonSchema(unwrap(schema));
  }

  switch (typeName) {
    case "ZodString": {
      const out: Record<string, unknown> = { type: "string" };
      for (const check of (schema._def as { checks?: { kind: string; value?: number }[] }).checks ?? []) {
        if (check.kind === "min" && (check.value ?? 0) > 0) out.minLength = check.value;
        if (check.kind === "max") out.maxLength = check.value;
      }
      return out;
    }
    case "ZodNumber": {
      const out: Record<string, unknown> = { type: "number" };
      for (const check of (schema._def as { checks?: { kind: string; value?: number }[] }).checks ?? []) {
        if (check.kind === "min" && (check.value ?? 0) > 0) out.minimum = check.value;
        if (check.kind === "max") out.maximum = check.value;
      }
      return out;
    }
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: [...(schema._def as { values: string[] }).values] };
    case "ZodLiteral": {
      const value = (schema._def as { value: string | number }).value;
      return { type: typeof value === "number" ? "number" : "string", enum: [value] };
    }
    case "ZodObject": {
      const shape = (schema._def as { shape: () => Record<string, z.ZodTypeAny> }).shape();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, field] of Object.entries(shape)) {
        properties[key] = zodToJsonSchema(field);
        if (!isOptionalLike(field)) required.push(key);
      }
      return { type: "object", properties, required: required.length > 0 ? required : undefined };
    }
    case "ZodArray":
      return { type: "array", items: zodToJsonSchema((schema._def as { type: z.ZodTypeAny }).type) };
    case "ZodRecord":
      return {
        type: "object",
        additionalProperties: zodToJsonSchema((schema._def as { valueType: z.ZodTypeAny }).valueType),
      };
    case "ZodUnion": {
      const options = (schema._def as { options?: z.ZodTypeAny[] }).options ?? [];
      if (options.length > 0 && options.every((o) => (o._def as ZodDef).typeName === "ZodLiteral")) {
        return { enum: options.map((o) => (o._def as { value: string | number }).value) };
      }
      return { anyOf: options.map(zodToJsonSchema) };
    }
    default:
      throw new Error(`Schema zod no soportado para el LLM: ${typeName}`);
  }
}

/** Convierte una ToolDefinition del engine al formato de tools de chat.completions */
export function toLlmTool(def: ToolDefinition): LlmTool {
  return {
    type: "function",
    function: {
      name: def.name,
      description: def.description,
      parameters: zodToJsonSchema(def.inputSchema),
    },
  };
}
