import type { z as zod3 } from "zod";
import { z as z4 } from "zod4";

// ============================================================
// Adapter zod v3.25 (engine) → zod v4 (MCP SDK v2)
//
// El MCP SDK v2 espera schemas Standard Schema (zod4 los cumple
// nativamente vía `~standard`); el engine usa zod v3.25 por alias
// npm ("zod" y "zod4" son instancias DISTINTAS — NUNCA mezclar).
// Esta función reconstruye el schema equivalente en zod4
// (field por field, mismo patrón que llmTools.ts), y el executor
// sigue validando SIEMPRE con el zod v3 REAL antes de ejecutar.
//
// Nota deliberada: los transforms (toUpperCase, trim) NO se replican
// acá — la capa MCP solo necesita la forma del contrato (tipos +
// requiredness). Los refinements regex SÍ se replican (formato de
// contrato, ej: month YYYY-MM). La validación fuerte corre igual en
// el engine (gate 5 del executor).
// ============================================================

type Zod3Def = {
  typeName?: string;
  innerType?: zod3.ZodTypeAny;
  schema?: zod3.ZodTypeAny;
  shape?: () => Record<string, zod3.ZodTypeAny>;
  values?: string[];
  value?: string | number;
  type?: zod3.ZodTypeAny;
  checks?: Array<{ kind: string; value?: number; inclusive?: boolean; regex?: RegExp }>;
};

/** Convierte un schema zod v3 del engine a zod4 (falla rápido si es insoportado) */
export function toZod4(schema: zod3.ZodTypeAny): z4.ZodTypeAny {
  const def = schema._def as Zod3Def;
  switch (def.typeName) {
    case "ZodObject": {
      const shape = def.shape?.() ?? {};
      const obj: Record<string, z4.ZodTypeAny> = {};
      for (const [key, field] of Object.entries(shape)) {
        obj[key] = toZod4(field);
      }
      return z4.object(obj);
    }
    case "ZodString": {
      let out = z4.string();
      for (const check of def.checks ?? []) {
        if (check.kind === "min" && check.value !== undefined) out = out.min(check.value);
        if (check.kind === "max" && check.value !== undefined) out = out.max(check.value);
        if (check.kind === "regex" && check.regex !== undefined) out = out.regex(check.regex);
      }
      return out;
    }
    case "ZodNumber": {
      let out = z4.number();
      for (const check of def.checks ?? []) {
        if (check.kind === "int") out = out.int();
        if (check.kind === "min") {
          out = check.inclusive === false ? out.gt(check.value ?? 0) : out.min(check.value ?? 0);
        }
        if (check.kind === "max") {
          out = check.inclusive === false ? out.lt(check.value ?? 0) : out.max(check.value ?? 0);
        }
      }
      return out;
    }
    case "ZodBoolean":
      return z4.boolean();
    case "ZodEnum": {
      const values = (def.values ?? []) as [string, ...string[]];
      return z4.enum(values);
    }
    case "ZodLiteral":
      return z4.literal(def.value as string | number);
    case "ZodArray":
      return z4.array(toZod4(def.type as zod3.ZodTypeAny));
    case "ZodOptional":
      return toZod4(def.innerType as zod3.ZodTypeAny).optional();
    case "ZodDefault":
      // El default lo aplica el executor con el zod v3 REAL; en MCP el
      // campo es opcional (el cliente puede omitirlo y el engine lo llena).
      return toZod4(def.innerType as zod3.ZodTypeAny).optional();
    case "ZodEffects":
      return toZod4((def.innerType ?? def.schema) as zod3.ZodTypeAny);
    default:
      throw new Error(`Schema zod v3 no soportado para MCP: ${String(def.typeName)}`);
  }
}
